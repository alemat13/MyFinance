from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import charts as charts_module
from database import get_db
from schemas import CategoryChartItem, ChartsResponse, MonthChartItem, NetMonthChartItem

router = APIRouter(prefix="/api/charts")


@router.get("", response_model=ChartsResponse)
def get_charts(
    user_id: int = Query(...),
    currency: str | None = Query(None),
    db: Session = Depends(get_db),
):
    by_category, by_month, net_by_month = charts_module.compute_chart_data(db, user_id, currency)
    currencies = sorted({c.currency for c in by_category} | {m.currency for m in by_month})
    return ChartsResponse(
        currencies=currencies,
        by_category=[
            CategoryChartItem(
                category_id=c.category_id, category_name=c.category_name,
                category_type=c.category_type, color=c.color, amount=c.amount, currency=c.currency,
            )
            for c in by_category
        ],
        by_month=[
            MonthChartItem(
                month=m.month, income=m.income, expense=round(abs(m.expense), 2),
                uncategorized=m.uncategorized, currency=m.currency,
            )
            for m in by_month
        ],
        net_by_month=[
            NetMonthChartItem(month=n.month, net=n.net, currency=n.currency)
            for n in net_by_month
        ],
    )
