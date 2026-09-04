from sqlalchemy.orm import Session

from accounting_month import compute_accounting_month
from models import Account, Category, Transaction, User
from schemas import (
    AccountOut, AccountSplitWeightOut, AccountUserOut,
    CategoryOut, CategorySplitOut,
    TransactionOut, TransactionSplitOut,
)


def build_account_out(account: Account) -> AccountOut:
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


def build_transaction_splits_out(t: Transaction) -> list[TransactionSplitOut]:
    return [
        TransactionSplitOut(
            user_id=s.user_id,
            user_name=s.user.name,
            weight=s.weight,
            share_amount=s.share_amount,
            source=s.source,
        )
        for s in t.splits
    ]


def build_transaction_out_from_row(
    t: Transaction,
    account_name: str,
    currency: str,
    category_name: str | None,
    category_color: str | None,
    category_icon: str | None,
) -> TransactionOut:
    return TransactionOut(
        id=t.id,
        date=t.date,
        payee=t.payee,
        memo=t.memo,
        amount=t.amount,
        account_id=t.account_id,
        account_name=account_name,
        currency=currency,
        category_id=t.category_id,
        category_name=category_name,
        category_color=category_color,
        category_icon=category_icon,
        accounting_month_offset=t.accounting_month_offset,
        accounting_month=compute_accounting_month(t.date, t.accounting_month_offset),
        splits=build_transaction_splits_out(t),
    )


def get_transaction_out(db: Session, transaction_id: int) -> TransactionOut:
    t, account_name, currency, category_name, category_color, category_icon = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(Transaction.id == transaction_id)
        .first()
    )
    return build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)


def build_category_out(category: Category) -> CategoryOut:
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


def build_split_weight_rows(weights_by_user: dict[int, int], users: list[User], out_cls):
    return [
        out_cls(user_id=u.id, user_name=u.name, weight=weights_by_user.get(u.id, 0))
        for u in users
    ]
