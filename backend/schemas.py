from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


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


class AccountOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    created_at: datetime
    users: list[AccountUserOut] = []


class AccountCreate(BaseModel):
    name: str
    type: str
    balance: float = 0.0
    users: list[AccountUserCreate] = []


class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    balance: Optional[float] = None
    users: list[AccountUserCreate] | None = None


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


class UserBalanceOut(BaseModel):
    user_id: int
    user_name: str
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
    category_id: int
    category_name: str
    splits: list[TransactionSplitOut] = []


class TransactionCreate(BaseModel):
    date: date
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    category_id: int
    split_overrides: list[SplitShareCreate] | None = None


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None
    split_overrides: list[SplitShareCreate] | None = None


class DashboardResponse(BaseModel):
    accounts: List[AccountOut]
    recent_transactions: List[TransactionOut]
    balances: List[UserBalanceOut] = []


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
