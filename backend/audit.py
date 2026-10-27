import functools
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import date as date_type

from models import Transaction, TransactionHistory

TRACKED_FIELDS = ("date", "payee", "memo", "amount", "account_id", "category_id", "accounting_month_offset", "reconciled", "checkpoint_value")


def _jsonify(value):
    return value.isoformat() if isinstance(value, date_type) else value


def _splits_snapshot(splits: dict[int, tuple[int, str]]) -> list[dict]:
    return [{"user_id": uid, "weight": weight, "source": source}
            for uid, (weight, source) in sorted(splits.items())]


def diff_splits(old_splits: dict[int, tuple[int, str]], new_splits: dict[int, tuple[int, str]]) -> dict | None:
    if old_splits == new_splits:
        return None
    return {"old": _splits_snapshot(old_splits), "new": _splits_snapshot(new_splits)}


def splits_created_changes(weights: dict[int, int] | None, source: str) -> dict | None:
    if not weights:
        return None
    return {"splits": {"old": None, "new": _splits_snapshot({uid: (w, source) for uid, w in weights.items()})}}


# The batch the history rows being written belong to, when one action writes
# many of them (a bulk edit, an import, a sync...). The History screen shows a
# batch as one line instead of thousands; see history.py.
_current_batch: ContextVar[str | None] = ContextVar("history_batch", default=None)


@contextmanager
def batch():
    """Tag every history row written inside the block with one shared batch id.
    Nested blocks join the outer batch, so a sync that also runs the rules and
    the categorizer stays one batch."""
    if _current_batch.get() is not None:
        yield _current_batch.get()
        return
    token = _current_batch.set(uuid.uuid4().hex)
    try:
        yield _current_batch.get()
    finally:
        _current_batch.reset(token)


def batched(func):
    """Run `func` inside batch(): for an endpoint or a feed that writes many
    history rows in one go. functools.wraps keeps the signature FastAPI reads."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        with batch():
            return func(*args, **kwargs)
    return wrapper


def record_transaction_history(db, transaction: Transaction, action: str,
                                actor_user_id: int | None = None,
                                source: str | None = None,
                                changes: dict | None = None) -> None:
    db.add(TransactionHistory(
        transaction_id=transaction.id,
        action=action,
        source=source,
        batch_id=_current_batch.get(),
        changed_by_user_id=actor_user_id,
        date=transaction.date,
        payee=transaction.payee,
        memo=transaction.memo,
        amount=transaction.amount,
        account_id=transaction.account_id,
        category_id=transaction.category_id,
        accounting_month_offset=transaction.accounting_month_offset,
        changes=changes,
    ))
