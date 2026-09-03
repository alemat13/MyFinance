from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload, selectinload

from database import get_db
from models import Category, CategorySplit
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


@router.get("", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).options(
        joinedload(Category.parent),
        selectinload(Category.splits).joinedload(CategorySplit.user),
    ).all()
    return [build_category_out(c) for c in categories]


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
