"""Checkpoints: what an account is worth at a date, for accounts whose value
moves on its own (investments, life insurance, anything with gains/losses).

A checkpoint is an ordinary transaction whose `checkpoint_value` is set. The
user types the value; its `amount` is derived — the value minus the account's
balance just before it — and stored, so balances, charts, splits and exports
read it like any other amount. Whenever an earlier row of the account is
added, changed, moved or deleted, `recompute()` re-derives every checkpoint
of that account in order: the typed values never move, only the amounts
between them do, so the sum of the account's amounts always lands on the
latest checkpoint.

Order within an account is (date, ordinary rows before checkpoints, id): a
checkpoint is the value at the *end* of its day, so it absorbs every
ordinary row dated the same day. The account's internal `balance_offset`
counts as the starting balance, which makes the displayed balance equal the
latest checkpoint's value plus whatever came after it.
"""

from sqlalchemy import case
from sqlalchemy.orm import Session

import cache_service
import split_engine
from audit import record_transaction_history
from models import Account, Transaction

# The source recorded on the history row of a checkpoint whose amount moved
# because something earlier in its account changed.
HISTORY_SOURCE = "checkpoint"


def has_checkpoints(db: Session, account_id: int) -> bool:
    return db.query(Transaction.id).filter(
        Transaction.account_id == account_id, Transaction.checkpoint_value.isnot(None),
    ).first() is not None


def recompute(
    db: Session, account_ids, actor_user_id: int | None = None, quiet_ids=(),
) -> list[int]:
    """Re-derive every checkpoint amount of these accounts; returns the ids
    whose amount changed. Cheap for an account without checkpoints (one
    indexed lookup), so mutation sites can call it unconditionally.

    Each changed checkpoint gets its split's shares re-prorated (weights
    kept) and a history row (source "checkpoint"), except `quiet_ids`: a
    checkpoint being created right now, whose own "created" row follows.
    Invalidates the caches its new amounts feed; the caller commits.
    """
    db.flush()
    changed: list[int] = []
    for account_id in sorted({a for a in account_ids if a is not None}):
        if not has_checkpoints(db, account_id):
            continue
        account = db.get(Account, account_id)
        running = round(account.balance_offset or 0.0, 2) if account else 0.0
        rows = (
            db.query(Transaction)
            .filter(Transaction.account_id == account_id)
            .order_by(
                Transaction.date,
                case((Transaction.checkpoint_value.is_(None), 0), else_=1),
                Transaction.id,
            )
            .all()
        )
        for transaction in rows:
            if transaction.checkpoint_value is None:
                running += transaction.amount
                continue
            amount = round(transaction.checkpoint_value - running, 2)
            running = transaction.checkpoint_value
            if abs(amount - (transaction.amount or 0.0)) < 0.005:
                continue
            old = transaction.amount
            transaction.amount = amount
            weights = {s.user_id: s.weight for s in transaction.splits}
            source = next((s.source for s in transaction.splits), "custom")
            if weights:
                split_engine.apply_split(db, transaction, weights, source)
                db.expire(transaction, ["splits"])
            if transaction.id not in quiet_ids:
                record_transaction_history(
                    db, transaction, "updated", actor_user_id, source=HISTORY_SOURCE,
                    changes={"amount": {"old": old, "new": amount}},
                )
            changed.append(transaction.id)
    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
    return changed
