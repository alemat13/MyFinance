from dataclasses import dataclass

from sqlalchemy.orm import Session

from models import Account, Category, Transaction, TransactionSplit
from accounting_month import compute_accounting_month


@dataclass
class CategoryAmount:
    category_id: int
    category_name: str
    category_type: str  # "Income" | "Expense"
    amount: float  # signed sum of the user's share_amount
    currency: str


@dataclass
class MonthAmounts:
    month: str  # "YYYY-MM"
    income: float  # sum of share_amount for Income categories (>= 0 in normal use)
    expense: float  # sum of share_amount for Expense categories (<= 0, i.e. still signed)
    currency: str


@dataclass
class NetMonth:
    month: str
    net: float  # income + expense (signed), i.e. income - |expense|
    currency: str


def compute_chart_data(
    db: Session, user_id: int, currency: str | None = None
) -> tuple[list[CategoryAmount], list[MonthAmounts], list[NetMonth]]:
    """Aggregates user_id's TransactionSplit.share_amount by category and by
    accounting month (each transaction's date shifted by its own
    accounting_month_offset via compute_accounting_month), excluding
    Transfer-type categories entirely.

    Like split_engine.compute_balances, this only counts transactions that
    have a resolved TransactionSplit row for user_id (opt-in split) and never
    sums across currencies - each currency is aggregated independently.
    Aggregation happens in Python after fetching rows, since the month-shift
    isn't expressible as a plain SQL GROUP BY key.
    """
    query = (
        db.query(
            TransactionSplit.share_amount,
            Transaction.date,
            Transaction.accounting_month_offset,
            Category.id,
            Category.name,
            Category.type,
            Account.currency,
        )
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Category, Category.id == Transaction.category_id)
        .join(Account, Account.id == Transaction.account_id)
        .filter(TransactionSplit.user_id == user_id)
        .filter(Category.type.in_(("Income", "Expense")))
    )
    if currency is not None:
        query = query.filter(Account.currency == currency)

    category_agg: dict[tuple[int, str], dict] = {}
    month_agg: dict[tuple[str, str], dict] = {}

    for share_amount, t_date, offset, cat_id, cat_name, cat_type, cur in query.all():
        ckey = (cat_id, cur)
        centry = category_agg.setdefault(ckey, {"name": cat_name, "type": cat_type, "amount": 0.0})
        centry["amount"] += share_amount

        month = compute_accounting_month(t_date, offset)
        mkey = (month, cur)
        mentry = month_agg.setdefault(mkey, {"income": 0.0, "expense": 0.0})
        if cat_type == "Income":
            mentry["income"] += share_amount
        else:
            mentry["expense"] += share_amount

    by_category = [
        CategoryAmount(
            category_id=cid, category_name=v["name"], category_type=v["type"],
            amount=round(v["amount"], 2), currency=cur,
        )
        for (cid, cur), v in category_agg.items()
    ]
    by_month = [
        MonthAmounts(month=m, income=round(v["income"], 2), expense=round(v["expense"], 2), currency=cur)
        for (m, cur), v in month_agg.items()
    ]
    net_by_month = [
        NetMonth(month=m, net=round(v["income"] + v["expense"], 2), currency=cur)
        for (m, cur), v in month_agg.items()
    ]

    by_category.sort(key=lambda i: (i.currency, -abs(i.amount)))
    by_month.sort(key=lambda i: (i.currency, i.month))
    net_by_month.sort(key=lambda i: (i.currency, i.month))
    return by_category, by_month, net_by_month
