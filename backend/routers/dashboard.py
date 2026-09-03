"""Aggregate read-only views: the dashboard summary and the charts data."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import charts
import serializers
import split_engine
from database import get_db
from filtering import visible_transaction_filter
from models import Account, AccountUser, Transaction
from schemas import ChartsResponse, DashboardResponse

router = APIRouter()


@router.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    accounts_query = db.query(Account)
    if user_id is not None:
        accounts_query = accounts_query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = accounts_query.all()

    tx_query = serializers.transaction_query(db)
    if user_id is not None:
        tx_query = tx_query.filter(visible_transaction_filter(db, user_id))
    recent_results = tx_query.order_by(Transaction.date.desc()).limit(10).all()

    recent_transactions = [serializers.transaction_out(t) for t in recent_results]
    balances = [
        serializers.user_balance_out(row)
        for row in split_engine.compute_balances(db, user_id=user_id)
    ]

    return DashboardResponse(
        accounts=[serializers.account_out(a) for a in accounts],
        recent_transactions=recent_transactions,
        balances=balances,
    )


# ── Charts ────────────────────────────────────────────────────────

@router.get("/api/charts", response_model=ChartsResponse)
def get_charts(
    user_id: int = Query(...),
    currency: str | None = Query(None),
    db: Session = Depends(get_db),
):
    by_category, by_month, net_by_month = charts.compute_chart_data(db, user_id, currency)
    return serializers.charts_response(by_category, by_month, net_by_month)
