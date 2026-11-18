"""Pending bank operations (MYF-82)."""

from typing import Literal

from pydantic import Field

from .base import Schema, _DateType


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
    # What to show: the user's wording when they set one, else the bank's.
    payee: str
    bank_payee: str
    memo: str | None = None
    category_id: int | None = None
    status: Literal["pending", "to_reconcile"]
    edited: bool
    # Booked transactions this row may have become; to_reconcile rows only.
    candidates: list[PendingCandidateOut] = []


class PendingTransactionUpdate(Schema):
    """The user's edits. A null field clears that edit: the bank's payee, no
    category."""

    payee: str | None = Field(default=None, max_length=200)
    category_id: int | None = None


class PendingReconcileRequest(Schema):
    transaction_id: int
