from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, selectinload

import split_engine
from database import get_db
from filtering import visible_transaction_filter
from models import Account, AccountSplitWeight, AccountUser, Category, Transaction, TransactionSplit
from schemas import DashboardResponse, UserBalanceOut
from serializers import build_account_out, build_transaction_out_from_row

router = APIRouter(prefix="/api/dashboard")


@router.get("", response_model=DashboardResponse)
def get_dashboard(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    accounts_query = db.query(Account).options(
        selectinload(Account.user_associations).joinedload(AccountUser.user),
        selectinload(Account.split_weight_associations).joinedload(AccountSplitWeight.user),
    )
    if user_id is not None:
        accounts_query = accounts_query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = accounts_query.all()

    tx_query = (
        db.query(Transaction, Account.name, Account.currency, Category.name, Category.color, Category.icon)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .options(selectinload(Transaction.splits).joinedload(TransactionSplit.user))
    )
    if user_id is not None:
        tx_query = tx_query.filter(visible_transaction_filter(db, user_id))
    recent_results = tx_query.order_by(Transaction.date.desc()).limit(10).all()

    recent_transactions = [
        build_transaction_out_from_row(t, account_name, currency, category_name, category_color, category_icon)
        for t, account_name, currency, category_name, category_color, category_icon in recent_results
    ]

    balances = [
        UserBalanceOut(user_id=uid, user_name=user_name, currency=currency, net_position=net_position)
        for uid, user_name, currency, net_position in split_engine.compute_balances(db, user_id=user_id)
    ]

    return DashboardResponse(
        accounts=[build_account_out(a) for a in accounts],
        recent_transactions=recent_transactions,
        balances=balances,
    )
