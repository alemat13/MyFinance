"""The user's order of account type groups (models.AccountTypeOrder)."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from models import AccountTypeOrder


def type_key(account_type: str | None) -> str:
    """The grouping key of an account type, as `utils/accountGroups.ts` builds it."""
    return (account_type or "").strip().lower()


def positions(db: Session) -> dict[str, int]:
    return {
        row.type_key: row.position
        for row in db.scalars(select(AccountTypeOrder).order_by(AccountTypeOrder.position))
    }


def ordered_keys(db: Session) -> list[str]:
    return list(positions(db))


def set_order(db: Session, types: list[str]) -> None:
    """Replaces the whole order: `types` first to last, duplicates (after
    normalising) and blanks dropped. Commits."""
    for row in db.scalars(select(AccountTypeOrder)).all():
        db.delete(row)
    db.flush()
    seen: set[str] = set()
    for t in types:
        key = type_key(t)
        if not key or key in seen:
            continue
        seen.add(key)
        db.add(AccountTypeOrder(type_key=key, position=len(seen) - 1))
    db.commit()
