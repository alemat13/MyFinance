"""Dashboard, charts and history timeline responses."""
import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .base import Schema, _DateType
from .entities import AccountOut, UserBalanceOut
from .transactions import TransactionOut
from .search import HistoryGroupRef


class DashboardResponse(Schema):
    accounts: List[AccountOut]
    recent_transactions: List[TransactionOut]
    balances: List[UserBalanceOut] = []


class CategoryChartItem(Schema):
    category_id: int | None
    category_name: str
    category_type: Literal["Income", "Expense", "Uncategorized"]
    color: str | None = None
    amount: float
    currency: str


class MonthChartItem(Schema):
    month: str
    income: float
    expense: float
    uncategorized: float
    currency: str


class NetMonthChartItem(Schema):
    month: str
    net: float
    currency: str


class MonthCategoryChartItem(Schema):
    month: str
    category_id: int | None
    amount: float
    currency: str


class ChartCategoryOut(Schema):
    category_id: int | None
    name: str
    color: str | None = None
    icon: str | None = None


class ParentCategoryOut(Schema):
    id: int
    name: str


class ChartsResponse(Schema):
    currencies: List[str]
    by_category: List[CategoryChartItem]
    by_month: List[MonthChartItem]
    net_by_month: List[NetMonthChartItem]
    by_month_category: List[MonthCategoryChartItem] = []
    chart_categories: List[ChartCategoryOut] = []
    parent_category: ParentCategoryOut | None = None


class AccountValuePointOut(Schema):
    date: str
    value: float
    contributions: float


class AccountValueOut(Schema):
    account_id: int
    currency: str
    points: List[AccountValuePointOut]


class TransactionHistoryOut(Schema):
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


class HistoryEntryOut(HistoryGroupRef):
    """One line of the History timeline: a single history row (count 1, with
    its own snapshot and `changes`) or the rows one action wrote (count > 1,
    `changes` then holding history.summary()'s shared values)."""
    count: int
    changed_at: datetime  # the newest row's
    started_at: datetime  # the oldest row's
    changed_by_user_name: str | None = None
    transaction_id: int | None = None
    date: Optional[_DateType] = None
    payee: str | None = None
    amount: float | None = None
    account_id: int | None = None
    category_id: int | None = None
    changes: dict | None = None


class HistoryPageOut(Schema):
    items: list[HistoryEntryOut]
    next_before_id: int | None = None


class HistoryRowsOut(Schema):
    items: list[TransactionHistoryOut]
    total: int
