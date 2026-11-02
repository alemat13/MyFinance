"""Transactions: read/write models, links, bulk edit/delete, divide."""
import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .base import Schema, _DateType
from .entities import SplitWeightCreate, TagRef, TransactionSplitOut


class TransactionOut(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    account_name: str
    currency: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    category_color: Optional[str] = None
    category_icon: Optional[str] = None
    accounting_month_offset: int
    accounting_month: str
    reconciled: bool
    divide_group_id: Optional[int] = None
    # The group of linked transactions it belongs to (models.TransactionLink).
    link_id: Optional[int] = None
    # Set on a checkpoint only: the account's value at the end of `date`;
    # `amount` is then derived from it (see checkpoints.py).
    checkpoint_value: Optional[float] = None
    # On a checkpoint: the previous checkpoint's date on its account, where
    # the period its gain or loss covers starts (null: since the account's
    # start, or not a checkpoint).
    checkpoint_since: Optional[date] = None
    # Read-only throughout: present here and absent from TransactionCreate /
    # TransactionUpdate, so the API can show what the source said without
    # ever letting a client rewrite it. See models.Transaction.
    raw_source: Optional[str] = None
    raw_label: Optional[str] = None
    raw_counterparty: Optional[str] = None
    raw_transaction_code: Optional[str] = None
    raw_merchant_category_code: Optional[str] = None
    raw_merchant_location: Optional[str] = None
    raw_initiated_date: Optional[date] = None
    raw_booking_date: Optional[date] = None
    splits: list[TransactionSplitOut] = []
    tags: list[TagRef] = []


# ── Linked transactions (models.TransactionLink) ─────────────────────

class TransactionLinkCreate(Schema):
    """Links these transactions together. Any of them already in a group
    brings that group along: the groups are merged into one, so ticking a
    new row with one already linked adds it to that group."""
    transaction_ids: list[int] = Field(..., min_length=2)
    name: Optional[str] = Field(None, max_length=100)


class TransactionLinkUpdate(Schema):
    """Rename; a blank name clears it."""
    name: Optional[str] = Field(None, max_length=100)


class TransactionLinkUnlink(Schema):
    """Takes these transactions out of the group; a group left with fewer
    than two is dissolved."""
    transaction_ids: list[int] = Field(..., min_length=1)


class TransactionLinkTotal(Schema):
    currency: str
    amount: float


class TransactionLinkOut(Schema):
    id: int
    name: Optional[str] = None
    transactions: list[TransactionOut]
    # The members' amounts summed per currency: what the group nets to.
    totals: list[TransactionLinkTotal]


class PayeeSuggestionOut(Schema):
    """One autocompletion entry for the Payee field: a payee as last used, the
    category it was filed under then, and that most recent transaction's date,
    amount, memo and original bank label, so two similar entries can be told
    apart and a match found outside the payee shows where it was found."""
    payee: str
    category_id: Optional[int] = None
    category_name: Optional[str] = None
    date: _DateType
    amount: float
    currency: str
    memo: Optional[str] = None
    raw_label: Optional[str] = None


class TransactionCreate(Schema):
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    category_id: Optional[int] = None
    accounting_month_offset: int = Field(0, ge=-3, le=3)
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # The transaction's tags, by id; omitted or empty means none.
    tag_ids: list[int] | None = None
    # Makes this a checkpoint: what the account is worth at the end of
    # `date`. `amount` is then ignored and derived (see checkpoints.py).
    checkpoint_value: Optional[float] = None


class TransactionUpdate(Schema):
    date: Optional[_DateType] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    accounting_month_offset: Optional[int] = Field(None, ge=-3, le=3)
    reconciled: Optional[bool] = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # Replaces the whole set of tags; omitted leaves them, [] removes them all.
    tag_ids: list[int] | None = None
    # A checkpoint's new value. Refused on an ordinary transaction; a
    # checkpoint's own `amount` is derived and can't be set directly.
    checkpoint_value: Optional[float] = None


class TransactionRawFieldsUpdate(Schema):
    """Admin-mode edit of a transaction's raw, as-reported fields (the
    "As reported by the bank" section). Same exclude_unset contract as
    TransactionUpdate: an omitted key is left untouched, an explicit null (or
    a blank string) clears it. Lengths mirror the columns, so Postgres never
    sees a value it would truncate or refuse."""
    raw_source: Optional[Literal["enable_banking", "csv_import", "linxo_export"]] = None
    raw_label: Optional[str] = None
    raw_counterparty: Optional[str] = Field(None, max_length=200)
    raw_transaction_code: Optional[str] = Field(None, max_length=60)
    raw_merchant_category_code: Optional[str] = Field(None, max_length=10)
    raw_merchant_location: Optional[str] = Field(None, max_length=120)
    raw_initiated_date: Optional[_DateType] = None
    raw_booking_date: Optional[_DateType] = None

    @field_validator(
        "raw_label", "raw_counterparty", "raw_transaction_code",
        "raw_merchant_category_code", "raw_merchant_location", mode="before",
    )
    @classmethod
    def _blank_is_null(cls, value):
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class BulkTransactionUpdate(Schema):
    """Same "field omitted vs explicitly null" contract as TransactionUpdate,
    via exclude_unset: only include a key here when its section is meant to be
    applied to every selected transaction. An omitted key leaves that field
    untouched on all of them; category_id explicitly set to null clears it.
    reconciled has no null-clearing semantics (it's a plain bool, not nullable
    on the model) — omit it to leave reconciled status untouched. payee
    renames every selected transaction to the same text (stripped; blank or
    null is refused, a payee can't be cleared); the memo is never touched.
    payee_mode says what to do with that text: "replace" (the default) sets
    it as the payee, "prepend"/"append" add it before/after each row's own
    payee, taken as typed (unstripped) so a separating space can be part of it.
    "regex" (admin mode on screen) takes payee as a regular expression and
    replaces every match in each row's payee with payee_replacement, where
    $1, $2... name capture groups and $& the whole match, as in JavaScript;
    the result is stripped, and a row the pattern doesn't match is left alone."""
    category_id: Optional[int] = None
    payee: Optional[str] = None
    payee_mode: Literal["replace", "prepend", "append", "regex"] = "replace"
    payee_replacement: str = ""
    payee_ignore_case: bool = False
    # Admin mode only on screen: moves every selected transaction to this
    # account, keeping each one's own split as it is.
    account_id: Optional[int] = None
    accounting_month_offset: Optional[int] = Field(None, ge=-3, le=3)
    reconciled: Optional[bool] = None
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None
    # Tags added to / removed from every selected transaction, each row
    # keeping its other tags. A tag in both lists is refused.
    add_tag_ids: list[int] | None = None
    remove_tag_ids: list[int] | None = None


class BulkUpdateTransactionsRequest(Schema):
    """Exactly one of transaction_ids (the rows ticked on screen) or filter
    (every transaction the Transactions screen's current filter matches, across
    all pages; its pagination and sorting fields are ignored). expected_count,
    sent with a filter, is how many rows the user was shown: if the filter now
    matches a different number (a bank sync landed in between), the request is
    refused with 409 rather than editing rows nobody saw counted."""
    transaction_ids: list[int] = []
    filter: Optional["TransactionSearchRequest"] = None
    expected_count: Optional[int] = None
    update: BulkTransactionUpdate


class BulkUpdateTransactionsResponse(Schema):
    updated_count: int
    transaction_ids: list[int]


class BulkDeleteTransactionsRequest(Schema):
    """Same selection contract as BulkUpdateTransactionsRequest: exactly one of
    transaction_ids or filter (+ expected_count, 409 if the match moved)."""
    transaction_ids: list[int] = []
    filter: Optional["TransactionSearchRequest"] = None
    expected_count: Optional[int] = None


class BulkDeleteTransactionsResponse(Schema):
    deleted_count: int
    transaction_ids: list[int]


class TransactionDividePart(Schema):
    """One resulting part of a "divide" operation (splitting a transaction's
    amount into several new transactions by category/date — unrelated to
    TransactionSplit/split_weights, which divides a transaction's amount
    among users). No account_id: every part stays on the original
    transaction's account."""
    date: _DateType
    payee: str
    memo: Optional[str] = None
    amount: float
    category_id: Optional[int] = None
    accounting_month_offset: int = Field(0, ge=-3, le=3)
    split_weights: list[SplitWeightCreate] | None = None
    split_source: Literal["global", "account", "category", "custom"] | None = None


class TransactionDivideRequest(Schema):
    parts: list[TransactionDividePart]


class TransactionDivideResponse(Schema):
    transactions: list[TransactionOut]
