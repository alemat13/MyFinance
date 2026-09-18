from dataclasses import asdict, dataclass

from sqlalchemy import or_
from sqlalchemy.orm import Session

import cache_service
from models import Account, Category, Transaction, TransactionSplit
from accounting_month import compute_accounting_month


@dataclass
class CategoryAmount:
    category_id: int | None
    category_name: str
    category_type: str  # "Income" | "Expense" | "Uncategorized"
    color: str | None
    amount: float  # signed sum of the user's share_amount
    currency: str


@dataclass
class MonthAmounts:
    month: str  # "YYYY-MM"
    income: float  # sum of share_amount for Income categories (>= 0 in normal use)
    expense: float  # sum of share_amount for Expense categories (<= 0, i.e. still signed)
    uncategorized: float  # sum of share_amount for transactions with no category (signed, own bucket)
    currency: str


@dataclass
class NetMonth:
    month: str
    net: float  # income + expense (signed), i.e. income - |expense|
    currency: str


@dataclass
class MonthCategoryAmount:
    month: str
    category_id: int | None  # None = Uncategorized
    amount: float  # signed sum of the user's share_amount
    currency: str


@dataclass
class ChartCategory:
    category_id: int | None
    name: str
    color: str | None
    icon: str | None


@dataclass
class ParentCategoryInfo:
    id: int
    name: str


@dataclass
class ChartsData:
    by_category: list[CategoryAmount]
    by_month: list[MonthAmounts]
    net_by_month: list[NetMonth]
    by_month_category: list[MonthCategoryAmount]
    chart_categories: list[ChartCategory]
    parent_category: ParentCategoryInfo | None


def _query_rows(db: Session, user_id: int, currency: str | None, start_month: str | None, end_month: str | None):
    """Yields the user's TransactionSplit rows joined with their transaction/
    category/account, each already resolved to its accounting month and
    filtered to [start_month, end_month] (inclusive, either bound optional).

    Filtering happens here against the *computed* accounting month string
    (compute_accounting_month, "YYYY-MM", lexicographically comparable) -
    never against Transaction.date directly - so a transaction whose raw date
    falls outside the range but whose accounting_month_offset shifts it in
    (or vice versa) is filtered consistently with how every other monthly
    bucket in this module already works.
    """
    query = (
        db.query(
            TransactionSplit.share_amount,
            Transaction.date,
            Transaction.accounting_month_offset,
            Category.id,
            Category.name,
            Category.type,
            Category.color,
            Category.icon,
            Category.parent_id,
            Account.currency,
        )
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .outerjoin(Category, Category.id == Transaction.category_id)
        .join(Account, Account.id == Transaction.account_id)
        .filter(TransactionSplit.user_id == user_id)
        .filter(or_(Category.type.is_(None), Category.type.in_(("Income", "Expense"))))
    )
    if currency is not None:
        query = query.filter(Account.currency == currency)

    for share_amount, t_date, offset, cat_id, cat_name, cat_type, cat_color, cat_icon, cat_parent_id, cur in query.all():
        month = compute_accounting_month(t_date, offset)
        if start_month is not None and month < start_month:
            continue
        if end_month is not None and month > end_month:
            continue
        yield share_amount, month, cat_id, cat_name, cat_type, cat_color, cat_icon, cat_parent_id, cur


def _build_chart_categories(
    seg_ids: set[int | None],
    category_by_id: dict[int, Category],
    month_cat_agg: dict[tuple[str, int | None, str], float],
) -> list[ChartCategory]:
    """Segments for the current view, sorted by total absolute spend
    (descending) so stacking order is stable and the biggest category is
    most visible; "Uncategorized" (category_id None) always sorts last
    regardless of its magnitude, matching the app's existing convention of
    keeping it visually distinct rather than competing for prominence.
    """
    totals: dict[int | None, float] = {}
    for (_, seg, _), v in month_cat_agg.items():
        totals[seg] = totals.get(seg, 0.0) + abs(v)

    ordered = sorted((s for s in seg_ids if s is not None), key=lambda s: -totals.get(s, 0.0))
    result = [
        ChartCategory(
            category_id=s,
            name=category_by_id[s].name,
            color=category_by_id[s].color,
            icon=category_by_id[s].icon,
        )
        for s in ordered
    ]
    if None in seg_ids:
        result.append(ChartCategory(category_id=None, name="Uncategorized", color=None, icon=None))
    return result


def compute_chart_data(
    db: Session,
    user_id: int,
    currency: str | None = None,
    start_month: str | None = None,
    end_month: str | None = None,
    parent_category_id: int | None = None,
) -> ChartsData:
    """Aggregates user_id's TransactionSplit.share_amount by category and by
    accounting month (each transaction's date shifted by its own
    accounting_month_offset via compute_accounting_month), excluding
    Transfer-type categories entirely.

    Like split_engine.compute_balances, this only counts transactions where
    user_id has their own TransactionSplit row - splits are mandatory, so
    every transaction has *some* split, but a given user only shows up in it
    (and therefore here) if they have a positive weight in it; a user with
    weight 0 or no row at all in an otherwise-valid split is normal and
    simply excludes that transaction from their own chart data, distinct
    from the transaction being unsplit (which shouldn't happen). Never sums
    across currencies - each currency is aggregated independently.

    by_month_category additionally breaks Expense (+ Uncategorized) spend
    down per month and per category, for the Spending-per-month chart. With
    parent_category_id=None (the top-level/overview view), a subcategory's
    spend rolls up into its parent - a rollup that deliberately does NOT
    apply to by_category above, which stays flat/ungrouped as it always has.
    With parent_category_id=X (a drilldown), only rows belonging to that
    category's own subtree are kept (transactions categorized directly on X
    itself, or on one of X's direct children), grouped by their own
    category_id so a "direct to parent" bucket and each child subcategory
    render as separate segments - a case Linxo (the reference this chart is
    modeled on) doesn't have, since MyFinance allows both a parent and its
    children to be directly assigned to a transaction.
    """
    category_by_id = {c.id: c for c in db.query(Category).all()}

    category_agg: dict[tuple[int | None, str], dict] = {}
    month_agg: dict[tuple[str, str], dict] = {}
    month_cat_agg: dict[tuple[str, int | None, str], float] = {}

    for share_amount, month, cat_id, cat_name, cat_type, cat_color, cat_icon, cat_parent_id, cur in _query_rows(
        db, user_id, currency, start_month, end_month,
    ):
        ckey = (cat_id, cur)
        centry = category_agg.setdefault(ckey, {
            "name": cat_name if cat_id is not None else "Uncategorized",
            "type": cat_type if cat_type is not None else "Uncategorized",
            "color": cat_color,
            "amount": 0.0,
        })
        centry["amount"] += share_amount

        mkey = (month, cur)
        mentry = month_agg.setdefault(mkey, {"income": 0.0, "expense": 0.0, "uncategorized": 0.0})
        # Uncategorized transactions get their own bucket rather than being
        # guessed into Income/Expense by the sign of share_amount - that
        # heuristic would silently apply a different classification rule
        # than every categorized transaction uses.
        if cat_type is None:
            mentry["uncategorized"] += share_amount
        elif cat_type == "Income":
            mentry["income"] += share_amount
        else:
            mentry["expense"] += share_amount

        if cat_type in (None, "Expense"):
            if parent_category_id is None:
                seg_id = cat_id if (cat_id is None or cat_parent_id is None) else cat_parent_id
                include = True
            else:
                include = cat_id is not None and (cat_id == parent_category_id or cat_parent_id == parent_category_id)
                seg_id = cat_id
            if include:
                key = (month, seg_id, cur)
                month_cat_agg[key] = month_cat_agg.get(key, 0.0) + share_amount

    by_category = [
        CategoryAmount(
            category_id=cid, category_name=v["name"], category_type=v["type"], color=v["color"],
            amount=round(v["amount"], 2), currency=cur,
        )
        for (cid, cur), v in category_agg.items()
    ]
    by_month = [
        MonthAmounts(
            month=m, income=round(v["income"], 2), expense=round(v["expense"], 2),
            uncategorized=round(v["uncategorized"], 2), currency=cur,
        )
        for (m, cur), v in month_agg.items()
    ]
    net_by_month = [
        NetMonth(month=m, net=round(v["income"] + v["expense"] + v["uncategorized"], 2), currency=cur)
        for (m, cur), v in month_agg.items()
    ]
    by_month_category = [
        MonthCategoryAmount(month=m, category_id=seg, amount=round(v, 2), currency=cur)
        for (m, seg, cur), v in month_cat_agg.items()
        if round(v, 2) != 0
    ]
    seg_ids_present = {seg for (_, seg, _) in month_cat_agg}
    chart_categories = _build_chart_categories(seg_ids_present, category_by_id, month_cat_agg)
    parent_category = (
        None if parent_category_id is None
        else ParentCategoryInfo(id=parent_category_id, name=category_by_id[parent_category_id].name)
    )

    by_category.sort(key=lambda i: (i.currency, -abs(i.amount)))
    by_month.sort(key=lambda i: (i.currency, i.month))
    net_by_month.sort(key=lambda i: (i.currency, i.month))
    by_month_category.sort(key=lambda i: (i.currency, i.month))
    return ChartsData(
        by_category=by_category,
        by_month=by_month,
        net_by_month=net_by_month,
        by_month_category=by_month_category,
        chart_categories=chart_categories,
        parent_category=parent_category,
    )


def compute_chart_data_cached(
    db: Session,
    user_id: int,
    currency: str | None = None,
    start_month: str | None = None,
    end_month: str | None = None,
    parent_category_id: int | None = None,
) -> ChartsData:
    """Same result as compute_chart_data, cached in the "charts" namespace.

    Invalidated wherever transaction/split/account/category data that could
    change these sums is mutated - see cache_service.invalidate call sites.
    """
    def _compute() -> dict:
        return asdict(compute_chart_data(db, user_id, currency, start_month, end_month, parent_category_id))

    payload = cache_service.get_or_compute(
        db, "charts",
        {
            "user_id": user_id, "currency": currency, "start_month": start_month,
            "end_month": end_month, "parent_category_id": parent_category_id,
        },
        _compute,
    )
    return ChartsData(
        by_category=[CategoryAmount(**c) for c in payload["by_category"]],
        by_month=[MonthAmounts(**m) for m in payload["by_month"]],
        net_by_month=[NetMonth(**n) for n in payload["net_by_month"]],
        by_month_category=[MonthCategoryAmount(**m) for m in payload["by_month_category"]],
        chart_categories=[ChartCategory(**c) for c in payload["chart_categories"]],
        parent_category=ParentCategoryInfo(**payload["parent_category"]) if payload["parent_category"] else None,
    )
