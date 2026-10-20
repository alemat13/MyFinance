"""Endpoints for groups of linked transactions (models.TransactionLink):
link a selection, read a group with its net, rename it, take members out or
dissolve it. The logic lives in transaction_links.py."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import audit
import transaction_links
from database import get_db
from models import Transaction, TransactionLink
from rules import RuleViolation
from schemas import (
    TransactionLinkCreate,
    TransactionLinkOut,
    TransactionLinkTotal,
    TransactionLinkUnlink,
    TransactionLinkUpdate,
)
from serializers import get_transaction_out

router = APIRouter(prefix="/api/transaction-links")


def _get(db: Session, link_id: int) -> TransactionLink:
    group = db.get(TransactionLink, link_id)
    if group is None:
        raise HTTPException(404, "Linked group not found")
    return group


def _out(db: Session, group: TransactionLink) -> TransactionLinkOut:
    members = (
        db.query(Transaction)
        .filter(Transaction.link_id == group.id)
        .order_by(Transaction.date, Transaction.id)
        .all()
    )
    items = [get_transaction_out(db, t.id) for t in members]
    totals: dict[str, float] = {}
    for item in items:
        totals[item.currency] = totals.get(item.currency, 0.0) + item.amount
    return TransactionLinkOut(
        id=group.id,
        name=group.name,
        transactions=items,
        totals=[TransactionLinkTotal(currency=c, amount=round(a, 2)) for c, a in sorted(totals.items())],
    )


@router.post("", response_model=TransactionLinkOut, status_code=201)
@audit.batched
def create_link(data: TransactionLinkCreate, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    ids = sorted(set(data.transaction_ids))
    if len(ids) < 2:
        raise RuleViolation("Pick at least two transactions to link.")
    transactions = db.query(Transaction).filter(Transaction.id.in_(ids)).all()
    missing = sorted(set(ids) - {t.id for t in transactions})
    if missing:
        raise HTTPException(404, f"Transaction(s) not found: {missing}")
    group = transaction_links.link(db, transactions, data.name, actor_user_id)
    db.commit()
    return _out(db, group)


@router.get("/{link_id}", response_model=TransactionLinkOut)
def get_link(link_id: int, db: Session = Depends(get_db)):
    return _out(db, _get(db, link_id))


@router.put("/{link_id}", response_model=TransactionLinkOut)
def rename_link(link_id: int, data: TransactionLinkUpdate, db: Session = Depends(get_db)):
    group = _get(db, link_id)
    group.name = (data.name or "").strip() or None
    db.commit()
    return _out(db, group)


@router.post("/{link_id}/unlink", response_model=TransactionLinkOut | None)
@audit.batched
def unlink_transactions(link_id: int, data: TransactionLinkUnlink, actor_user_id: int | None = Query(None),
                        db: Session = Depends(get_db)):
    """The group as it is afterwards, or null when it was dissolved."""
    group = _get(db, link_id)
    still_there = transaction_links.unlink(db, group, set(data.transaction_ids), actor_user_id)
    db.commit()
    return _out(db, group) if still_there else None


@router.delete("/{link_id}", status_code=204)
@audit.batched
def delete_link(link_id: int, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    """Dissolves the group; its transactions are left as they are."""
    transaction_links.unlink(db, _get(db, link_id), None, actor_user_id)
    db.commit()
