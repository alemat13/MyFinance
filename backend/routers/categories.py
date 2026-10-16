from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload, selectinload

import cache_service
from database import get_db
from models import Category, CategorySplit, Transaction
from rules import validate_category_hierarchy, validate_category_update, validate_weights
from schemas import CategoryCreate, CategoryOut, CategorySplitCreate, CategoryUpdate
from serializers import build_category_out

router = APIRouter(prefix="/api/categories")


def _sync_category_splits(db: Session, category: Category, splits: list[CategorySplitCreate]):
    db.query(CategorySplit).filter(CategorySplit.category_id == category.id).delete()
    for s in splits:
        db.add(CategorySplit(
            category_id=category.id,
            user_id=s.user_id,
            weight=s.weight,
        ))


def _usage_counts(db: Session) -> dict[int, int]:
    """Transactions filed directly under each category, household-wide.

    Cached in the `category_usage` namespace, invalidated wherever a
    transaction is created, deleted or recategorised (the same sites as
    `account_totals`). Counted per category itself, not rolled up, so moving
    a subcategory under another parent needs no invalidation: the roll-up is
    redone from the current hierarchy on every read.
    """
    def compute():
        rows = (
            db.query(Transaction.category_id, func.count(Transaction.id))
            .filter(Transaction.category_id.isnot(None))
            .group_by(Transaction.category_id)
            .all()
        )
        return {str(cid): n for cid, n in rows}

    cached = cache_service.get_or_compute(db, "category_usage", {}, compute)
    return {int(k): v for k, v in cached.items()}


def order_by_usage(categories: list[Category], counts: dict[int, int]) -> list[Category]:
    """Most used first: top-level categories by their transactions plus their
    subcategories', each followed by its subcategories by their own count.
    Ties fall back to the name, so the order is stable."""
    children: dict[int, list[Category]] = {}
    for c in categories:
        if c.parent_id is not None:
            children.setdefault(c.parent_id, []).append(c)
    own = lambda c: counts.get(c.id, 0)
    name = lambda c: c.name.lower()
    parent_ids = {c.id for c in categories if c.parent_id is None}
    parents = sorted(
        (c for c in categories if c.parent_id is None),
        key=lambda p: (-(own(p) + sum(own(ch) for ch in children.get(p.id, []))), name(p)),
    )
    ordered: list[Category] = []
    for p in parents:
        ordered.append(p)
        ordered.extend(sorted(children.get(p.id, []), key=lambda ch: (-own(ch), name(ch))))
    # A subcategory whose parent is missing cannot happen (FK), but never drop a row.
    ordered.extend(c for c in categories if c.parent_id is not None and c.parent_id not in parent_ids)
    return ordered


@router.get("", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).options(
        joinedload(Category.parent),
        selectinload(Category.splits).joinedload(CategorySplit.user),
    ).all()
    return [build_category_out(c) for c in order_by_usage(categories, _usage_counts(db))]


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    validate_weights(data.splits)
    validate_category_hierarchy(db, None, data.parent_id, data.type)
    category = Category(name=data.name, type=data.type, color=data.color, icon=data.icon, parent_id=data.parent_id)
    db.add(category)
    db.flush()
    _sync_category_splits(db, category, data.splits)
    db.commit()
    db.refresh(category)
    return build_category_out(category)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    update_data = data.model_dump(exclude_unset=True)
    splits_data = update_data.pop("splits", None)
    if splits_data is not None:
        validate_weights(data.splits)

    validate_category_update(db, category, update_data)

    if splits_data is not None:
        _sync_category_splits(db, category, data.splits)
    for field, value in update_data.items():
        setattr(category, field, value)
    # A category's type can move it in/out of charts' Income/Expense/Transfer
    # grouping without any Transaction row changing.
    cache_service.invalidate(db, "charts")
    db.commit()
    db.refresh(category)
    return build_category_out(category)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    if category.transactions:
        raise HTTPException(409, "Cannot delete category with existing transactions")
    if category.children:
        raise HTTPException(409, "Cannot delete category with existing subcategories")
    db.delete(category)
    db.commit()
