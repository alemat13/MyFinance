"""Automatic categorisation (see categorizer.py)."""

from datetime import datetime

from pydantic import Field

from .base import Schema, _DateType
from .search import TransactionSearchRequest

# ── Automatic categorisation (see categorizer.py) ────────────────


class CategorizerTrainRequest(Schema):
    """Which transactions to learn from, and which to be scored on.

    Both selections are ordinary Transactions-screen filters, so a training
    set can be "everything except the accounts nobody keeps up to date"
    rather than just a date range. `page`/`page_size` on either are ignored:
    training always reads the whole selection.

    The two must not overlap. A model scored on rows it was fitted on reports
    a precision it does not have, and since the point of the test selection
    is to decide whether to activate the model, that number has to mean
    something.
    """

    train: TransactionSearchRequest
    test: TransactionSearchRequest
    note: str | None = Field(None, max_length=200)


class CategorizerModelOut(Schema):
    id: int
    created_at: datetime
    status: str
    is_active: bool
    trained_rows: int
    tested_rows: int
    note: str | None = None
    params: dict | None = None
    metrics: dict | None = None
    error: str | None = None

    model_config = {"from_attributes": True}


class CategorizerSuggestRequest(Schema):
    """Either an explicit list of transactions (the bulk action on a
    selection) or a filter (everything matching, e.g. the uncategorised)."""

    transaction_ids: list[int] | None = None
    selection: TransactionSearchRequest | None = None
    limit: int = Field(500, ge=1, le=2000)


class CategorizerSuggestion(Schema):
    transaction_id: int
    date: _DateType
    payee: str
    raw_label: str | None = None
    amount: float
    current_category_id: int | None = None
    current_category_name: str | None = None
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    confidence: float | None = None
    high_confidence: bool = False
    category_changed: bool = False


class CategorizerSuggestResponse(Schema):
    model_id: int
    threshold: float
    items: list[CategorizerSuggestion]
    category_changes: int
    high_confidence_changes: int


class CategorizerApplyItem(Schema):
    transaction_id: int
    category_id: int


class CategorizerApplyRequest(Schema):
    """Applies one value per transaction, which is why this is not
    bulk-update: that endpoint sets the same category on every row it
    touches."""

    items: list[CategorizerApplyItem]
    # Off by default: a category somebody set by hand outranks a suggestion.
    overwrite_category: bool = False


class CategorizerApplyResponse(Schema):
    updated_count: int
    transaction_ids: list[int]
    # Rows left alone because they already carried a category and
    # overwrite_category was false.
    skipped_transaction_ids: list[int] = []
