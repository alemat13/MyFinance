"""Groups of linked transactions (models.TransactionLink): business logic
shared by their endpoints and by the transaction deletes that can leave a
group too small.

Joining or leaving a group is recorded in each transaction's history as a
`link` entry, {"old": ..., "new": ...} holding the group's label (its name,
else "#id") before and after, under source="link".
"""

from sqlalchemy.orm import Session

from audit import record_transaction_history
from models import Transaction, TransactionLink


def label(link: TransactionLink | None) -> str | None:
    if link is None:
        return None
    return link.name or f"#{link.id}"


def _set(db: Session, transaction: Transaction, link: TransactionLink | None,
         old_label: str | None, actor_user_id: int | None) -> None:
    transaction.link_id = None if link is None else link.id
    new_label = label(link)
    if old_label != new_label:
        record_transaction_history(db, transaction, "updated", actor_user_id, source="link",
                                   changes={"link": {"old": old_label, "new": new_label}})


def link(db: Session, transactions: list[Transaction], name: str | None,
         actor_user_id: int | None) -> TransactionLink:
    """Puts these transactions in one group. Groups some of them already
    belong to are merged into the oldest, whose members come along."""
    groups = {
        g.id: g for g in db.query(TransactionLink)
        .filter(TransactionLink.id.in_({t.link_id for t in transactions if t.link_id is not None})).all()
    }
    # Each member's label before the change, for its history row.
    labels = {gid: label(g) for gid, g in groups.items()}
    if groups:
        target = groups[min(groups)]
        others = [groups[gid] for gid in sorted(groups) if gid != target.id]
        if not target.name:
            target.name = next((g.name for g in others if g.name), None)
    else:
        target, others = TransactionLink(), []
        db.add(target)
    if name is not None and name.strip():
        target.name = name.strip()
    db.flush()

    members = {t.id: t for t in transactions}
    if others:
        for t in db.query(Transaction).filter(Transaction.link_id.in_([g.id for g in others])).all():
            members.setdefault(t.id, t)
    if groups:
        for t in db.query(Transaction).filter(Transaction.link_id == target.id).all():
            members.setdefault(t.id, t)
    for t in sorted(members.values(), key=lambda t: t.id):
        _set(db, t, target, labels.get(t.link_id), actor_user_id)
    db.flush()
    for g in others:
        db.delete(g)
    return target


def unlink(db: Session, group: TransactionLink, transaction_ids: set[int] | None,
           actor_user_id: int | None) -> bool:
    """Takes these transactions (None: all of them) out of the group; one
    left with fewer than two members is dissolved. Returns whether the group
    still exists."""
    members = db.query(Transaction).filter(Transaction.link_id == group.id).order_by(Transaction.id).all()
    leaving = [t for t in members if transaction_ids is None or t.id in transaction_ids]
    staying = [t for t in members if t not in leaving]
    if len(staying) < 2:
        leaving = members
    old_label = label(group)
    for t in leaving:
        _set(db, t, None, old_label, actor_user_id)
    db.flush()
    if len(leaving) == len(members):
        db.delete(group)
        db.flush()
        return False
    return True


def prune(db: Session, link_ids, actor_user_id: int | None = None) -> None:
    """Dissolves the groups among these that a delete left with fewer than
    two members. Call after the delete has been flushed."""
    for link_id in {i for i in link_ids if i is not None}:
        group = db.get(TransactionLink, link_id)
        if group is None:
            continue
        if db.query(Transaction).filter(Transaction.link_id == link_id).count() < 2:
            unlink(db, group, None, actor_user_id)
