"""Transactions a bank reports as pending (MYF-82).

A sync asks the bank for every status in one call (no extra call against the
daily cap), imports the booked rows as before and hands the pending ones to
`reload()`, which replaces what the link showed as pending:

- a row still reported is refreshed (amount, date, wording) and keeps the
  user's edits;
- a new row is added;
- a row the bank no longer reports is either booked now, or was a card
  pre-authorisation that has been cancelled. Without user edits it is simply
  deleted. With edits, they are carried over to the booked transaction when
  exactly one fits (same bank identifier, else same amount within a few days,
  imported since the pending row was first seen); otherwise the row waits as
  'to_reconcile' for the user to pick the transaction, or dismiss it, and is
  dropped after RECONCILE_KEEP_DAYS.

Pending rows are in no balance, split, history, aggregate or backup: they
are the bank's provisional view, rebuilt at every sync. The split a user sets
on one waits in `user_split` and becomes the booked row's own (MYF-88).
"""

from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

import audit
import auto_categorize
import cache_service
from database import utcnow
from models import PendingTransaction, Transaction, User

HISTORY_SOURCE = "pending"
# How far apart the pending row's date and the booked row's date may be: a
# card payment is booked a few working days after it was made.
MATCH_WINDOW_DAYS = 7
# How long a gone row with edits waits for the user before being dropped.
RECONCILE_KEEP_DAYS = 14
# Slack on "imported since first seen": the booked row can be created in the
# same sync that first saw the pending one.
_SEEN_SLACK = timedelta(minutes=5)


def has_edits(pending: PendingTransaction) -> bool:
    return (
        pending.user_payee is not None
        or pending.user_category_id is not None
        or bool(pending.user_split)
    )


def split_weights(db: Session, pending: PendingTransaction) -> dict[int, int]:
    """The user's split as {user_id: weight}, users deleted since dropped;
    empty when none is set or none of its users is left."""
    if not pending.user_split:
        return {}
    weights = {int(uid): int(w) for uid, w in pending.user_split.items() if int(w) > 0}
    known = set(db.scalars(select(User.id).where(User.id.in_(weights))).all())
    return {uid: w for uid, w in weights.items() if uid in known}


def candidates(db: Session, pending: PendingTransaction, *, any_amount: bool = False) -> list:
    """Booked transactions of the same account that this pending row may
    have become: imported since it was first seen, dated within the window,
    of the same amount unless `any_amount` (a fuel pre-authorisation of 150 €
    is booked at the 62 € actually spent)."""
    query = select(Transaction).where(
        Transaction.account_id == pending.account_id,
        Transaction.external_id.isnot(None),
        Transaction.created_at >= pending.first_seen_at - _SEEN_SLACK,
        Transaction.date >= pending.date - timedelta(days=MATCH_WINDOW_DAYS),
        Transaction.date <= pending.date + timedelta(days=MATCH_WINDOW_DAYS),
    )
    rows = list(db.scalars(query.order_by(Transaction.date, Transaction.id)).all())
    if any_amount:
        return rows
    return [t for t in rows if abs(t.amount - pending.amount) < 0.005]


def _match(db: Session, pending: PendingTransaction) -> Transaction | None:
    """The one booked transaction this row became, or None when it can't be
    told for sure."""
    same_id = db.scalar(
        select(Transaction)
        .where(
            Transaction.account_id == pending.account_id,
            Transaction.external_id == pending.external_id,
        )
        .limit(1)
    )
    if same_id is not None:
        return same_id
    found = candidates(db, pending)
    return found[0] if len(found) == 1 else None


def apply_edits(
    db: Session,
    pending: PendingTransaction,
    transaction: Transaction,
    actor_user_id=None,
    *,
    resplit: bool = True,
) -> bool:
    """Carry the user's edits over to the booked transaction, with a history
    row. The split the user chose on the pending row, if any, becomes the
    transaction's own (MYF-88). Without one, `resplit` (a row just imported by
    this sync) resolves its split again for the new category, as a sync would
    (MYF-76); never for a row the user picked by hand, which they may have
    split themselves."""
    fields: dict = {}
    if pending.user_payee is not None:
        fields["payee"] = pending.user_payee
    if pending.user_category_id is not None:
        fields["category_id"] = pending.user_category_id
    weights = split_weights(db, pending)
    if not fields and not weights:
        return False
    changed = auto_categorize.write_fields(
        db,
        transaction,
        fields,
        actor_user_id,
        resplit=resplit,
        source=HISTORY_SOURCE,
        split_weights=weights or None,
    )
    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals", "category_usage")
    return changed


def reload(db: Session, link, rows: list[dict]) -> dict:
    """Replace the link's pending rows with `rows` (normalised the way the
    booked import normalises them). Does not commit: runs inside the sync's
    own transaction, after the booked rows were imported."""
    now = utcnow()
    existing = {
        p.external_id: p
        for p in db.scalars(
            select(PendingTransaction).where(PendingTransaction.link_id == link.id)
        ).all()
    }
    seen: set[str] = set()
    summary = {"pending": 0, "carried_over": 0, "to_reconcile": 0, "removed": 0}
    for row in rows:
        external_id = row["external_id"]
        if external_id in seen:
            continue
        seen.add(external_id)
        pending = existing.get(external_id)
        if pending is None:
            pending = PendingTransaction(
                link_id=link.id,
                account_id=link.account_id,
                external_id=external_id,
                first_seen_at=now,
            )
            db.add(pending)
        pending.account_id = link.account_id
        pending.date = row["date"]
        pending.amount = row["amount"]
        pending.payee = row["payee"] or "Unknown"
        pending.memo = row["memo"]
        pending.status = "pending"
        pending.missing_since = None
        pending.last_seen_at = now
        summary["pending"] += 1

    with audit.batch():
        for external_id, pending in existing.items():
            if external_id in seen:
                continue
            if not has_edits(pending):
                db.delete(pending)
                summary["removed"] += 1
                continue
            booked = _match(db, pending)
            if booked is not None:
                apply_edits(db, pending, booked)
                db.delete(pending)
                summary["carried_over"] += 1
                continue
            if pending.missing_since is None:
                pending.missing_since = now
                pending.status = "to_reconcile"
            if now - pending.missing_since > timedelta(days=RECONCILE_KEEP_DAYS):
                db.delete(pending)
                summary["removed"] += 1
            else:
                summary["to_reconcile"] += 1
    return summary


def clear_link(db: Session, link_id: int) -> None:
    """When a link is re-pointed at another account its pending rows no
    longer belong where they are."""
    db.execute(delete(PendingTransaction).where(PendingTransaction.link_id == link_id))
