"""Tags on transactions: business logic shared by the endpoints that write
them (one transaction, bulk edit, import commit, automatic rules).

Every change to a transaction's tags is recorded in its history as a
`tags` entry of the usual {"old": ..., "new": ...} shape, holding the tag
names before and after, so a tag renamed or deleted later still reads as it
was then.
"""

from sqlalchemy.orm import Session

from models import Tag, Transaction
from rules import RuleViolation


def load_tags(db: Session, tag_ids: list[int] | None) -> list[Tag]:
    """The tags with these ids, in name order; refuses an unknown id."""
    ids = sorted(set(tag_ids or []))
    if not ids:
        return []
    tags = db.query(Tag).filter(Tag.id.in_(ids)).order_by(Tag.name).all()
    missing = sorted(set(ids) - {t.id for t in tags})
    if missing:
        raise RuleViolation(f"Tag(s) not found: {missing}")
    return tags


def _names(tags) -> list[str]:
    return sorted(t.name for t in tags)


def set_tags(transaction: Transaction, tags: list[Tag]) -> dict | None:
    """Give the transaction exactly these tags. Returns the history change,
    or None when the set did not change."""
    before = _names(transaction.tags)
    if {t.id for t in transaction.tags} == {t.id for t in tags}:
        return None
    transaction.tags = sorted(tags, key=lambda t: t.name)
    return {"old": before, "new": _names(transaction.tags)}


def add_remove_tags(transaction: Transaction, add: list[Tag], remove: list[Tag]) -> dict | None:
    """Add and remove tags, keeping the transaction's others."""
    remove_ids = {t.id for t in remove}
    kept = [t for t in transaction.tags if t.id not in remove_ids]
    kept_ids = {t.id for t in kept}
    return set_tags(transaction, kept + [t for t in add if t.id not in kept_ids])


def created_change(tags: list[Tag]) -> dict | None:
    """The history entry of a transaction created with these tags."""
    return {"old": None, "new": _names(tags)} if tags else None
