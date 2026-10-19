"""Endpoints for tags (models.Tag): the list with usage counts, create,
rename/recolour and delete. Which transactions carry a tag is written through
the transaction endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

import audit
import tags
from audit import record_transaction_history
from database import get_db
from models import Tag, Transaction, TransactionTag
from rules import RuleViolation
from schemas import TagCreate, TagOut, TagUpdate

router = APIRouter(prefix="/api/tags")


def _get(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(404, "Tag not found")
    return tag


def _check_unique(db: Session, name: str, tag_id: int | None = None) -> None:
    query = db.query(Tag).filter(func.lower(Tag.name) == name.lower())
    if tag_id is not None:
        query = query.filter(Tag.id != tag_id)
    if query.first() is not None:
        raise RuleViolation(f'A tag named "{name}" already exists.')


def _out(db: Session, tag: Tag) -> TagOut:
    count = db.query(func.count()).select_from(TransactionTag).filter(TransactionTag.tag_id == tag.id).scalar()
    return TagOut(id=tag.id, name=tag.name, color=tag.color, transaction_count=count or 0)


@router.get("", response_model=list[TagOut])
def list_tags(db: Session = Depends(get_db)):
    counts = dict(
        db.query(TransactionTag.tag_id, func.count()).group_by(TransactionTag.tag_id).all()
    )
    return [
        TagOut(id=t.id, name=t.name, color=t.color, transaction_count=counts.get(t.id, 0))
        for t in db.query(Tag).order_by(func.lower(Tag.name)).all()
    ]


@router.post("", response_model=TagOut, status_code=201)
def create_tag(data: TagCreate, db: Session = Depends(get_db)):
    _check_unique(db, data.name)
    tag = Tag(name=data.name, color=data.color)
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _out(db, tag)


@router.put("/{tag_id}", response_model=TagOut)
def update_tag(tag_id: int, data: TagUpdate, db: Session = Depends(get_db)):
    tag = _get(db, tag_id)
    fields = data.model_dump(exclude_unset=True)
    if fields.get("name") is not None:
        _check_unique(db, fields["name"], tag_id)
        tag.name = fields["name"]
    if "color" in fields:
        tag.color = fields["color"]
    db.commit()
    db.refresh(tag)
    return _out(db, tag)


@router.delete("/{tag_id}", status_code=204)
@audit.batched
def delete_tag(tag_id: int, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    """Removes the tag from every transaction carrying it, each one getting a
    history row like any other tag change."""
    tag = _get(db, tag_id)
    carrying = (
        db.query(Transaction)
        .join(TransactionTag, TransactionTag.transaction_id == Transaction.id)
        .filter(TransactionTag.tag_id == tag_id)
        .options(selectinload(Transaction.tags))
        .all()
    )
    for transaction in carrying:
        change = tags.add_remove_tags(transaction, [], [tag])
        if change:
            record_transaction_history(db, transaction, "updated", actor_user_id, changes={"tags": change})
    db.flush()
    db.delete(tag)
    db.commit()
