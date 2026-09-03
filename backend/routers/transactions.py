"""Transaction CRUD, search, bulk edit and audit history."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import rules
import serializers
import split_engine
from audit import (
    apply_tracked_changes, diff_splits, record_transaction_history,
    splits_created_changes,
)
from database import get_db
from filtering import build_where_clause, visible_transaction_filter
from models import Transaction, TransactionHistory, User
from schemas import (
    BulkUpdateTransactionsRequest, BulkUpdateTransactionsResponse,
    TransactionCreate, TransactionHistoryOut, TransactionOut,
    TransactionSearchRequest, TransactionSearchResponse, TransactionUpdate,
)

router = APIRouter()


@router.get("/api/transactions", response_model=list[TransactionOut])
def get_transactions(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = serializers.transaction_query(db)
    if user_id is not None:
        query = query.filter(visible_transaction_filter(db, user_id))
    results = query.order_by(Transaction.date.desc()).all()
    return [
        serializers.transaction_out(t) for t in results
    ]


@router.post("/api/transactions/search", response_model=TransactionSearchResponse)
def search_transactions(req: TransactionSearchRequest, db: Session = Depends(get_db)):
    query = serializers.transaction_query(db)
    if req.user_id is not None:
        query = query.filter(visible_transaction_filter(db, req.user_id))

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
        serializers.transaction_out(t) for t in results
    ]
    total_pages = max(1, (total + page_size - 1) // page_size)
    return TransactionSearchResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages,
    )


@router.post("/api/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    weights = {w.user_id: w.weight for w in data.split_weights} if data.split_weights else None
    if data.split_weights:
        rules.validate_weights(data.split_weights)
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
    return serializers.transaction_out(serializers.load_transaction(db, transaction.id))


@router.put("/api/transactions/bulk-update", response_model=BulkUpdateTransactionsResponse)
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
        rules.validate_weights(data.update.split_weights)
        weights = {w.user_id: w.weight for w in data.update.split_weights}
    source = data.update.split_source or "custom"

    updated_ids = []
    for transaction in transactions:
        changes = apply_tracked_changes(transaction, non_split_fields)

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


@router.get("/api/transactions/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.id == transaction_id)
    if user_id is not None:
        query = query.filter(visible_transaction_filter(db, user_id))
    transaction = query.first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    return serializers.transaction_out(serializers.load_transaction(db, transaction_id))


@router.put("/api/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: int, data: TransactionUpdate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    existing_splits = {s.user_id: (s.weight, s.source) for s in transaction.splits}

    update_data = data.model_dump(exclude_unset=True)
    split_weights_provided = "split_weights" in update_data
    update_data.pop("split_weights", None)
    update_data.pop("split_source", None)

    changes = apply_tracked_changes(transaction, update_data)

    if split_weights_provided:
        weights = {w.user_id: w.weight for w in data.split_weights} if data.split_weights else None
        if data.split_weights:
            rules.validate_weights(data.split_weights)
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
    return serializers.transaction_out(serializers.load_transaction(db, transaction.id))


@router.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    record_transaction_history(db, transaction, "deleted", actor_user_id)
    db.delete(transaction)
    db.commit()


@router.get("/api/transactions/{transaction_id}/history", response_model=list[TransactionHistoryOut])
def get_transaction_history(transaction_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(TransactionHistory)
        .filter(TransactionHistory.transaction_id == transaction_id)
        .order_by(TransactionHistory.changed_at.asc())
        .all()
    )
    users_by_id = {u.id: u.name for u in db.query(User).all()}
    return [serializers.transaction_history_out(r, users_by_id) for r in rows]
