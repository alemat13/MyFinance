from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# Alias used where a model field is itself named `date`: pydantic v2 resolves
# annotations using the class's own namespace, and a field named the same as
# its type (with a default) gets shadowed by that default there, so the bare
# `date` name can't be used as the annotation in that case.
_DateType = date


class UserOut(BaseModel):
    id: int
    name: str
    email: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserCreate(BaseModel):
    name: str
    email: str | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None


class AccountUserOut(BaseModel):
    user_id: int
    user_name: str
    ownership_percentage: float
    model_config = ConfigDict(from_attributes=True)


class AccountUserCreate(BaseModel):
    user_id: int
    ownership_percentage: float


def _validate_currency_code(value: str) -> str:
    value = value.strip().upper()
    if len(value) != 3 or not value.isalpha():
        raise ValueError(f"Currency must be a 3-letter code, got '{value}'")
    return value


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime
    users: list[AccountUserOut] = []


class AccountCreate(BaseModel):
    name: str
    type: str
    balance: float = 0.0
    currency: str = "EUR"
    users: list[AccountUserCreate] = []

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str) -> str:
        return _validate_currency_code(value)


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[float] = None
    currency: Optional[str] = None
    users: list[AccountUserCreate] | None = None

    @field_validator("currency")
    @classmethod
    def _validate_currency(cls, value: str | None) -> str | None:
        return _validate_currency_code(value) if value is not None else None


class CategorySplitOut(BaseModel):
    user_id: int
    user_name: str
    split_percentage: float
    model_config = ConfigDict(from_attributes=True)


class CategorySplitCreate(BaseModel):
    user_id: int
    split_percentage: float


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    splits: list[CategorySplitOut] = []


class CategoryCreate(BaseModel):
    name: str
    type: str
    splits: list[CategorySplitCreate] = []


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    splits: list[CategorySplitCreate] | None = None


class GlobalSplitWeightOut(BaseModel):
    user_id: int
    user_name: str
    weight: float
    model_config = ConfigDict(from_attributes=True)


class GlobalSplitWeightUpdateItem(BaseModel):
    user_id: int
    weight: float


class SplitShareCreate(BaseModel):
    user_id: int
    share_amount: float


class TransactionSplitOut(BaseModel):
    user_id: int
    user_name: str
    share_amount: float
    source: str
    model_config = ConfigDict(from_attributes=True)


class SplitPreviewRequest(BaseModel):
    amount: float
    category_id: int | None = None
    account_id: int | None = None


class UserBalanceOut(BaseModel):
    user_id: int
    user_name: str
    currency: str
    net_position: float


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    account_name: str
    currency: str
    category_id: int
    category_name: str
    accounting_month_offset: int
    accounting_month: str
    splits: list[TransactionSplitOut] = []


class TransactionCreate(BaseModel):
    date: date
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    category_id: int
    accounting_month_offset: int = Field(0, ge=-3, le=3)
    split_overrides: list[SplitShareCreate] | None = None


class TransactionUpdate(BaseModel):
    date: Optional[_DateType] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    accounting_month_offset: Optional[int] = Field(None, ge=-3, le=3)
    split_overrides: list[SplitShareCreate] | None = None


TEXT_OPERATORS = {"contains", "equals", "not_equals", "starts_with", "ends_with"}
NUMERIC_OPERATORS = {"eq", "ne", "gt", "gte", "lt", "lte", "between"}
DATE_OPERATORS = {"on", "before", "after", "between"}
TEXT_FIELDS = {"payee", "memo"}
DATE_FIELDS = {"date"}
NUMERIC_FIELDS = {"amount", "account_id", "category_id"}

OPERATORS_BY_FIELD = {
    **{f: TEXT_OPERATORS for f in TEXT_FIELDS},
    **{f: DATE_OPERATORS for f in DATE_FIELDS},
    **{f: NUMERIC_OPERATORS for f in NUMERIC_FIELDS},
}


class FilterCondition(BaseModel):
    field: Literal["payee", "memo", "amount", "date", "account_id", "category_id"]
    operator: str
    value: str | float | int | None = None
    value2: str | float | int | None = None

    @model_validator(mode="after")
    def _validate_operator(self):
        allowed = OPERATORS_BY_FIELD[self.field]
        if self.operator not in allowed:
            raise ValueError(f'operator "{self.operator}" not valid for field "{self.field}" (allowed: {sorted(allowed)})')
        return self


class TransactionSearchRequest(BaseModel):
    user_id: int | None = None

    # simple mode
    search: str | None = None
    date_from: date | None = None
    date_to: date | None = None
    account_id: int | None = None
    category_id: int | None = None
    amount_min: float | None = None
    amount_max: float | None = None

    # advanced mode
    conditions: list[FilterCondition] = []
    match_mode: Literal["all", "any"] = "all"

    # pagination
    page: int = 1
    page_size: int = 50

    # sorting
    sort_by: Literal["date", "amount", "payee", "created_at"] = "date"
    sort_dir: Literal["asc", "desc"] = "desc"


class TransactionSearchResponse(BaseModel):
    items: list[TransactionOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class DashboardResponse(BaseModel):
    accounts: List[AccountOut]
    recent_transactions: List[TransactionOut]
    balances: List[UserBalanceOut] = []


class CategoryChartItem(BaseModel):
    category_id: int
    category_name: str
    category_type: Literal["Income", "Expense"]
    amount: float
    currency: str


class MonthChartItem(BaseModel):
    month: str
    income: float
    expense: float
    currency: str


class NetMonthChartItem(BaseModel):
    month: str
    net: float
    currency: str


class ChartsResponse(BaseModel):
    currencies: List[str]
    by_category: List[CategoryChartItem]
    by_month: List[MonthChartItem]
    net_by_month: List[NetMonthChartItem]


class TransactionHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: Optional[str] = None
    changed_at: datetime
    changed_by_user_id: Optional[int] = None
    changed_by_user_name: Optional[str] = None
    date: Optional[_DateType] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    accounting_month_offset: Optional[int] = None
    changes: Optional[dict] = None


class ImportPreviewRequest(BaseModel):
    csv_text: str
    account_id: int
    date_col: str
    payee_col: str
    amount_col: str
    memo_col: str | None = None
    category_col: str | None = None
    has_header: bool = True
    date_format: str | None = None  # Python strptime format; defaults to ISO (YYYY-MM-DD)


class SplitPreviewShare(BaseModel):
    user_id: int
    share_amount: float
    source: str


class ImportPreviewRow(BaseModel):
    row_number: int
    transaction_date: date | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int
    category_id: int | None = None
    category_name: str | None = None
    status: str  # 'ok' | 'needs_category' | 'possible_duplicate' | 'error'
    error_message: str | None = None
    preview_split: list[SplitPreviewShare] = []


class ImportCommitRequest(BaseModel):
    rows: list[TransactionCreate]


class ImportCommitResponse(BaseModel):
    created_count: int
    transaction_ids: list[int]


# ── Full database backup (export/import) ─────────────────────────
# Raw-column schemas: unlike the *Out schemas above, these mirror each
# model's own columns exactly (ids and FK ids included, no joins), so a
# round-trip preserves the database precisely.

class UserExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    created_at: datetime


class AccountExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime


class CategoryExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str


class AccountUserExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    user_id: int
    ownership_percentage: float


class CategorySplitExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    category_id: int
    user_id: int
    split_percentage: float


class GlobalSplitWeightExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    weight: float


class TransactionExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: _DateType
    payee: str
    memo: str | None = None
    amount: float
    account_id: int
    category_id: int
    accounting_month_offset: int = 0
    created_at: datetime


class TransactionSplitExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    user_id: int
    share_amount: float
    source: str


class TransactionHistoryExport(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: str | None = None
    changed_at: datetime
    changed_by_user_id: int | None = None
    date: _DateType | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int | None = None
    category_id: int | None = None
    accounting_month_offset: int | None = None
    changes: dict | None = None


class DatabaseExport(BaseModel):
    schema_version: int
    exported_at: datetime
    users: list[UserExport] = []
    accounts: list[AccountExport] = []
    categories: list[CategoryExport] = []
    account_users: list[AccountUserExport] = []
    category_splits: list[CategorySplitExport] = []
    global_split_weights: list[GlobalSplitWeightExport] = []
    transactions: list[TransactionExport] = []
    transaction_splits: list[TransactionSplitExport] = []
    transaction_history: list[TransactionHistoryExport] = []


class ImportSummary(BaseModel):
    mode: Literal["overwrite", "append"]
    users: int
    accounts: int
    categories: int
    account_users: int
    category_splits: int
    global_split_weights: int
    transactions: int
    transaction_splits: int
    transaction_history: int
