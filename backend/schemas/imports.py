"""CSV/QIF import: detect, preview, commit."""
import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .base import Schema
from .transactions import TransactionCreate


class ImportDetectResponse(Schema):
    headers: list[str]
    encoding: str
    delimiter: str
    date_format: str | None = None  # Python strptime format; None if not confidently detected
    decimal_separator: str  # ',' or '.'
    column_mapping: dict[str, str | None]  # canonical field -> detected raw header (or None)
    sample_rows: list[dict[str, str]]
    file_format: str = "csv"  # 'csv' or 'qif' (a QIF file is read as fixed Date/Payee/Amount/Memo/Category columns)


class ImportPreviewRequest(Schema):
    account_id: int  # default/fallback account, used when account_col is absent or a row's value doesn't match
    encoding: str
    delimiter: str
    date_format: str  # Python strptime format, confirmed by the user
    decimal_separator: str  # ',' or '.'
    date_col: str
    payee_col: str
    amount_col: str
    memo_col: str | None = None
    category_col: str | None = None
    account_col: str | None = None


class ImportPreviewSplitShare(Schema):
    user_id: int
    weight: int
    share_amount: float
    source: str


class ImportPreviewRow(Schema):
    row_number: int
    transaction_date: date | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int
    account_name: str | None = None  # raw value from the CSV's account column, if any
    account_matched: bool = True  # False when account_id fell back to the request's default account
    category_id: int | None = None
    category_name: str | None = None
    status: str  # 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
    error_message: str | None = None
    preview_split: list[ImportPreviewSplitShare] = []
    # What the active categorisation model would file this row under, or all
    # three None when no model is active. Advisory: the screen offers it next
    # to the file's own category and commits whichever the user kept.
    suggested_category_id: int | None = None
    suggested_category_name: str | None = None
    suggested_confidence: float | None = None
    # What the enabled automatic rules would do to this row (see
    # transaction_rules.py), or None when no rule matches. The screen applies
    # it by default and can switch it off, so the file's own values stay here.
    rules: "RuleOutcomeOut | None" = None


class ImportCommitRow(TransactionCreate):
    """A row as the import commits it. `raw_label` is the file's own payee,
    sent back separately because an automatic rule may have renamed `payee`
    in the preview; absent, the payee is taken as the file's label.
    `reconciled` is there because a rule may mark a row reconciled."""
    raw_label: str | None = None
    reconciled: bool = False


class ImportCommitRequest(Schema):
    rows: list[ImportCommitRow]


class ImportCommitResponse(Schema):
    created_count: int
    transaction_ids: list[int]
