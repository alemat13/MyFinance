from datetime import date

from sqlalchemy import Numeric, and_, cast, func, or_, select
from sqlalchemy.orm import Session

from models import AccountUser, Transaction, TransactionSplit
from schemas import DATE_FIELDS, TEXT_FIELDS, USER_FIELDS, FilterCondition

FIELD_COLUMN_MAP = {
    "payee": Transaction.payee,
    "memo": Transaction.memo,
    "raw_label": Transaction.raw_label,
    "amount": Transaction.amount,
    "date": Transaction.date,
    "account_id": Transaction.account_id,
    "category_id": Transaction.category_id,
}


def _coerce_date(value) -> date:
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError(f'invalid date value: {value!r}')


def _text_expr(column, condition: FilterCondition):
    value = str(condition.value).lower()
    lowered = func.lower(column)
    if condition.operator == "contains":
        return lowered.like(f"%{value}%")
    if condition.operator == "equals":
        return lowered == value
    if condition.operator == "not_equals":
        return lowered != value
    if condition.operator == "starts_with":
        return lowered.like(f"{value}%")
    if condition.operator == "ends_with":
        return lowered.like(f"%{value}")
    raise ValueError(f'unsupported text operator: {condition.operator}')


def _numeric_expr(column, condition: FilterCondition):
    value = float(condition.value)
    if condition.operator == "between":
        value2 = float(condition.value2)
        return column.between(min(value, value2), max(value, value2))
    if condition.operator == "eq":
        return column == value
    if condition.operator == "ne":
        return column != value
    if condition.operator == "gt":
        return column > value
    if condition.operator == "gte":
        return column >= value
    if condition.operator == "lt":
        return column < value
    if condition.operator == "lte":
        return column <= value
    raise ValueError(f'unsupported numeric operator: {condition.operator}')


def _date_expr(column, condition: FilterCondition):
    value = _coerce_date(condition.value)
    if condition.operator == "between":
        value2 = _coerce_date(condition.value2)
        return column.between(min(value, value2), max(value, value2))
    if condition.operator == "on":
        return column == value
    if condition.operator == "before":
        return column < value
    if condition.operator == "after":
        return column > value
    raise ValueError(f'unsupported date operator: {condition.operator}')


def _split_column(column, user_id: int):
    """One of the user's split columns on the transaction, 0 when the split
    leaves them out (as the Transactions screen shows it)."""
    return func.coalesce(
        select(column)
        .where(TransactionSplit.transaction_id == Transaction.id, TransactionSplit.user_id == user_id)
        .correlate(Transaction)
        .scalar_subquery(),
        0,
    )


def _user_column(field: str, user_id: int):
    if field == "split_weight":
        return _split_column(TransactionSplit.weight, user_id)
    share = _split_column(TransactionSplit.share_amount, user_id)
    if field == "split_share":
        return share
    # Balance, as utils/transactions.ts's balanceFor() shows it: the share
    # minus the part of the amount the user's ownership of the account pays.
    # Rounded to cents so "=" matches what is on screen despite float drift.
    ownership = func.coalesce(
        select(AccountUser.ownership_percentage)
        .where(AccountUser.account_id == Transaction.account_id, AccountUser.user_id == user_id)
        .correlate(Transaction)
        .scalar_subquery(),
        0,
    )
    return func.round(cast(share - Transaction.amount * ownership / 100, Numeric), 2)


def build_condition_expr(condition: FilterCondition):
    if condition.field in USER_FIELDS:
        return _numeric_expr(_user_column(condition.field, condition.user_id), condition)
    column = FIELD_COLUMN_MAP[condition.field]
    if condition.field in TEXT_FIELDS:
        return _text_expr(column, condition)
    if condition.field in DATE_FIELDS:
        return _date_expr(column, condition)
    return _numeric_expr(column, condition)


def build_where_clause(conditions: list[FilterCondition], match_mode: str):
    if not conditions:
        return None
    exprs = [build_condition_expr(c) for c in conditions]
    return and_(*exprs) if match_mode == "all" else or_(*exprs)


def visible_transaction_filter(db: Session, user_id: int):
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


def apply_transaction_filters(query, req, db: Session):
    """Apply a TransactionSearchRequest's simple and advanced filters to a query.

    Shared by POST /api/transactions/search and by the categorizer, which lets
    a training or test selection be expressed with exactly the filters the
    Transactions screen already offers instead of a second filter language.
    Only pagination and sorting are left to the caller. Raises ValueError on an
    unusable advanced condition, for the caller to map to a 422.
    """
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
        where = build_where_clause(req.conditions, req.match_mode)
        if where is not None:
            query = query.filter(where)
    return query
