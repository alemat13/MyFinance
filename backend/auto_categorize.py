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

from sqlalchemy.orm import Session

import cache_service
import categorizer
from audit import TRACKED_FIELDS, _jsonify, record_transaction_history
from models import CategorizerModel

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


def load_active_model(db: Session) -> tuple[CategorizerModel, "categorizer._Model"] | None:
    """The active model and its record, or None when none is active.

    Unpickling costs about a second (it pulls scikit-learn in with it), so a
    caller scoring a batch loads once and keeps it for the whole batch.
    """
    record = (
        db.query(CategorizerModel)
        .filter(CategorizerModel.is_active.is_(True), CategorizerModel.status == "ready")
        .first()
    )
    if record is None or record.blob is None:
        return None
    return record, categorizer.loads(record.blob)


def file_rows(db: Session, transactions: list, *, actor_user_id: int | None = None) -> int:
    """Categorise and rename the rows the active model has something to say about.

    For the feeds that create transactions nobody has looked at yet. Returns
    how many rows were changed; 0 when no model is active, which is the normal
    state until someone trains and activates one, so this is never an error.

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
        payee = model.payee_memory.suggest(transaction) if model.payee_memory else None
        fields: dict[str, object] = {"category_id": category_id}
        if payee and payee != transaction.payee:
            fields["payee"] = payee
        if write_fields(db, transaction, fields, actor_user_id):
            changed += 1

    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
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
    except Exception:  # noqa: BLE001 - logged, and the import itself still stands
        logger.exception("Automatic categorisation failed; rows were imported uncategorised")
        return 0


def write_fields(db: Session, transaction, fields: dict, actor_user_id: int | None) -> bool:
    """Set the given fields on a transaction, unreconcile it and record it.

    Returns whether anything actually changed, so a caller can count rows
    rather than attempts. Shared with the apply endpoint so that a suggestion
    ticked by hand and one applied by a sync leave the same trail.
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
    if not changes:
        return False
    record_transaction_history(db, transaction, "updated", actor_user_id,
                               source=HISTORY_SOURCE, changes=changes)
    return True
