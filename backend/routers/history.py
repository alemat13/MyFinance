"""Endpoints for the History screen: the timeline of every change to every
transaction, a bulk action shown as one entry (see history.py)."""
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

import history
from database import get_db
from models import TransactionHistory, User
from schemas import HistoryEntryOut, HistoryPageOut, HistoryRowsOut, TransactionHistoryOut

router = APIRouter(prefix="/api/history")


def _user_names(db: Session) -> dict[int, str]:
    return {u.id: u.name for u in db.query(User).all()}


def _row_out(r: TransactionHistory, names: dict[int, str]) -> TransactionHistoryOut:
    return TransactionHistoryOut(
        id=r.id, transaction_id=r.transaction_id, action=r.action, source=r.source,
        changed_at=r.changed_at, changed_by_user_id=r.changed_by_user_id,
        changed_by_user_name=names.get(r.changed_by_user_id),
        date=r.date, payee=r.payee, memo=r.memo, amount=r.amount,
        account_id=r.account_id, category_id=r.category_id,
        accounting_month_offset=r.accounting_month_offset, changes=r.changes,
    )


def _entry_out(entry: history.Entry, names: dict[int, str]) -> HistoryEntryOut:
    first = entry.first
    single = entry.count == 1
    return HistoryEntryOut(
        first_id=first.id, last_id=entry.last.id, action=first.action, source=first.source,
        changed_by_user_id=first.changed_by_user_id, batch_id=first.batch_id,
        count=entry.count, changed_at=first.changed_at, started_at=entry.last.changed_at,
        changed_by_user_name=names.get(first.changed_by_user_id),
        transaction_id=first.transaction_id if single else None,
        date=first.date if single else None,
        payee=first.payee if single else None,
        amount=first.amount if single else None,
        account_id=first.account_id if single else None,
        category_id=first.category_id if single else None,
        changes=first.changes if single else history.summary(entry),
    )


@router.get("", response_model=HistoryPageOut)
def list_history(
    before_id: int | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    action: Literal["created", "updated", "deleted"] | None = Query(None),
    source: Literal[history.SOURCES] | None = Query(None),
    db: Session = Depends(get_db),
):
    entries, next_before_id = history.scan(db, before_id=before_id, limit=limit, action=action, source=source)
    names = _user_names(db)
    return HistoryPageOut(items=[_entry_out(e, names) for e in entries], next_before_id=next_before_id)


@router.get("/rows", response_model=HistoryRowsOut)
def list_entry_rows(
    first_id: int,
    last_id: int,
    action: str,
    source: str | None = Query(None),
    changed_by_user_id: int | None = Query(None),
    batch_id: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    """The rows behind one entry, newest first: what each transaction looked
    like and what changed on it, deleted ones included."""
    query = db.query(TransactionHistory).filter(
        history.group_filter(first_id, last_id, action, source, changed_by_user_id, batch_id))
    total = query.count()
    rows = query.order_by(TransactionHistory.id.desc()).offset(offset).limit(limit).all()
    names = _user_names(db)
    return HistoryRowsOut(items=[_row_out(r, names) for r in rows], total=total)
