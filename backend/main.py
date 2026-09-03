import logging
import os
import sys
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Form, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session, joinedload, selectinload
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError

from database import get_db, engine, Base, sync_schema
from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight, AccountSplitWeight, TransactionSplit, TransactionHistory,
)
from schemas import (
    AccountOut, AccountCreate, AccountUpdate,
    CategoryOut, CategoryCreate, CategoryUpdate,
    CategorySplitCreate,
    TransactionOut, TransactionCreate, TransactionUpdate,
    TransactionHistoryOut,
    TransactionSearchRequest, TransactionSearchResponse,
    BulkUpdateTransactionsRequest, BulkUpdateTransactionsResponse,
    DashboardResponse,
    CategoryChartItem, MonthChartItem, NetMonthChartItem, ChartsResponse,
    UserOut, UserCreate, UserUpdate,
    AccountUserCreate,
    GlobalSplitWeightOut, GlobalSplitWeightUpdateItem,
    AccountSplitWeightOut, AccountSplitWeightUpdateItem,
    UserBalanceOut,
    ImportDetectResponse, ImportPreviewRequest, ImportPreviewRow, ImportCommitRequest, ImportCommitResponse,
    ImportSummary,
)
import split_engine
import charts
import backup
from filtering import build_where_clause
from import_csv import detect_import_settings, preview_import
from audit import record_transaction_history, TRACKED_FIELDS, _jsonify, diff_splits, splits_created_changes
from serializers import (
    build_account_out,
    build_category_out,
    build_split_weight_rows,
    build_transaction_out_from_row,
    get_transaction_out,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if "pytest" not in sys.modules:
        Base.metadata.create_all(bind=engine)
        sync_schema(engine)
    yield


app = FastAPI(title="Personal Finance Manager API", lifespan=lifespan)

_default_cors_origins = (
    "http://localhost:5173,"
    "http://100.127.164.124:5173,"
    "http://surfacealex.tail047989.ts.net:5173"
)
allow_origins = os.environ.get("CORS_ALLOWED_ORIGINS", _default_cors_origins).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
def _handle_integrity_error(request, exc):
    message = str(exc.orig).upper()
    if "UNIQUE" in message:
        detail = "A record with this value already exists"
    elif "FOREIGN KEY" in message:
        detail = "Data integrity error: referenced record may not exist"
    else:
        detail = "Data integrity error"
    return JSONResponse(status_code=409, content={"detail": detail})


@app.exception_handler(RequestValidationError)
def _handle_validation_error(request, exc):
    parts = []
    for err in exc.errors():
        loc = err.get("loc", ())
        field_loc = loc[1:] if loc and loc[0] in ("body", "query", "path") else loc
        field = ".".join(str(p) for p in field_loc) if field_loc else "value"
        msg = err.get("msg", "Invalid value")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, "):]
        parts.append(f"{field}: {msg}")
    detail = "; ".join(parts) if parts else "Invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(Exception)
def _handle_unexpected_error(request, exc):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


# ── Helpers ────────────────────────────────────────────────────────

def _visible_transaction_filter(db: Session, user_id: int):
    """Transactions visible to user_id: in an account they own, or bearing a split share for them."""
    owned_account_ids = db.query(AccountUser.account_id).filter(
        AccountUser.user_id == user_id, AccountUser.ownership_percentage > 0
    )
    split_txn_ids = db.query(TransactionSplit.transaction_id).filter(
        TransactionSplit.user_id == user_id
    )
    return or_(
        Transaction.account_id.in_(owned_account_ids),
        Transaction.id.in_(split_txn_ids),
    )


def _sync_account_users(db: Session, account: Account, users: list[AccountUserCreate]):
    db.query(AccountUser).filter(AccountUser.account_id == account.id).delete()
    for u in users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))


def _validate_ownership(users: list[AccountUserCreate]):
    if users:
        total = sum(u.ownership_percentage for u in users)
        if abs(total - 100.0) > 0.01:
            raise HTTPException(422, f"Ownership percentages must sum to 100, got {total}")


def _validate_users_exist(db: Session, users: list[AccountUserCreate]):
    if not users:
        return
    requested_ids = {u.user_id for u in users}
    existing_ids = {uid for (uid,) in db.query(User.id).filter(User.id.in_(requested_ids)).all()}
    missing = sorted(requested_ids - existing_ids)
    if missing:
        raise HTTPException(422, f"Unknown user_id(s): {missing}")


def _sync_category_splits(db: Session, category: Category, splits: list[CategorySplitCreate]):
    db.query(CategorySplit).filter(CategorySplit.category_id == category.id).delete()
    for s in splits:
        db.add(CategorySplit(
            category_id=category.id,
            user_id=s.user_id,
            weight=s.weight,
        ))


def _validate_weights(items: list) -> None:
    if any(item.weight < 0 for item in items):
        raise HTTPException(422, "Weights must be >= 0")
    if items and sum(item.weight for item in items) <= 0:
        raise HTTPException(422, "At least one weight must be greater than 0")
    user_ids = [item.user_id for item in items]
    if len(user_ids) != len(set(user_ids)):
        raise HTTPException(422, "Duplicate user_id in weights")


def _validate_category_hierarchy(db: Session, category: Category | None, parent_id: int | None, type_: str) -> None:
    """Enforces the 2-level category hierarchy: a category may have a parent,
    but that parent must itself be top-level, and a subcategory's type must
    match its parent's. `category` is the category being updated (None on
    create)."""
    if parent_id is None:
        return
    if category is not None:
        if parent_id == category.id:
            raise HTTPException(422, "A category cannot be its own parent")
        if category.children:
            raise HTTPException(422, "Cannot set a parent on a category that has its own subcategories")
    parent = db.query(Category).filter(Category.id == parent_id).first()
    if not parent:
        raise HTTPException(422, f"Parent category {parent_id} not found")
    if parent.parent_id is not None:
        raise HTTPException(422, "Only 2 levels of categories are allowed")
    if parent.type != type_:
        raise HTTPException(422, "Subcategory type must match its parent category's type")


def _sync_account_split_weights(db: Session, account: Account, weights: list[AccountSplitWeightUpdateItem]):
    db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account.id).delete()
    for w in weights:
        db.add(AccountSplitWeight(
            account_id=account.id,
            user_id=w.user_id,
            weight=w.weight,
        ))


# ── Users ──────────────────────────────────────────────────────────

@app.get("/api/users", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.put("/api/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.account_associations:
        raise HTTPException(409, "Cannot delete user who owns accounts")
    db.query(CategorySplit).filter(CategorySplit.user_id == user_id).delete()
    db.query(GlobalSplitWeight).filter(GlobalSplitWeight.user_id == user_id).delete()
    db.query(AccountSplitWeight).filter(AccountSplitWeight.user_id == user_id).delete()
    db.query(TransactionSplit).filter(TransactionSplit.user_id == user_id).delete()
    db.delete(user)
    db.commit()


# ── Accounts ──────────────────────────────────────────────────────

@app.get("/api/accounts", response_model=list[AccountOut])
def get_accounts(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Account).options(
        selectinload(Account.user_associations).joinedload(AccountUser.user),
        selectinload(Account.split_weight_associations).joinedload(AccountSplitWeight.user),
    )
    if user_id is not None:
        query = query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = query.all()
    return [build_account_out(a) for a in accounts]


@app.post("/api/accounts", response_model=AccountOut, status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    _validate_ownership(data.users)
    _validate_users_exist(db, data.users)
    account = Account(name=data.name, type=data.type, balance=data.balance, currency=data.currency)
    db.add(account)
    db.flush()
    for u in data.users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))
    db.commit()
    db.refresh(account)
    return build_account_out(account)


@app.put("/api/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("users", None)
    if data.users is not None:
        _validate_ownership(data.users)
        _validate_users_exist(db, data.users)
        _sync_account_users(db, account, data.users)
    for field, value in update_data.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return build_account_out(account)


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    if account.transactions:
        raise HTTPException(409, "Cannot delete account with existing transactions")
    db.delete(account)
    db.commit()


# ── Categories ────────────────────────────────────────────────────

@app.get("/api/categories", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).options(
        joinedload(Category.parent),
        selectinload(Category.splits).joinedload(CategorySplit.user),
    ).all()
    return [build_category_out(c) for c in categories]


@app.post("/api/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    _validate_weights(data.splits)
    _validate_category_hierarchy(db, None, data.parent_id, data.type)
    category = Category(name=data.name, type=data.type, color=data.color, icon=data.icon, parent_id=data.parent_id)
    db.add(category)
    db.flush()
    _sync_category_splits(db, category, data.splits)
    db.commit()
    db.refresh(category)
    return build_category_out(category)


@app.put("/api/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    update_data = data.model_dump(exclude_unset=True)
    splits_data = update_data.pop("splits", None)
    if splits_data is not None:
        _validate_weights(data.splits)

    if "type" in update_data and update_data["type"] != category.type and category.children:
        raise HTTPException(422, "Cannot change type of a category with existing subcategories")

    if "parent_id" in update_data:
        effective_type = update_data.get("type", category.type)
        _validate_category_hierarchy(db, category, update_data["parent_id"], effective_type)
    elif "type" in update_data and category.parent_id is not None:
        if category.parent and category.parent.type != update_data["type"]:
            raise HTTPException(422, "Subcategory type must match its parent category's type")

    if splits_data is not None:
        _sync_category_splits(db, category, data.splits)
    for field, value in update_data.items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return build_category_out(category)


@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    if category.transactions:
        raise HTTPException(409, "Cannot delete category with existing transactions")
    if category.children:
        raise HTTPException(409, "Cannot delete category with existing subcategories")
    db.delete(category)
    db.commit()


# ── Transactions ──────────────────────────────────────────────────

@app.get("/api/transactions", response_model=list[TransactionOut])
def get_transactions(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
    if user_id is not None:
        query = query.filter(_visible_transaction_filter(db, user_id))
    results = query.order_by(Transaction.date.desc()).all()
    return [
        build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
        for t, account_name, currency, category_name, category_color, category_icon in results
    ]


@app.post("/api/transactions/search", response_model=TransactionSearchResponse)
def search_transactions(req: TransactionSearchRequest, db: Session = Depends(get_db)):
    query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
    if req.user_id is not None:
        query = query.filter(_visible_transaction_filter(db, req.user_id))

    if req.search:
        like = f"%{req.search.lower()}%"
        query = query.filter(or_(
            func.lower(Transaction.payee).like(like),
            func.lower(Transaction.memo).like(like),
        ))
    if req.date_from is not None:
        query = query.filter(Transaction.date >= req.date_from)
    if req.date_to is not None:
        query = query.filter(Transaction.date <= req.date_to)
    if req.account_id is not None:
        query = query.filter(Transaction.account_id == req.account_id)
    if req.category_id is not None:
        query = query.filter(Transaction.category_id == req.category_id)
    if req.amount_min is not None:
        query = query.filter(Transaction.amount >= req.amount_min)
    if req.amount_max is not None:
        query = query.filter(Transaction.amount <= req.amount_max)

    if req.conditions:
        try:
            where = build_where_clause(req.conditions, req.match_mode)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if where is not None:
            query = query.filter(where)

    total = query.count()

    page = max(req.page, 1)
    page_size = min(max(req.page_size, 1), 200)

    sort_columns = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "payee": Transaction.payee,
        "created_at": Transaction.created_at,
    }
    sort_col = sort_columns[req.sort_by]
    sort_col = sort_col.asc() if req.sort_dir == "asc" else sort_col.desc()

    results = (
        query.order_by(sort_col)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
        for t, account_name, currency, category_name, category_color, category_icon in results
    ]
    total_pages = max(1, (total + page_size - 1) // page_size)
    return TransactionSearchResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages,
    )


@app.post("/api/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    weights = {w.user_id: w.weight for w in data.split_weights} if data.split_weights else None
    if data.split_weights:
        _validate_weights(data.split_weights)
    transaction = Transaction(
        date=data.date, payee=data.payee, memo=data.memo, amount=data.amount,
        account_id=data.account_id, category_id=data.category_id,
        accounting_month_offset=data.accounting_month_offset,
    )
    db.add(transaction)
    db.flush()
    split_source = data.split_source or "custom"
    split_engine.apply_split(db, transaction, weights, source=split_source)
    record_transaction_history(db, transaction, "created", actor_user_id, source="manual",
                                changes=splits_created_changes(weights, split_source))
    db.commit()
    return get_transaction_out(db, transaction.id)


@app.put("/api/transactions/bulk-update", response_model=BulkUpdateTransactionsResponse)
def bulk_update_transactions(data: BulkUpdateTransactionsRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    # Registered before the /{transaction_id} routes below: Starlette matches
    # routes in registration order, and {transaction_id} (typed int) would
    # otherwise greedily match the literal "bulk-update" segment and 422 on
    # int conversion before this route is ever tried.
    if not data.transaction_ids:
        raise HTTPException(422, "transaction_ids must not be empty")

    update_data = data.update.model_dump(exclude_unset=True)
    split_weights_provided = "split_weights" in update_data
    non_split_fields = {k: v for k, v in update_data.items() if k not in ("split_weights", "split_source")}

    if not non_split_fields and not split_weights_provided:
        raise HTTPException(422, "At least one field must be set to apply")

    # Validate everything before mutating anything, so a missing id or an
    # invalid weight set 422s/404s without partially applying the batch.
    transactions = db.query(Transaction).filter(Transaction.id.in_(data.transaction_ids)).all()
    found_ids = {t.id for t in transactions}
    missing_ids = sorted(set(data.transaction_ids) - found_ids)
    if missing_ids:
        raise HTTPException(404, f"Transaction(s) not found: {missing_ids}")

    weights = None
    if split_weights_provided and data.update.split_weights:
        _validate_weights(data.update.split_weights)
        weights = {w.user_id: w.weight for w in data.update.split_weights}
    source = data.update.split_source or "custom"

    updated_ids = []
    for transaction in transactions:
        old_values = {f: getattr(transaction, f) for f in non_split_fields if f in TRACKED_FIELDS}
        for field, value in non_split_fields.items():
            setattr(transaction, field, value)
        changes = {
            f: {"old": _jsonify(old), "new": _jsonify(getattr(transaction, f))}
            for f, old in old_values.items() if old != getattr(transaction, f)
        }

        if split_weights_provided:
            existing_splits = {s.user_id: (s.weight, s.source) for s in transaction.splits}
            new_splits = {uid: (w, source) for uid, w in (weights or {}).items()}
            splits_diff = diff_splits(existing_splits, new_splits)
            if splits_diff:
                changes["splits"] = splits_diff
            split_engine.apply_split(db, transaction, weights, source)

        if changes:
            record_transaction_history(db, transaction, "updated", actor_user_id, changes=changes)
        updated_ids.append(transaction.id)

    db.commit()
    return BulkUpdateTransactionsResponse(updated_count=len(updated_ids), transaction_ids=updated_ids)


@app.get("/api/transactions/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.id == transaction_id)
    if user_id is not None:
        query = query.filter(_visible_transaction_filter(db, user_id))
    transaction = query.first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    return get_transaction_out(db, transaction_id)


@app.put("/api/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: int, data: TransactionUpdate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    existing_splits = {s.user_id: (s.weight, s.source) for s in transaction.splits}

    update_data = data.model_dump(exclude_unset=True)
    split_weights_provided = "split_weights" in update_data
    update_data.pop("split_weights", None)
    update_data.pop("split_source", None)

    old_values = {f: getattr(transaction, f) for f in update_data if f in TRACKED_FIELDS}
    for field, value in update_data.items():
        setattr(transaction, field, value)
    changes = {
        f: {"old": _jsonify(old), "new": _jsonify(getattr(transaction, f))}
        for f, old in old_values.items() if old != getattr(transaction, f)
    }

    if split_weights_provided:
        weights = {w.user_id: w.weight for w in data.split_weights} if data.split_weights else None
        if data.split_weights:
            _validate_weights(data.split_weights)
        source = data.split_source or "custom"
    else:
        # Client didn't touch the split editor: keep the existing weights,
        # but still recompute share_amount against whatever else changed
        # (e.g. a new amount) — this is what removes the old manual-freeze 422.
        weights = {uid: w for uid, (w, _) in existing_splits.items()} or None
        source = next((s for _, s in existing_splits.values()), "custom")

    new_splits = {uid: (w, source) for uid, w in (weights or {}).items()}
    splits_diff = diff_splits(existing_splits, new_splits)
    if splits_diff:
        changes["splits"] = splits_diff

    split_engine.apply_split(db, transaction, weights, source)
    if changes:
        record_transaction_history(db, transaction, "updated", actor_user_id, changes=changes)
    db.commit()
    return get_transaction_out(db, transaction.id)


@app.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    record_transaction_history(db, transaction, "deleted", actor_user_id)
    db.delete(transaction)
    db.commit()


@app.get("/api/transactions/{transaction_id}/history", response_model=list[TransactionHistoryOut])
def get_transaction_history(transaction_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(TransactionHistory)
        .filter(TransactionHistory.transaction_id == transaction_id)
        .order_by(TransactionHistory.changed_at.asc())
        .all()
    )
    users_by_id = {u.id: u.name for u in db.query(User).all()}
    return [
        TransactionHistoryOut(
            id=r.id, transaction_id=r.transaction_id, action=r.action, source=r.source,
            changed_at=r.changed_at, changed_by_user_id=r.changed_by_user_id,
            changed_by_user_name=users_by_id.get(r.changed_by_user_id),
            date=r.date, payee=r.payee, memo=r.memo, amount=r.amount,
            account_id=r.account_id, category_id=r.category_id, changes=r.changes,
        )
        for r in rows
    ]


# ── Split weights, preview, balances ─────────────────────────────

@app.get("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def get_split_weights(db: Session = Depends(get_db)):
    weights_by_user = {w.user_id: w.weight for w in db.query(GlobalSplitWeight).all()}
    return build_split_weight_rows(weights_by_user, db.query(User).all(), GlobalSplitWeightOut)


@app.put("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def update_split_weights(data: list[GlobalSplitWeightUpdateItem], db: Session = Depends(get_db)):
    _validate_weights(data)
    db.query(GlobalSplitWeight).delete()
    for w in data:
        db.add(GlobalSplitWeight(user_id=w.user_id, weight=w.weight))
    db.commit()
    return get_split_weights(db)


@app.get("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def get_account_split_weights(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    weights_by_user = {w.user_id: w.weight for w in db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account_id).all()}
    return build_split_weight_rows(weights_by_user, db.query(User).all(), AccountSplitWeightOut)


@app.put("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def update_account_split_weights(account_id: int, data: list[AccountSplitWeightUpdateItem], db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    _validate_weights(data)
    _sync_account_split_weights(db, account, data)
    db.commit()
    return get_account_split_weights(account_id, db)


@app.get("/api/balances", response_model=list[UserBalanceOut])
def get_balances(db: Session = Depends(get_db)):
    return [
        UserBalanceOut(user_id=user_id, user_name=user_name, currency=currency, net_position=net_position)
        for user_id, user_name, currency, net_position in split_engine.compute_balances(db)
    ]


# ── CSV import ────────────────────────────────────────────────────

@app.post("/api/import/detect", response_model=ImportDetectResponse)
async def import_detect(file: UploadFile = File(...)):
    contents = await file.read()
    return detect_import_settings(contents)


@app.post("/api/import/preview", response_model=list[ImportPreviewRow])
async def import_preview(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    encoding: str = Form(...),
    delimiter: str = Form(...),
    date_format: str = Form(...),
    decimal_separator: str = Form(...),
    date_col: str = Form(...),
    payee_col: str = Form(...),
    amount_col: str = Form(...),
    memo_col: str | None = Form(None),
    category_col: str | None = Form(None),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    data = ImportPreviewRequest(
        account_id=account_id, encoding=encoding, delimiter=delimiter,
        date_format=date_format, decimal_separator=decimal_separator,
        date_col=date_col, payee_col=payee_col, amount_col=amount_col,
        memo_col=memo_col, category_col=category_col,
    )
    try:
        return preview_import(db, contents, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@app.post("/api/import/commit", response_model=ImportCommitResponse)
def import_commit(data: ImportCommitRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    for row in data.rows:
        if row.split_weights:
            _validate_weights(row.split_weights)

    transaction_ids = []
    for row in data.rows:
        if row.split_weights is not None:
            weights = {w.user_id: w.weight for w in row.split_weights} or None
            source = row.split_source or "custom"
        else:
            source, weights = split_engine.resolve_default_weights(db, row.category_id, row.account_id)
            source = source or "custom"
        transaction = Transaction(
            date=row.date, payee=row.payee, memo=row.memo, amount=row.amount,
            account_id=row.account_id, category_id=row.category_id,
            accounting_month_offset=row.accounting_month_offset,
        )
        db.add(transaction)
        db.flush()
        split_engine.apply_split(db, transaction, weights or None, source)
        record_transaction_history(db, transaction, "created", actor_user_id, source="csv_import",
                                    changes=splits_created_changes(weights, source))
        transaction_ids.append(transaction.id)

    db.commit()
    return ImportCommitResponse(created_count=len(transaction_ids), transaction_ids=transaction_ids)


# ── Full database backup (export/import) ─────────────────────────

@app.get("/api/backup/export")
def export_backup(db: Session = Depends(get_db)):
    zip_bytes = backup.export_to_zip_bytes(db)
    filename = f"myfinance-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.post("/api/backup/import", response_model=ImportSummary)
async def import_backup(
    mode: Literal["overwrite", "append"] = Query("overwrite"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    try:
        data = backup.parse_zip_bytes(contents)
        return backup.import_database(db, data, mode)
    except backup.BackupFormatError as exc:
        raise HTTPException(422, str(exc))


# ── Dashboard ─────────────────────────────────────────────────────

@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    accounts_query = db.query(Account).options(
        selectinload(Account.user_associations).joinedload(AccountUser.user),
        selectinload(Account.split_weight_associations).joinedload(AccountSplitWeight.user),
    )
    if user_id is not None:
        accounts_query = accounts_query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = accounts_query.all()

    tx_query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
    if user_id is not None:
        tx_query = tx_query.filter(_visible_transaction_filter(db, user_id))
    recent_results = tx_query.order_by(Transaction.date.desc()).limit(10).all()

    recent_transactions = [
        build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
        for t, account_name, currency, category_name, category_color, category_icon in recent_results
    ]

    balances = [
        UserBalanceOut(user_id=uid, user_name=user_name, currency=currency, net_position=net_position)
        for uid, user_name, currency, net_position in split_engine.compute_balances(db, user_id=user_id)
    ]

    return DashboardResponse(
        accounts=[build_account_out(a) for a in accounts],
        recent_transactions=recent_transactions,
        balances=balances,
    )


# ── Charts ────────────────────────────────────────────────────────

@app.get("/api/charts", response_model=ChartsResponse)
def get_charts(
    user_id: int = Query(...),
    currency: str | None = Query(None),
    db: Session = Depends(get_db),
):
    by_category, by_month, net_by_month = charts.compute_chart_data(db, user_id, currency)
    currencies = sorted({c.currency for c in by_category} | {m.currency for m in by_month})
    return ChartsResponse(
        currencies=currencies,
        by_category=[
            CategoryChartItem(
                category_id=c.category_id, category_name=c.category_name,
                category_type=c.category_type, color=c.color, amount=c.amount, currency=c.currency,
            )
            for c in by_category
        ],
        by_month=[
            MonthChartItem(
                month=m.month, income=m.income, expense=round(abs(m.expense), 2),
                uncategorized=m.uncategorized, currency=m.currency,
            )
            for m in by_month
        ],
        net_by_month=[
            NetMonthChartItem(month=n.month, net=n.net, currency=n.currency)
            for n in net_by_month
        ],
    )
