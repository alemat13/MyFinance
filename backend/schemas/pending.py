"""Pending bank transactions (MYF-82)."""

from typing import Literal

from pydantic import Field

from .base import Schema, _DateType
from .entities import SplitWeightCreate


class PendingCandidateOut(Schema):
    id: int
    date: _DateType
    payee: str
    amount: float


class PendingTransactionOut(Schema):
    id: int
    account_id: int
    date: _DateType
    amount: float
    # What to show: the user's wording when they set one, else the
    # suggestion's, else the bank's.
    payee: str
    bank_payee: str
    memo: str | None = None
    # The user's own payee and category (null: not set) and split (empty: the
    # default tiers once booked).
    user_payee: str | None = None
    category_id: int | None = None
    split_weights: list[SplitWeightCreate] = []
    # What the categorisation model and the automatic rules suggest (MYF-88):
    # shown while the user hasn't set their own, never carried over.
    suggested_payee: str | None = None
    suggested_category_id: int | None = None
    suggested_split_weights: list[SplitWeightCreate] = []
    status: Literal["pending", "to_reconcile"]
    edited: bool
    # Booked transactions this row may have become; to_reconcile rows only.
    candidates: list[PendingCandidateOut] = []


class PendingTransactionUpdate(Schema):
    """The user's edits. A null field clears that edit: the bank's payee, no
    category, the default split tiers."""

    payee: str | None = Field(default=None, max_length=200)
    category_id: int | None = None
    split_weights: list[SplitWeightCreate] | None = None


class PendingReconcileRequest(Schema):
    transaction_id: int
