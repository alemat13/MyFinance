from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

import cache_service
import split_engine
from audit import TRACKED_FIELDS, _jsonify, diff_splits, record_transaction_history, splits_created_changes
from database import get_db
from filtering import build_where_clause, visible_transaction_filter
from models import Account, Category, Transaction, TransactionHistory, TransactionSplit, User
from rules import (
    validate_account_not_archived,
    validate_divide_parts,
    validate_not_divide_sibling,
    validate_resolved_weights_present,
    validate_transaction_weights_present,
    validate_weights,
)
from schemas import (
    BulkDeleteTransactionsRequest,
    BulkDeleteTransactionsResponse,
    BulkUpdateTransactionsRequest,
    BulkUpdateTransactionsResponse,
    TransactionCreate,
    TransactionDivideRequest,
    TransactionDivideResponse,
    TransactionHistoryOut,
    TransactionOut,
    TransactionSearchRequest,
    TransactionSearchResponse,
    TransactionUpdate,
)
from serializers import build_transaction_out_from_row, get_transaction_out

router = APIRouter(prefix="/api/transactions")


@router.get("", response_model=list[TransactionOut])
def get_transactions(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
    if user_id is not None:
        query = query.filter(visible_transaction_filter(db, user_id))
    results = query.order_by(Transaction.date.desc()).all()
    return [
        build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
        for t, account_name, currency, category_name, category_color, category_icon in results
    ]


@router.post("/search", response_model=TransactionSearchResponse)
def search_transactions(req: TransactionSearchRequest, db: Session = Depends(get_db)):
    query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
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
    if req.reconciled is not None:
        query = query.filter(Transaction.reconciled == req.reconciled)

    if req.conditions:
        try:
            where = build_where_clause(req.conditions, req.match_mode)
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        if where is not None:
            query = query.filter(where)

    total = query.count()

    sort_columns = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "payee": Transaction.payee,
        "created_at": Transaction.created_at,
    }
    sort_col = sort_columns[req.sort_by]
    sort_col = sort_col.asc() if req.sort_dir == "asc" else sort_col.desc()

    if req.unpaginated:
        results = query.order_by(sort_col).all()
        items = [
            build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
            for t, account_name, currency, category_name, category_color, category_icon in results
        ]
        return TransactionSearchResponse(
            items=items, total=total, page=1, page_size=len(items), total_pages=1,
        )

    page = max(req.page, 1)
    page_size = min(max(req.page_size, 1), 200)

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


@router.post("", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == data.account_id).first()
    if account is None:
        raise HTTPException(404, "Account not found")
    validate_account_not_archived(account)

    if data.split_weights is None:
        # Not provided: fall back through the category > account > global
        # cascade, same as CSV import already does. Splits are mandatory, and
        # the global tier is a guaranteed non-empty floor, so this only comes
        # up empty if literally no user exists yet.
        source, weights = split_engine.resolve_default_weights(db, data.category_id, data.account_id)
        validate_resolved_weights_present(weights)
        split_source = data.split_source or source or "global"
    else:
        validate_transaction_weights_present(data.split_weights)
        validate_weights(data.split_weights)
        weights = {w.user_id: w.weight for w in data.split_weights}
        split_source = data.split_source or "custom"

    transaction = Transaction(
        date=data.date, payee=data.payee, memo=data.memo, amount=data.amount,
        account_id=data.account_id, category_id=data.category_id,
        accounting_month_offset=data.accounting_month_offset,
    )
    db.add(transaction)
    db.flush()
    split_engine.apply_split(db, transaction, weights, source=split_source)
    record_transaction_history(db, transaction, "created", actor_user_id, source="manual",
                                changes=splits_created_changes(weights, split_source))
    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return get_transaction_out(db, transaction.id)


@router.put("/bulk-update", response_model=BulkUpdateTransactionsResponse)
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
    if split_weights_provided:
        validate_transaction_weights_present(data.update.split_weights)
        validate_weights(data.update.split_weights)
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

    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return BulkUpdateTransactionsResponse(updated_count=len(updated_ids), transaction_ids=updated_ids)


@router.delete("/bulk-delete", response_model=BulkDeleteTransactionsResponse)
def bulk_delete_transactions(data: BulkDeleteTransactionsRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    # Registered before the /{transaction_id} DELETE route below, for the same
    # route-registration-order reason documented on bulk_update_transactions
    # above: {transaction_id} would otherwise greedily match "bulk-delete" and
    # 422 on int conversion before this route is ever tried.
    if not data.transaction_ids:
        raise HTTPException(422, "transaction_ids must not be empty")

    # Validate everything before mutating anything, same discipline as
    # bulk_update_transactions: a missing id 404s without partially deleting
    # the batch.
    transactions = db.query(Transaction).filter(Transaction.id.in_(data.transaction_ids)).all()
    found_ids = {t.id for t in transactions}
    missing_ids = sorted(set(data.transaction_ids) - found_ids)
    if missing_ids:
        raise HTTPException(404, f"Transaction(s) not found: {missing_ids}")

    deleted_ids = []
    for transaction in transactions:
        record_transaction_history(db, transaction, "deleted", actor_user_id)
        db.delete(transaction)
        deleted_ids.append(transaction.id)

    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return BulkDeleteTransactionsResponse(deleted_count=len(deleted_ids), transaction_ids=deleted_ids)


@router.get("/{transaction_id}", response_model=TransactionOut)
def get_transaction(transaction_id: int, user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Transaction).filter(Transaction.id == transaction_id)
    if user_id is not None:
        query = query.filter(visible_transaction_filter(db, user_id))
    transaction = query.first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    return get_transaction_out(db, transaction_id)


@router.put("/{transaction_id}", response_model=TransactionOut)
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
        validate_transaction_weights_present(data.split_weights)
        validate_weights(data.split_weights)
        weights = {w.user_id: w.weight for w in data.split_weights}
        source = data.split_source or "custom"
    elif existing_splits:
        # Client didn't touch the split editor: keep the existing weights,
        # but still recompute share_amount against whatever else changed
        # (e.g. a new amount) — this is what removes the old manual-freeze 422.
        weights = {uid: w for uid, (w, _) in existing_splits.items()}
        source = next(s for _, s in existing_splits.values())
    else:
        # The transaction somehow has no split at all (e.g. a data artefact
        # predating mandatory splits) — heal it via the same category >
        # account > global cascade used on create, rather than silently
        # leaving it unsplit forever.
        resolved_source, weights = split_engine.resolve_default_weights(db, transaction.category_id, transaction.account_id)
        validate_resolved_weights_present(weights)
        source = resolved_source or "global"

    new_splits = {uid: (w, source) for uid, w in (weights or {}).items()}
    splits_diff = diff_splits(existing_splits, new_splits)
    if splits_diff:
        changes["splits"] = splits_diff

    split_engine.apply_split(db, transaction, weights, source)
    if changes:
        record_transaction_history(db, transaction, "updated", actor_user_id, changes=changes)
    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return get_transaction_out(db, transaction.id)


@router.delete("/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    record_transaction_history(db, transaction, "deleted", actor_user_id)
    db.delete(transaction)
    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()


@router.post("/{transaction_id}/divide", response_model=TransactionDivideResponse)
def divide_transaction(transaction_id: int, data: TransactionDivideRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    # Divides one transaction's amount into several new transactions (by
    # category/date) — unrelated to split_weights, which divides a
    # transaction's amount among users. The original row is reused as part 1
    # (keeps its id and history trail); parts 2..N are new rows on the same
    # account, all tagged with the anchor's id as divide_group_id.
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    validate_not_divide_sibling(transaction)
    validate_account_not_archived(transaction.account)
    validate_divide_parts(data.parts, transaction.amount)

    # Resolve/validate every part's split weights before mutating anything,
    # same "validate everything before mutating anything" discipline as
    # bulk_update_transactions above.
    resolved = []
    for part in data.parts:
        if part.split_weights is None:
            source, weights = split_engine.resolve_default_weights(db, part.category_id, transaction.account_id)
            validate_resolved_weights_present(weights)
            split_source = part.split_source or source or "global"
        else:
            validate_transaction_weights_present(part.split_weights)
            validate_weights(part.split_weights)
            weights = {w.user_id: w.weight for w in part.split_weights}
            split_source = part.split_source or "custom"
        resolved.append((weights, split_source))

    first_part = data.parts[0]
    first_weights, first_source = resolved[0]

    existing_splits = {s.user_id: (s.weight, s.source) for s in transaction.splits}
    old_values = {f: getattr(transaction, f) for f in TRACKED_FIELDS}
    transaction.date = first_part.date
    transaction.payee = first_part.payee
    transaction.memo = first_part.memo
    transaction.amount = first_part.amount
    transaction.category_id = first_part.category_id
    transaction.accounting_month_offset = first_part.accounting_month_offset
    transaction.divide_group_id = transaction.id
    changes = {
        f: {"old": _jsonify(old), "new": _jsonify(getattr(transaction, f))}
        for f, old in old_values.items() if old != getattr(transaction, f)
    }
    new_splits = {uid: (w, first_source) for uid, w in first_weights.items()}
    splits_diff = diff_splits(existing_splits, new_splits)
    if splits_diff:
        changes["splits"] = splits_diff
    split_engine.apply_split(db, transaction, first_weights, first_source)
    if changes:
        record_transaction_history(db, transaction, "updated", actor_user_id, source="divide", changes=changes)

    created = [transaction]
    for part, (weights, split_source) in zip(data.parts[1:], resolved[1:]):
        new_transaction = Transaction(
            date=part.date, payee=part.payee, memo=part.memo, amount=part.amount,
            account_id=transaction.account_id, category_id=part.category_id,
            accounting_month_offset=part.accounting_month_offset,
            divide_group_id=transaction.id,
        )
        db.add(new_transaction)
        db.flush()
        split_engine.apply_split(db, new_transaction, weights, split_source)
        record_transaction_history(db, new_transaction, "created", actor_user_id, source="divide",
                                    changes=splits_created_changes(weights, split_source))
        created.append(new_transaction)

    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return TransactionDivideResponse(transactions=[get_transaction_out(db, t.id) for t in created])


@router.get("/{transaction_id}/divide-siblings", response_model=list[TransactionOut])
def get_divide_siblings(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    if transaction.divide_group_id is None:
        return []
    siblings = (
        db.query(Transaction)
        .filter(Transaction.divide_group_id == transaction.divide_group_id, Transaction.id != transaction_id)
        .order_by(Transaction.date.asc())
        .all()
    )
    return [get_transaction_out(db, t.id) for t in siblings]


@router.get("/{transaction_id}/history", response_model=list[TransactionHistoryOut])
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
