"""Endpoints for the Transactions screen's saved filters (models.SavedFilter)."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import SavedFilter
from rules import RuleViolation
from schemas import SavedFilterCreate, SavedFilterOrderRequest, SavedFilterOut, SavedFilterUpdate

router = APIRouter(prefix="/api/saved-filters")


def _get(db: Session, filter_id: int) -> SavedFilter:
    saved = db.query(SavedFilter).filter(SavedFilter.id == filter_id).first()
    if saved is None:
        raise HTTPException(404, "Saved filter not found")
    return saved


def _clean_name(name: str) -> str:
    name = name.strip()
    if not name:
        raise RuleViolation("A saved filter needs a name.")
    return name


@router.get("", response_model=list[SavedFilterOut])
def list_saved_filters(db: Session = Depends(get_db)):
    return db.query(SavedFilter).order_by(SavedFilter.position, SavedFilter.id).all()


@router.post("", response_model=SavedFilterOut, status_code=201)
def create_saved_filter(data: SavedFilterCreate, db: Session = Depends(get_db)):
    last = db.query(func.max(SavedFilter.position)).scalar()
    saved = SavedFilter(
        name=_clean_name(data.name),
        mode=data.mode,
        filters=data.filters,
        position=(last if last is not None else -1) + 1,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)
    return saved


# Registered before /{filter_id} so "order" is never read as an id.
@router.put("/order", response_model=list[SavedFilterOut])
def reorder_saved_filters(data: SavedFilterOrderRequest, db: Session = Depends(get_db)):
    saved = {f.id: f for f in db.query(SavedFilter).all()}
    if sorted(data.filter_ids) != sorted(saved):
        raise RuleViolation("The new order must list every saved filter exactly once.")
    for position, filter_id in enumerate(data.filter_ids):
        saved[filter_id].position = position
    db.commit()
    return list_saved_filters(db)


@router.put("/{filter_id}", response_model=SavedFilterOut)
def update_saved_filter(filter_id: int, data: SavedFilterUpdate, db: Session = Depends(get_db)):
    saved = _get(db, filter_id)
    if data.name is not None:
        saved.name = _clean_name(data.name)
    if (data.mode is None) != (data.filters is None):
        raise RuleViolation("mode and filters are replaced together.")
    if data.mode is not None:
        saved.mode = data.mode
        saved.filters = data.filters
    db.commit()
    db.refresh(saved)
    return saved


@router.delete("/{filter_id}", status_code=204)
def delete_saved_filter(filter_id: int, db: Session = Depends(get_db)):
    db.delete(_get(db, filter_id))
    db.commit()
