from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import charts as charts_module
from database import get_db
from models import Category
from schemas import (
    CategoryChartItem, ChartCategoryOut, ChartsResponse, MonthChartItem,
    MonthCategoryChartItem, NetMonthChartItem, ParentCategoryOut,
)

router = APIRouter(prefix="/api/charts")


@router.get("", response_model=ChartsResponse)
def get_charts(
    user_id: int = Query(...),
    currency: str | None = Query(None),
    start_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    end_month: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    parent_category_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    if parent_category_id is not None:
        parent = db.query(Category).filter(Category.id == parent_category_id).first()
        if parent is None or parent.parent_id is not None or parent.type != "Expense":
            raise HTTPException(400, "parent_category_id must be a top-level Expense category")

    data = charts_module.compute_chart_data_cached(
        db, user_id, currency, start_month, end_month, parent_category_id,
    )
    currencies = sorted({c.currency for c in data.by_category} | {m.currency for m in data.by_month})
    return ChartsResponse(
        currencies=currencies,
        by_category=[
            CategoryChartItem(
                category_id=c.category_id, category_name=c.category_name,
                category_type=c.category_type, color=c.color, amount=c.amount, currency=c.currency,
            )
            for c in data.by_category
        ],
        by_month=[
            MonthChartItem(
                month=m.month, income=m.income, expense=round(abs(m.expense), 2),
                uncategorized=m.uncategorized, currency=m.currency,
            )
            for m in data.by_month
        ],
        net_by_month=[
            NetMonthChartItem(month=n.month, net=n.net, currency=n.currency)
            for n in data.net_by_month
        ],
        by_month_category=[
            MonthCategoryChartItem(month=m.month, category_id=m.category_id, amount=m.amount, currency=m.currency)
            for m in data.by_month_category
        ],
        chart_categories=[
            ChartCategoryOut(category_id=c.category_id, name=c.name, color=c.color, icon=c.icon)
            for c in data.chart_categories
        ],
        parent_category=(
            ParentCategoryOut(id=data.parent_category.id, name=data.parent_category.name)
            if data.parent_category is not None else None
        ),
    )
