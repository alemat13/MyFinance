"""Writing the active model's suggestions onto transactions in the database.

`categorizer.py` is deliberately free of app imports — it fits, scores and
pickles, and knows nothing about sessions or audit rows. This module is the
other half: loading whichever model is active and writing what it proposes,
with the history rows and cache invalidation any other mutation site owes.

It exists because three callers need exactly the same write, and getting it
subtly different in each would be a data bug rather than a UI one:
`routers/bank_sync.py` (a sync files its own rows, silently), the import
preview (which only *shows* a suggestion, so it reads from here but writes
nothing) and `POST /api/categorizer/apply` (which takes the rows a person
ticked). Two rules hold in all three:

- **A category already on a row is never overwritten.** A model's guess does
  not overrule somebody's filing, whatever its confidence.
- **A row written here is left `reconciled = False`.** That is the review
  queue: a low-confidence suggestion is applied anyway rather than left
  blank, because an empty category hides a row while an unreconciled one
  shows it, and that is what makes it findable afterwards.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

import cache_service
import categorizer
import split_engine
from audit import TRACKED_FIELDS, _jsonify, diff_splits, record_transaction_history
from models import CategorizerModel, TransactionSplit

logger = logging.getLogger(__name__)

# What the history rows this module writes record as their source, whether the
# suggestion was applied automatically by a sync or ticked by hand.
HISTORY_SOURCE = "categorizer"


@dataclass
class Candidate:
    """The fields the model reads, for a row that is not an ORM object yet.

    The import preview scores rows that exist only in a CSV, and the feature
    extraction in `categorizer.py` reads plain attributes, so a shim with the
    right names is all it needs. `category_id` is there because
    `categorizer.trainable()` and the suggestion path both look at it.
    """

    raw_label: str | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int | None = None
    raw_transaction_code: str | None = None
    category_id: int | None = None
    # Read by the automatic rules, which the import preview runs on the same shim.
    date: object = None
    accounting_month_offset: int = 0
    reconciled: bool = False


def load_active_model(db: Session) -> tuple[CategorizerModel, "categorizer._Model"] | None:
    """The active model and its record, or None when none is active.

    Unpickling costs about a second (it pulls scikit-learn in with it), so a
    caller scoring a batch loads once and keeps it for the whole batch.
    """
    record = db.scalar(
        select(CategorizerModel)
        .where(CategorizerModel.is_active.is_(True), CategorizerModel.status == "ready")
        .limit(1)
    )
    if record is None or record.blob is None:
        return None
    return record, categorizer.loads(record.blob)


def file_rows(db: Session, transactions: list, *, actor_user_id: int | None = None) -> int:
    """Categorise the uncategorised rows with the active model.

    For the feeds that create transactions nobody has looked at yet. Returns
    how many rows were changed; 0 when no model is active, which is the normal
    state until someone trains and activates one, so this is never an error.

    The rows are brand new, created with a split resolved before any category
    was known (the global or account tier), so the split is resolved again
    once the model has filed them: a row filed under a category with its own
    split gets that split, as it would have if created with the category
    (MYF-76; the automatic rules do the same with `fresh=True`).

    Does not commit — the caller's own commit is what makes the write and its
    cache invalidation land together.
    """
    rows = [t for t in transactions if t.category_id is None]
    if not rows:
        return 0

    loaded = load_active_model(db)
    if loaded is None:
        return 0
    _, model = loaded

    # Every prediction is made before anything is written, which is what makes
    # `file_rows_quietly` safe for a caller mid-transaction: the step that can
    # realistically fail (unpickling a blob, scoring it) happens while the
    # session is still untouched, so a failure leaves nothing half-applied.
    predictions = model.predict(rows)
    changed = 0
    for transaction, (category_id, _confidence) in zip(rows, predictions):
        if write_fields(db, transaction, {"category_id": category_id}, actor_user_id, resplit=True):
            changed += 1

    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals", "category_usage")
    return changed


def file_rows_quietly(db: Session, transactions: list, *, actor_user_id: int | None = None) -> int:
    """`file_rows` for a caller that must not fail because of it.

    A sync has already imported its transactions by the time this runs, and
    an uncategorised row is a far better outcome than a sync reported as
    failed and retried. So a broken model — a blob written by an older
    scikit-learn, say — costs the categories and nothing else.
    """
    try:
        return file_rows(db, transactions, actor_user_id=actor_user_id)
    except Exception:
        logger.exception("Automatic categorisation failed; rows were imported uncategorised")
        return 0


def write_fields(
    db: Session,
    transaction,
    fields: dict,
    actor_user_id: int | None,
    *,
    resplit: bool = False,
) -> bool:
    """Set the given fields on a transaction, unreconcile it and record it.

    Returns whether anything actually changed, so a caller can count rows
    rather than attempts. Shared with the apply endpoint so that a suggestion
    ticked by hand and one applied by a sync leave the same trail.

    `resplit` is for a row just created with a split resolved before its
    category was known (the bank sync): the split is resolved again through
    the usual cascade once the category is set, and recorded on the same
    history row. Never for a row somebody may have split by hand.
    """
    before = {
        field: getattr(transaction, field)
        for field in list(fields) + ["reconciled"]
        if field in TRACKED_FIELDS
    }
    for field, value in fields.items():
        setattr(transaction, field, value)
    transaction.reconciled = False
    changes = {
        field: {"old": _jsonify(value), "new": _jsonify(getattr(transaction, field))}
        for field, value in before.items()
        if value != getattr(transaction, field)
    }
    if resplit and "category_id" in changes:
        splits_diff = _resplit(db, transaction)
        if splits_diff:
            changes["splits"] = splits_diff
    if not changes:
        return False
    record_transaction_history(
        db, transaction, "updated", actor_user_id, source=HISTORY_SOURCE, changes=changes
    )
    return True


def _resplit(db: Session, transaction) -> dict | None:
    """Re-resolve a fresh row's default split for its new category; the diff
    when it moved, None otherwise. Mirrors `transaction_rules.write(fresh=True)`."""
    source, weights = split_engine.resolve_default_weights(
        db, transaction.category_id, transaction.account_id
    )
    if not weights:
        return None
    # Read from the table rather than the relationship, which the caller that
    # has just written the row's first split may hold stale, flushed first
    # since that split may not even be in the table yet.
    db.flush()
    existing = {
        s.user_id: (s.weight, s.source)
        for s in db.scalars(
            select(TransactionSplit).where(TransactionSplit.transaction_id == transaction.id)
        ).all()
    }
    source = source or "custom"
    splits_diff = diff_splits(existing, {uid: (w, source) for uid, w in weights.items()})
    if not splits_diff:
        return None
    split_engine.apply_split(db, transaction, weights, source)
    return splits_diff
