"""Endpoints for pending bank transactions (models.PendingTransaction, see
pending_transactions.py): the list, the user's edits, picking the booked
transaction a gone row became, and dismissing it."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

import audit
import pending_transactions
from database import get_db
from models import Category, PendingTransaction, Transaction
from schemas import (
    PendingCandidateOut,
    PendingReconcileRequest,
    PendingTransactionOut,
    PendingTransactionUpdate,
)

router = APIRouter(prefix="/api/pending-transactions")


def _get(db: Session, pending_id: int) -> PendingTransaction:
    pending = db.get(PendingTransaction, pending_id)
    if pending is None:
        raise HTTPException(404, "Pending transaction not found")
    return pending


def _out(db: Session, pending: PendingTransaction) -> PendingTransactionOut:
    found = (
        pending_transactions.candidates(db, pending, any_amount=True)
        if pending.status == "to_reconcile"
        else []
    )
    return PendingTransactionOut(
        id=pending.id,
        account_id=pending.account_id,
        date=pending.date,
        amount=pending.amount,
        payee=pending.user_payee or pending.payee,
        bank_payee=pending.payee,
        memo=pending.memo,
        category_id=pending.user_category_id,
        status=pending.status,
        edited=pending_transactions.has_edits(pending),
        candidates=[
            PendingCandidateOut(id=t.id, date=t.date, payee=t.payee, amount=t.amount) for t in found
        ],
    )


@router.get("", response_model=list[PendingTransactionOut])
def list_pending(account_id: list[int] = Query(default=[]), db: Session = Depends(get_db)):
    query = select(PendingTransaction)
    if account_id:
        query = query.where(PendingTransaction.account_id.in_(account_id))
    rows = db.scalars(
        query.order_by(PendingTransaction.date.desc(), PendingTransaction.id.desc())
    ).all()
    return [_out(db, p) for p in rows]


@router.put("/{pending_id}", response_model=PendingTransactionOut)
def update_pending(pending_id: int, data: PendingTransactionUpdate, db: Session = Depends(get_db)):
    pending = _get(db, pending_id)
    if data.category_id is not None and db.get(Category, data.category_id) is None:
        raise HTTPException(422, "Category not found")
    payee = (data.payee or "").strip()
    pending.user_payee = payee if payee and payee != pending.payee else None
    pending.user_category_id = data.category_id
    db.commit()
    db.refresh(pending)
    return _out(db, pending)


@router.post("/{pending_id}/reconcile", status_code=204)
def reconcile_pending(
    pending_id: int, data: PendingReconcileRequest, db: Session = Depends(get_db)
):
    """The user says which booked transaction this row became: its edits go
    there, and the row is gone."""
    pending = _get(db, pending_id)
    transaction = db.get(Transaction, data.transaction_id)
    if transaction is None or transaction.account_id != pending.account_id:
        raise HTTPException(422, "Pick a transaction of the same account")
    with audit.batch():
        pending_transactions.apply_edits(db, pending, transaction, resplit=False)
    db.delete(pending)
    db.commit()


@router.delete("/{pending_id}", status_code=204)
def dismiss_pending(pending_id: int, db: Session = Depends(get_db)):
    """Only a row the bank no longer reports: one it still reports would
    simply come back at the next sync."""
    pending = _get(db, pending_id)
    if pending.status != "to_reconcile":
        raise HTTPException(409, "The bank still reports this transaction as pending")
    db.delete(pending)
    db.commit()
