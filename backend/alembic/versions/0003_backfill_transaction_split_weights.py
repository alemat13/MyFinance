"""backfill transaction_splits.weight

0002 added transaction_splits.weight with server_default='0' but never
backfilled it from the split rows that already existed (unlike
category_splits.weight / global_split_weights.weight in that same
migration, which both got an explicit backfill UPDATE). Since 0002 has
already run in production, every transaction split that existed before it
is stuck at weight=0 for every user, which either 422s on edit
(_validate_weights requires at least one weight > 0) or, via the path that
omits split_weights, silently recomputes share_amount to 0.0 for real
historical transactions. This is a data-only fix - no schema change.

Backfill strategy, per still-zero row: derive an integer weight from that
user's existing share_amount relative to the transaction's amount, scaled
by 10000 (same style of scaling 0002 already uses for percentages), so the
relative proportions the split already had are preserved. Since
prorate() always makes shares sum exactly to the transaction's amount, any
transaction with a non-zero amount is guaranteed to end up with at least
one positive weight from this pass. Transactions whose amount was 0 (so
every share was necessarily 0 too) can't be back-derived this way; those
get an equal weight of 1 per involved user as a fallback, so
_validate_weights's "at least one weight > 0" invariant holds for every
transaction split afterward.

Only rows still at weight=0 are touched, so this is safe to run
conservatively and is idempotent if re-run.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0003'
down_revision: Union[str, Sequence[str], None] = '0002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Pass 1: derive weight from this row's existing share_amount relative
    # to its transaction's amount, for every transaction with a non-zero
    # amount. Correlated subqueries (rather than UPDATE...FROM) so this
    # runs identically on SQLite and Postgres.
    op.execute("""
        UPDATE transaction_splits
        SET weight = CAST(ROUND(
            ABS(share_amount)
            / ABS((SELECT t.amount FROM transactions t WHERE t.id = transaction_splits.transaction_id))
            * 10000
        ) AS INTEGER)
        WHERE weight = 0
          AND (SELECT t.amount FROM transactions t WHERE t.id = transaction_splits.transaction_id) != 0
    """)

    # Pass 2: fallback for transactions whose amount was 0 (every share was
    # necessarily 0, so pass 1 couldn't derive anything) - give every
    # remaining involved user an equal weight of 1.
    op.execute("""
        UPDATE transaction_splits
        SET weight = 1
        WHERE weight = 0
          AND transaction_id IN (
              SELECT transaction_id FROM transaction_splits GROUP BY transaction_id HAVING MAX(weight) = 0
          )
    """)


def downgrade() -> None:
    # No-op: reverting these weights back to 0 would just reintroduce the
    # data-loss bug this migration fixes (edit-lockout / share_amount
    # zeroing), and the original weight values weren't recoverable to begin
    # with - they were never captured pre-0002.
    pass
