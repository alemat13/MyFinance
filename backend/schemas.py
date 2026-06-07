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


class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str


class CategoryCreate(BaseModel):
    name: str
    type: str


class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None


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


class TransactionCreate(BaseModel):
    date: date
    payee: str
    memo: Optional[str] = None
    amount: float
    account_id: int
    category_id: int


class TransactionUpdate(BaseModel):
    date: Optional[date] = None
    payee: Optional[str] = None
    memo: Optional[str] = None
    amount: Optional[float] = None
    account_id: Optional[int] = None
    category_id: Optional[int] = None


class DashboardResponse(BaseModel):
    accounts: List[AccountOut]
    recent_transactions: List[TransactionOut]
