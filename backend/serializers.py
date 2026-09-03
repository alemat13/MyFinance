"""ORM → Pydantic mapping for every API response shape.

The `*Out` schemas flatten joined columns onto the row (a transaction carries its
account's name and currency, a category its parent's name), so they can't be built
by `model_validate` alone even though they set `from_attributes=True` — hence the
explicit builders here. Keeping them in one place means a new column on a model is
one edit, not one per route that returns it.
"""

from sqlalchemy.orm import joinedload, selectinload

from accounting_month import compute_accounting_month
from models import Account, Category, Transaction, TransactionSplit
from schemas import (
    AccountOut,
    AccountSplitWeightOut,
    AccountUserOut,
    CategoryChartItem,
    CategoryOut,
    CategorySplitOut,
    ChartsResponse,
    MonthChartItem,
    NetMonthChartItem,
    TransactionHistoryOut,
    TransactionOut,
    TransactionSplitOut,
    UserBalanceOut,
)

# Eager-loading for any query feeding `transaction_out`. `innerjoin=True` on the
# account and the default outer join on the category reproduce the hand-written
# `.join(Account)` / `.outerjoin(Category)` these replaced — including dropping a
# row whose nullable `account_id` doesn't resolve, which would otherwise fail
# validation against the non-optional `TransactionOut.account_name`.
TRANSACTION_LOAD_OPTIONS = (
    joinedload(Transaction.account, innerjoin=True),
    joinedload(Transaction.category),
    selectinload(Transaction.splits).joinedload(TransactionSplit.user),
)


def transaction_query(db):
    """Base query for every endpoint returning `TransactionOut`, eager-loaded."""
    return db.query(Transaction).options(*TRANSACTION_LOAD_OPTIONS)


def load_transaction(db, transaction_id: int) -> Transaction | None:
    return transaction_query(db).filter(Transaction.id == transaction_id).first()


# ── Transactions ───────────────────────────────────────────────────

def transaction_split_out(split: TransactionSplit) -> TransactionSplitOut:
    return TransactionSplitOut(
        user_id=split.user_id,
        user_name=split.user.name,
        weight=split.weight,
        share_amount=split.share_amount,
        source=split.source,
    )


def transaction_out(t: Transaction) -> TransactionOut:
    category: Category | None = t.category
    account: Account = t.account
    return TransactionOut(
        id=t.id,
        date=t.date,
        payee=t.payee,
        memo=t.memo,
        amount=t.amount,
        account_id=t.account_id,
        account_name=account.name,
        currency=account.currency,
        category_id=t.category_id,
        category_name=category.name if category else None,
        category_color=category.color if category else None,
        category_icon=category.icon if category else None,
        accounting_month_offset=t.accounting_month_offset,
        accounting_month=compute_accounting_month(t.date, t.accounting_month_offset),
        splits=[transaction_split_out(s) for s in t.splits],
    )


def transaction_history_out(row, users_by_id: dict[int, str]) -> TransactionHistoryOut:
    return TransactionHistoryOut(
        id=row.id,
        transaction_id=row.transaction_id,
        action=row.action,
        source=row.source,
        changed_at=row.changed_at,
        changed_by_user_id=row.changed_by_user_id,
        changed_by_user_name=users_by_id.get(row.changed_by_user_id),
        date=row.date,
        payee=row.payee,
        memo=row.memo,
        amount=row.amount,
        account_id=row.account_id,
        category_id=row.category_id,
        changes=row.changes,
    )


# ── Accounts & categories ──────────────────────────────────────────

def account_out(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        name=account.name,
        type=account.type,
        balance=account.balance,
        currency=account.currency,
        created_at=account.created_at,
        users=[
            AccountUserOut(
                user_id=au.user_id,
                user_name=au.user.name,
                ownership_percentage=au.ownership_percentage,
            )
            for au in account.user_associations
        ],
        split_weights=[
            AccountSplitWeightOut(
                user_id=w.user_id,
                user_name=w.user.name,
                weight=w.weight,
            )
            for w in account.split_weight_associations
        ],
    )


def category_out(category: Category) -> CategoryOut:
    return CategoryOut(
        id=category.id,
        name=category.name,
        type=category.type,
        color=category.color,
        icon=category.icon,
        parent_id=category.parent_id,
        parent_name=category.parent.name if category.parent else None,
        splits=[
            CategorySplitOut(
                user_id=cs.user_id,
                user_name=cs.user.name,
                weight=cs.weight,
            )
            for cs in category.splits
        ],
    )


# ── Balances & charts ──────────────────────────────────────────────

def user_balance_out(row) -> UserBalanceOut:
    """`row` is a (user_id, user_name, currency, net_position) tuple from
    `split_engine.compute_balances`."""
    user_id, user_name, currency, net_position = row
    return UserBalanceOut(
        user_id=user_id,
        user_name=user_name,
        currency=currency,
        net_position=net_position,
    )


def charts_response(by_category, by_month, net_by_month) -> ChartsResponse:
    """Maps `charts.compute_chart_data`'s dataclasses onto the response schema."""
    currencies = sorted({c.currency for c in by_category} | {m.currency for m in by_month})
    return ChartsResponse(
        currencies=currencies,
        by_category=[
            CategoryChartItem(
                category_id=c.category_id,
                category_name=c.category_name,
                category_type=c.category_type,
                color=c.color,
                amount=c.amount,
                currency=c.currency,
            )
            for c in by_category
        ],
        by_month=[
            MonthChartItem(
                month=m.month,
                income=m.income,
                expense=round(abs(m.expense), 2),
                uncategorized=m.uncategorized,
                currency=m.currency,
            )
            for m in by_month
        ],
        net_by_month=[
            NetMonthChartItem(month=n.month, net=n.net, currency=n.currency)
            for n in net_by_month
        ],
    )
