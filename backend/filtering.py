from datetime import date

from sqlalchemy import Integer, Numeric, and_, cast, extract, func, or_, select
from sqlalchemy.orm import Session

import history
from models import AccountUser, Transaction, TransactionSplit, TransactionTag
from schemas import (
    BOOL_FIELDS, DATE_FIELDS, LIST_OPERATORS, MONTH_FIELDS, TAG_FIELDS, TEXT_FIELDS, USER_FIELDS, FilterCondition,
)

FIELD_COLUMN_MAP = {
    "payee": Transaction.payee,
    "memo": Transaction.memo,
    "raw_label": Transaction.raw_label,
    "amount": Transaction.amount,
    "amount_abs": func.abs(Transaction.amount),
    "date": Transaction.date,
    "account_id": Transaction.account_id,
    "category_id": Transaction.category_id,
    "accounting_month_offset": Transaction.accounting_month_offset,
    "reconciled": Transaction.reconciled,
    "raw_counterparty": Transaction.raw_counterparty,
    "raw_transaction_code": Transaction.raw_transaction_code,
    "raw_merchant_category_code": Transaction.raw_merchant_category_code,
    "raw_merchant_location": Transaction.raw_merchant_location,
    "raw_initiated_date": Transaction.raw_initiated_date,
    "raw_booking_date": Transaction.raw_booking_date,
    # A timestamp, compared by its day like the other date fields.
    "created_at": func.date(Transaction.created_at),
}


def _coerce_date(value) -> date:
    if isinstance(value, date):
        return value
    if value is None or value == "":
        raise ValueError("a date condition needs a date")
    try:
        return date.fromisoformat(str(value))
    except ValueError:
        raise ValueError(f'invalid date value: {value!r}')


def _coerce_number(value) -> float:
    if value is None or value == "":
        raise ValueError("a number condition needs a number")
    try:
        return float(value)
    except (TypeError, ValueError):
        raise ValueError(f'invalid number value: {value!r}')


def coerce_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if str(value).strip().lower() in ("true", "1", "yes"):
        return True
    if str(value).strip().lower() in ("false", "0", "no"):
        return False
    raise ValueError(f'invalid yes/no value: {value!r}')


def like_pattern(value: str) -> str:
    """Turn user text into a LIKE pattern (escape character backslash): `*`
    matches any run of characters and `?` exactly one, while a literal `%`,
    `_` or backslash is matched as itself. Mirrored by
    transaction_rules._wildcard_regex()."""
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return escaped.replace("*", "%").replace("?", "_")


def _text_expr(column, condition: FilterCondition):
    value = str(condition.value).lower()
    lowered = func.lower(column)
    if condition.operator == "contains":
        return lowered.like(f"%{like_pattern(value)}%", escape="\\")
    if condition.operator == "equals":
        return lowered == value
    if condition.operator == "not_equals":
        return lowered != value
    if condition.operator == "starts_with":
        return lowered.like(f"{like_pattern(value)}%", escape="\\")
    if condition.operator == "ends_with":
        return lowered.like(f"%{like_pattern(value)}", escape="\\")
    raise ValueError(f'unsupported text operator: {condition.operator}')


def _numeric_expr(column, condition: FilterCondition):
    value = _coerce_number(condition.value)
    if condition.operator == "between":
        value2 = _coerce_number(condition.value2)
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


def _list_expr(column, condition: FilterCondition):
    """In / not in a list of ids, a None in it being "no value" (IS NULL).
    Like "is not", "not in" never matches a row with no value unless the
    list names "no value" itself, which it then excludes."""
    ids = [int(v) for v in condition.value if v is not None]
    with_null = None in condition.value
    if condition.operator == "in":
        exprs = ([column.in_(ids)] if ids else []) + ([column.is_(None)] if with_null else [])
        return or_(*exprs)
    exprs = [column.isnot(None)] + ([column.notin_(ids)] if ids else [])
    return and_(*exprs)


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


def month_index(month: str) -> int:
    """"YYYY-MM" as a count of months (year * 12 + month - 1), the scale
    accounting_month.compute_accounting_month() shifts on."""
    try:
        year, mon = (int(part) for part in str(month).split("-")[:2])
    except ValueError:
        raise ValueError(f'invalid month value: {month!r}')
    if not 1 <= mon <= 12:
        raise ValueError(f'invalid month value: {month!r}')
    return year * 12 + mon - 1


# The accounting month as a month count, in SQL that SQLite and Postgres both
# run: the date's year and month plus the row's own offset.
ACCOUNTING_MONTH_INDEX = (
    cast(extract("year", Transaction.date), Integer) * 12
    + cast(extract("month", Transaction.date), Integer) - 1
    + Transaction.accounting_month_offset
)


def _month_expr(column, condition: FilterCondition):
    """On / before / after / between months, both bounds included by between."""
    value = month_index(condition.value)
    if condition.operator == "between":
        value2 = month_index(condition.value2)
        return column.between(min(value, value2), max(value, value2))
    if condition.operator == "on":
        return column == value
    if condition.operator == "before":
        return column < value
    if condition.operator == "after":
        return column > value
    raise ValueError(f'unsupported month operator: {condition.operator}')


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
    if field.endswith("_abs"):
        return func.abs(_user_column(field.removesuffix("_abs"), user_id))
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


def _tag_expr(tag_id: int | None, has: bool):
    """Carries the tag (or, with no tag named, carries any tag), or not."""
    carrying = select(TransactionTag.transaction_id).where(TransactionTag.transaction_id == Transaction.id)
    if tag_id is not None:
        carrying = carrying.where(TransactionTag.tag_id == tag_id)
    exists = carrying.correlate(Transaction).exists()
    return exists if has else ~exists


def build_condition_expr(condition: FilterCondition):
    if condition.field in TAG_FIELDS:
        if condition.value in (None, ""):
            # "Tag is / is not" with no tag named, like the uncategorized
            # category: the rows with no tag at all / with at least one.
            return _tag_expr(None, condition.operator == "ne")
        return _tag_expr(int(_coerce_number(condition.value)), condition.operator == "eq")
    if condition.field == "category_id" and condition.value is None and condition.operator in ("eq", "ne"):
        # "Category is / is not" with no category: the uncategorized rows.
        column = Transaction.category_id
        return column.is_(None) if condition.operator == "eq" else column.isnot(None)
    if condition.field == "linked":
        column = Transaction.link_id
        return column.isnot(None) if coerce_bool(condition.value) else column.is_(None)
    if condition.operator in LIST_OPERATORS:
        return _list_expr(FIELD_COLUMN_MAP[condition.field], condition)
    if condition.field in MONTH_FIELDS:
        return _month_expr(ACCOUNTING_MONTH_INDEX, condition)
    if condition.field in USER_FIELDS:
        return _numeric_expr(_user_column(condition.field, condition.user_id), condition)
    column = FIELD_COLUMN_MAP[condition.field]
    if condition.field in BOOL_FIELDS:
        return column.is_(coerce_bool(condition.value))
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
        like = f"%{like_pattern(req.search.lower())}%"
        query = query.filter(or_(
            func.lower(Transaction.payee).like(like, escape="\\"),
            func.lower(Transaction.memo).like(like, escape="\\"),
        ))
    if req.date_from is not None:
        query = query.filter(Transaction.date >= req.date_from)
    if req.date_to is not None:
        query = query.filter(Transaction.date <= req.date_to)
    if req.account_id is not None:
        query = query.filter(Transaction.account_id == req.account_id)
    if req.category_id is not None:
        query = query.filter(Transaction.category_id == req.category_id)
    if req.account_ids:
        query = query.filter(Transaction.account_id.in_(req.account_ids))
    if req.category_ids:
        in_categories = Transaction.category_id.in_(req.category_ids)
        query = query.filter(or_(in_categories, Transaction.category_id.is_(None)) if req.uncategorized else in_categories)
    elif req.uncategorized:
        query = query.filter(Transaction.category_id.is_(None))
    if req.tag_id is not None:
        query = query.filter(_tag_expr(req.tag_id, True))
    if req.untagged:
        query = query.filter(_tag_expr(None, False))
    if req.amount_min is not None:
        query = query.filter(Transaction.amount >= req.amount_min)
    if req.amount_max is not None:
        query = query.filter(Transaction.amount <= req.amount_max)
    if req.reconciled is not None:
        query = query.filter(Transaction.reconciled == req.reconciled)
    if getattr(req, "history_group", None) is not None:
        query = query.filter(Transaction.id.in_(history.group_transaction_ids(req.history_group)))
    if req.conditions:
        where = build_where_clause(req.conditions, req.match_mode)
        if where is not None:
            query = query.filter(where)
    return query
