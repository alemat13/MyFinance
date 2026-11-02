"""Dashboard, charts and history timeline responses."""

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict

from .base import Schema, _DateType
from .entities import AccountOut, UserBalanceOut
from .search import HistoryGroupRef
from .transactions import TransactionOut


class DashboardResponse(Schema):
    accounts: list[AccountOut]
    recent_transactions: list[TransactionOut]
    balances: list[UserBalanceOut] = []


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
    currencies: list[str]
    by_category: list[CategoryChartItem]
    by_month: list[MonthChartItem]
    net_by_month: list[NetMonthChartItem]
    by_month_category: list[MonthCategoryChartItem] = []
    chart_categories: list[ChartCategoryOut] = []
    parent_category: ParentCategoryOut | None = None


class AccountValuePointOut(Schema):
    date: str
    value: float
    contributions: float


class AccountValueOut(Schema):
    account_id: int
    currency: str
    points: list[AccountValuePointOut]


class TransactionHistoryOut(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: str | None = None
    changed_at: datetime
    changed_by_user_id: int | None = None
    changed_by_user_name: str | None = None
    date: _DateType | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int | None = None
    category_id: int | None = None
    accounting_month_offset: int | None = None
    changes: dict | None = None


class HistoryEntryOut(HistoryGroupRef):
    """One line of the History timeline: a single history row (count 1, with
    its own snapshot and `changes`) or the rows one action wrote (count > 1,
    `changes` then holding history.summary()'s shared values)."""

    count: int
    changed_at: datetime  # the newest row's
    started_at: datetime  # the oldest row's
    changed_by_user_name: str | None = None
    transaction_id: int | None = None
    date: _DateType | None = None
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
