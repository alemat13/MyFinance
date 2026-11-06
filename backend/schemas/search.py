"""The Transactions screen's search request and its advanced-filter conditions."""

from collections.abc import Iterable
from datetime import date
from typing import Annotated, Literal

from pydantic import Discriminator, Field, Tag, model_validator

from .base import Schema
from .transactions import (
    BulkDeleteTransactionsRequest,
    BulkUpdateTransactionsRequest,
    TransactionOut,
)

TEXT_OPERATORS = {"contains", "equals", "not_equals", "starts_with", "ends_with"}
NUMERIC_OPERATORS = {"eq", "ne", "gt", "gte", "lt", "lte", "between"}
DATE_OPERATORS = {"on", "before", "after", "between"}
# The month a transaction counts toward (its date shifted by its
# accounting_month_offset), compared as "YYYY-MM": how the Charts page buckets
# a transaction, so a chart's segment can open its own transactions.
MONTH_FIELDS = {"accounting_month"}
TEXT_FIELDS = {
    "payee",
    "memo",
    "raw_label",
    "raw_counterparty",
    "raw_transaction_code",
    "raw_merchant_category_code",
    "raw_merchant_location",
}
# created_at is when the row reached MyFinance ("Added on"), compared by day.
DATE_FIELDS = {"date", "raw_initiated_date", "raw_booking_date", "created_at"}
# amount_abs is the amount without its sign ("Amount (abs)"), so "> 100"
# catches a 150 € expense as well as a 150 € income.
NUMERIC_FIELDS = {"amount", "amount_abs", "account_id", "category_id", "accounting_month_offset"}
# "Reconciled is Yes / No"; the value is a boolean (or "true"/"false").
# "Linked" is whether the row belongs to a group of linked transactions.
BOOL_FIELDS = {"reconciled", "linked"}
BOOL_OPERATORS = {"eq"}
# "Has tag" / "does not have tag"; with no tag named, "has no tag at all" /
# "has at least one tag" (is / is not), like the uncategorized category_id.
TAG_FIELDS = {"tag_id"}
TAG_OPERATORS = {"eq", "ne"}
# "Account / Category is in / is not in" a list of ids; a null in a category
# list stands for "Uncategorized" (IS NULL), as a null value does for "is".
LIST_FIELDS = {"account_id", "category_id"}
LIST_OPERATORS = {"in", "not_in"}
# Per-user figures of a transaction, each condition naming the user it reads:
# their split weight, their share, and their balance (share minus the part of
# the amount their ownership of the account pays). Searched only: a rule has
# no use for them, since the import preview runs rules on rows with no split.
# The _abs ones read the share or balance without its sign.
USER_FIELDS = {
    "split_weight",
    "split_share",
    "split_balance",
    "split_share_abs",
    "split_balance_abs",
}

OPERATORS_BY_FIELD = {
    **{f: TEXT_OPERATORS for f in TEXT_FIELDS},
    **{f: DATE_OPERATORS for f in DATE_FIELDS},
    **{f: DATE_OPERATORS for f in MONTH_FIELDS},
    **{f: NUMERIC_OPERATORS for f in NUMERIC_FIELDS},
    **{f: NUMERIC_OPERATORS | LIST_OPERATORS for f in LIST_FIELDS},
    **{f: NUMERIC_OPERATORS for f in USER_FIELDS},
    **{f: TAG_OPERATORS for f in TAG_FIELDS},
    **{f: BOOL_OPERATORS for f in BOOL_FIELDS},
}


class FilterCondition(Schema):
    field: Literal[
        "payee",
        "memo",
        "raw_label",
        "amount",
        "amount_abs",
        "date",
        "account_id",
        "category_id",
        "split_weight",
        "split_share",
        "split_balance",
        "split_share_abs",
        "split_balance_abs",
        "tag_id",
        "reconciled",
        "linked",
        "accounting_month_offset",
        "accounting_month",
        "created_at",
        "raw_counterparty",
        "raw_transaction_code",
        "raw_merchant_category_code",
        "raw_merchant_location",
        "raw_initiated_date",
        "raw_booking_date",
    ]
    operator: str
    value: bool | str | float | int | list[int | None] | None = None
    value2: str | float | int | None = None
    # The user a per-user field (USER_FIELDS) reads; unused by the others.
    user_id: int | None = None

    @model_validator(mode="after")
    def _validate_operator(self):
        allowed = OPERATORS_BY_FIELD[self.field]
        if self.operator not in allowed:
            raise ValueError(
                f'operator "{self.operator}" not valid for field "{self.field}" (allowed: {sorted(allowed)})'
            )
        if self.field in USER_FIELDS and self.user_id is None:
            raise ValueError(f'field "{self.field}" needs a user_id')
        if (self.operator in LIST_OPERATORS) != isinstance(self.value, list):
            raise ValueError(
                f'operator "{self.operator}" takes {"a list" if self.operator in LIST_OPERATORS else "a single value"}'
            )
        if isinstance(self.value, list) and not self.value:
            raise ValueError(f'"{self.operator}" needs at least one value')
        return self


class ConditionGroup(Schema):
    """Conditions in brackets, with an ALL/ANY of their own, standing as one
    condition among the others: "account is X AND (payee contains A OR
    payee contains B)". One level deep: a group holds plain conditions only."""

    match_mode: Literal["all", "any"] = "all"
    conditions: list[FilterCondition] = Field(..., min_length=1)


def _condition_kind(value) -> str:
    if isinstance(value, dict):
        return "group" if "conditions" in value else "condition"
    return "group" if isinstance(value, ConditionGroup) else "condition"


# One entry of an advanced filter or a rule: a condition, or a group of them.
ConditionItem = Annotated[
    Annotated[FilterCondition, Tag("condition")] | Annotated[ConditionGroup, Tag("group")],
    Discriminator(_condition_kind),
]


def flatten_conditions(items: Iterable[FilterCondition | ConditionGroup]) -> list[FilterCondition]:
    """Every plain condition, those inside groups included."""
    out: list[FilterCondition] = []
    for item in items:
        out.extend(item.conditions if isinstance(item, ConditionGroup) else [item])
    return out


class HistoryGroupRef(Schema):
    """One History entry's rows (history.group_filter()): the id range they
    span plus what they share."""

    first_id: int
    last_id: int
    action: str
    source: str | None = None
    changed_by_user_id: int | None = None
    batch_id: str | None = None


class TransactionSearchRequest(Schema):
    user_id: int | None = None

    # simple mode
    search: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    # Any of several accounts / categories (the screen's multi-select).
    account_ids: list[int] | None = None
    category_ids: list[int] | None = None
    # Only the transactions with no category; with category_ids, OR'd with
    # them ("Groceries or Uncategorized").
    uncategorized: bool = False
    # Only the transactions carrying this tag, or (untagged) carrying none.
    tag_id: int | None = None
    untagged: bool = False
    amount_min: float | None = None
    amount_max: float | None = None
    reconciled: bool | None = None

    # advanced mode
    conditions: list[ConditionItem] = []
    match_mode: Literal["all", "any"] = "all"

    # pagination
    page: int = 1
    page_size: int = 50
    unpaginated: bool = False

    # sorting
    sort_by: Literal["date", "amount", "payee", "created_at"] = "date"
    sort_dir: Literal["asc", "desc"] = "desc"

    # Only the transactions one History entry touched (its "Open in
    # Transactions" link); combined with whatever else is set.
    history_group: HistoryGroupRef | None = None


BulkUpdateTransactionsRequest.model_rebuild()
BulkDeleteTransactionsRequest.model_rebuild()


class TransactionSearchResponse(Schema):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    total_pages: int
