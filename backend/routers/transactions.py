from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

import cache_service
import split_engine
from audit import TRACKED_FIELDS, _jsonify, diff_splits, record_transaction_history, splits_created_changes
from database import get_db
from filtering import apply_transaction_filters, build_where_clause, visible_transaction_filter
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
    TransactionRawFieldsUpdate,
    TransactionSearchRequest,
    TransactionSearchResponse,
    TransactionUpdate,
)
from serializers import build_transaction_out_from_row, get_transaction_out

router = APIRouter(prefix="/api/transactions")

# Rows per commit in bulk-update; see the comment where it is used.
BULK_UPDATE_CHUNK_SIZE = 1500
PAYEE_MAX_LENGTH = Transaction.__table__.c.payee.type.length


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
    try:
        query = apply_transaction_filters(query, req, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    total = query.count()

    sort_columns = {
        "date": Transaction.date,
        "amount": Transaction.amount,
        "payee": Transaction.payee,
        "created_at": Transaction.created_at,
    }
    sort_col = sort_columns[req.sort_by]
    # id breaks ties (many rows share a date) so pages never overlap or skip a
    # row, in the same direction so flipping the order flips the whole list.
    if req.sort_dir == "asc":
        sort_cols = (sort_col.asc(), Transaction.id.asc())
    else:
        sort_cols = (sort_col.desc(), Transaction.id.desc())

    if req.unpaginated:
        results = query.order_by(*sort_cols).all()
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
        query.order_by(*sort_cols)
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
        # Not provided: fall back through the account > category > global
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


def _resolve_bulk_target_ids(db: Session, transaction_ids: list[int], filter_req, expected_count: int | None) -> list[int]:
    """The ids a bulk request acts on: either the ticked ids (404 if any is
    missing) or every row the filter matches (409 if that is no longer
    expected_count). Validated before anything is mutated, so a selection that
    moved fails without partially applying the batch."""
    if filter_req is not None and transaction_ids:
        raise HTTPException(422, "Send either transaction_ids or filter, not both")
    if filter_req is None and not transaction_ids:
        raise HTTPException(422, "transaction_ids must not be empty")
    if filter_req is not None:
        try:
            id_query = apply_transaction_filters(
                db.query(Transaction.id).join(Account, Transaction.account_id == Account.id),
                filter_req, db,
            )
        except ValueError as e:
            raise HTTPException(status_code=422, detail=str(e))
        target_ids = sorted(row[0] for row in id_query.all())
        if not target_ids:
            raise HTTPException(422, "No transaction matches this filter")
        if expected_count is not None and expected_count != len(target_ids):
            raise HTTPException(
                409,
                f"The filter now matches {len(target_ids)} transactions instead of {expected_count}; "
                "reload the list and try again",
            )
        return target_ids
    target_ids = sorted(set(transaction_ids))
    found_ids = {
        row[0] for row in db.query(Transaction.id).filter(Transaction.id.in_(target_ids)).all()
    }
    missing_ids = sorted(set(target_ids) - found_ids)
    if missing_ids:
        raise HTTPException(404, f"Transaction(s) not found: {missing_ids}")
    return target_ids


def _validate_bulk_move(db: Session, target_ids: list[int], account_id: int) -> None:
    """A move must not break the (account_id, external_id) unique index that
    bank-sync deduplication rests on: neither against a bank row the target
    account already has, nor between two moved rows from different accounts."""
    if db.get(Account, account_id) is None:
        raise HTTPException(422, f"Account {account_id} does not exist")
    moved_external_ids: dict[str, int] = {}
    for start in range(0, len(target_ids), BULK_UPDATE_CHUNK_SIZE):
        chunk_ids = target_ids[start:start + BULK_UPDATE_CHUNK_SIZE]
        rows = (
            db.query(Transaction.id, Transaction.external_id)
            .filter(Transaction.id.in_(chunk_ids), Transaction.external_id.isnot(None))
            .all()
        )
        for tx_id, external_id in rows:
            if external_id in moved_external_ids:
                raise HTTPException(
                    409,
                    f"Transactions {moved_external_ids[external_id]} and {tx_id} carry the same bank id "
                    "and cannot both be on one account",
                )
            moved_external_ids[external_id] = tx_id
    if not moved_external_ids:
        return
    target_set = set(target_ids)
    clashes = sorted(
        tx_id for tx_id, external_id in
        db.query(Transaction.id, Transaction.external_id)
        .filter(Transaction.account_id == account_id, Transaction.external_id.isnot(None))
        .all()
        if external_id in moved_external_ids and tx_id not in target_set
    )
    if clashes:
        raise HTTPException(
            409,
            f"The target account already has the same bank transaction(s) as the selection: {clashes[:20]}",
        )


@router.put("/bulk-update", response_model=BulkUpdateTransactionsResponse)
def bulk_update_transactions(data: BulkUpdateTransactionsRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    # Registered before the /{transaction_id} routes below: Starlette matches
    # routes in registration order, and {transaction_id} (typed int) would
    # otherwise greedily match the literal "bulk-update" segment and 422 on
    # int conversion before this route is ever tried.
    update_data = data.update.model_dump(exclude_unset=True)
    split_weights_provided = "split_weights" in update_data
    payee_mode = update_data.pop("payee_mode", "replace")
    non_split_fields = {k: v for k, v in update_data.items() if k not in ("split_weights", "split_source")}

    if not non_split_fields and not split_weights_provided:
        raise HTTPException(422, "At least one field must be set to apply")

    target_ids = _resolve_bulk_target_ids(db, data.transaction_ids, data.filter, data.expected_count)
    if "account_id" in non_split_fields:
        if non_split_fields["account_id"] is None:
            raise HTTPException(422, "account_id cannot be cleared")
        _validate_bulk_move(db, target_ids, non_split_fields["account_id"])
    payee_affix = None
    if "payee" in non_split_fields:
        payee = non_split_fields["payee"] or ""
        if not payee.strip():
            raise HTTPException(422, "payee cannot be blank")
        if payee_mode == "replace":
            non_split_fields["payee"] = payee.strip()
        else:
            # Prepend/append: each row keeps its own payee around the text, so
            # it can't be one value set on every row like the other fields.
            payee_affix = non_split_fields.pop("payee")
            longest = (
                db.query(func.max(func.length(Transaction.payee)))
                .filter(Transaction.id.in_(target_ids)).scalar() or 0
            ) if target_ids else 0
            if longest + len(payee_affix) > PAYEE_MAX_LENGTH:
                raise HTTPException(
                    422, f"payee would exceed {PAYEE_MAX_LENGTH} characters on at least one transaction")

    weights = None
    if split_weights_provided:
        validate_transaction_weights_present(data.update.split_weights)
        validate_weights(data.update.split_weights)
        weights = {w.user_id: w.weight for w in data.update.split_weights}
    source = data.update.split_source or "custom"

    # Committed in chunks rather than in one database transaction: a filter
    # can select the whole ledger, and holding row locks on tens of thousands
    # of transactions for the length of the request is what once took the
    # production database down during a mass import. Everything that could
    # fail was validated above, so a chunk boundary is not a partial failure
    # waiting to happen.
    updated_ids = []
    for start in range(0, len(target_ids), BULK_UPDATE_CHUNK_SIZE):
        chunk_ids = target_ids[start:start + BULK_UPDATE_CHUNK_SIZE]
        transactions = (
            db.query(Transaction)
            .filter(Transaction.id.in_(chunk_ids))
            .options(selectinload(Transaction.splits))
            .order_by(Transaction.id)
            .all()
        )
        for transaction in transactions:
            old_values = {f: getattr(transaction, f) for f in non_split_fields if f in TRACKED_FIELDS}
            if payee_affix is not None:
                old_values["payee"] = transaction.payee
            for field, value in non_split_fields.items():
                setattr(transaction, field, value)
            if payee_affix is not None:
                transaction.payee = (payee_affix + transaction.payee if payee_mode == "prepend"
                                     else transaction.payee + payee_affix)
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
    target_ids = _resolve_bulk_target_ids(db, data.transaction_ids, data.filter, data.expected_count)

    # Chunked for the same reason as bulk-update: a filter can select the
    # whole ledger.
    deleted_ids = []
    for start in range(0, len(target_ids), BULK_UPDATE_CHUNK_SIZE):
        chunk_ids = target_ids[start:start + BULK_UPDATE_CHUNK_SIZE]
        for transaction in db.query(Transaction).filter(Transaction.id.in_(chunk_ids)).order_by(Transaction.id).all():
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


@router.put("/{transaction_id}/raw", response_model=TransactionOut)
def update_transaction_raw_fields(transaction_id: int, data: TransactionRawFieldsUpdate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    # Admin mode's edit of the "As reported by the bank" section. Kept apart
    # from PUT /{id} so the raw fields stay out of TransactionUpdate: nothing
    # else may rewrite them. They feed no balance, chart or split, so no cache
    # namespace is invalidated; external_id (the sync's dedup key) is untouched.
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    changes = {}
    for field, value in data.model_dump(exclude_unset=True).items():
        old = getattr(transaction, field)
        if old != value:
            setattr(transaction, field, value)
            changes[field] = {"old": _jsonify(old), "new": _jsonify(value)}
    if changes:
        record_transaction_history(db, transaction, "updated", actor_user_id, source="admin", changes=changes)
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
