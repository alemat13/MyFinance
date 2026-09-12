"""backfill mandatory global split weights + unsplit transactions

Splits are now mandatory: every transaction must always resolve to a
non-empty TransactionSplit set, guaranteed by making the global
split-weight tier a non-empty floor (every user gets weight=1 by default,
enforced going forward by `create_user` and by `validate_global_weights_present`
rejecting an empty/all-zero PUT to /api/split-weights). This is a data-only
migration, no schema change, with two backfill passes for data that
predates the new invariant:

  1. Insert a `GlobalSplitWeight(weight=1)` row for every existing `User`
     that doesn't already have one.
  2. For every existing `Transaction` with zero `TransactionSplit` rows,
     resolve a split via the same classic category > account > global
     cascade used everywhere else (`split_engine.resolve_default_weights`),
     now guaranteed to succeed once pass 1 has run.

Production has no `users`/`transactions` rows yet at the time this
migration is written, so in practice this only backfills local/dev
databases seeded via `seed.py` (which are the only place unsplit
transactions currently exist). Retroactively attributing old unsplit
transactions via the tier cascade is a best-effort judgment call, not a
recovery of the "true" historical split - acceptable here specifically
because there's no real, opinionated production data to get wrong.

Unlike prior migrations (see 0003), this one reuses the actual Python
`split_engine.resolve_default_weights()` / `apply_split()` functions via an
ORM Session bound to the migration's connection, rather than reimplementing
the logic in raw SQL. That's a deliberate deviation from this repo's usual
raw-`op.execute` style: correctly reimplementing the three-tier cascade
*and* `prorate()`'s remainder-to-last-user rounding in portable
SQLite/Postgres SQL is a real correctness risk, whereas `alembic/env.py`
already imports `models`/`database` directly, so importing `split_engine`
here is consistent with how this repo's migration environment is wired.

Both passes only touch rows still missing what they backfill, so this is
idempotent if re-run.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-07 00:00:00.000000

"""
from types import SimpleNamespace
from typing import Sequence, Union

from alembic import op
from sqlalchemy.orm import Session


# revision identifiers, used by Alembic.
revision: str = '0006'
down_revision: Union[str, Sequence[str], None] = '0005'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    from models import GlobalSplitWeight, Transaction, User
    from split_engine import apply_split, resolve_default_weights

    session = Session(bind=op.get_bind())

    # Pass 1: bootstrap the mandatory global floor for every user who
    # predates this change.
    users_without_global = (
        session.query(User)
        .outerjoin(GlobalSplitWeight, GlobalSplitWeight.user_id == User.id)
        .filter(GlobalSplitWeight.user_id.is_(None))
        .all()
    )
    for user in users_without_global:
        session.add(GlobalSplitWeight(user_id=user.id, weight=1))
    session.flush()

    # Pass 2: backfill any transaction with zero split rows via the classic
    # category > account > global cascade - now guaranteed to resolve, since
    # every user has a positive global weight from pass 1.
    #
    # Selects only the columns this pass needs, rather than
    # `session.query(Transaction)` - the latter SELECTs every column the
    # live `models.py` maps, including ones added by later migrations (e.g.
    # `reconciled`, added by 0007), which don't exist yet at this point when
    # upgrading a database from scratch.
    unsplit_transactions = (
        session.query(Transaction.id, Transaction.category_id, Transaction.account_id, Transaction.amount)
        .filter(~Transaction.splits.any())
        .all()
    )
    for txn_id, category_id, account_id, amount in unsplit_transactions:
        source, weights = resolve_default_weights(session, category_id, account_id)
        if weights:
            apply_split(session, SimpleNamespace(id=txn_id, amount=amount), weights, source=source or "global")

    session.commit()


def downgrade() -> None:
    # No-op, same reasoning as 0003: there's no way to distinguish rows this
    # migration inserted from ones a user has since edited normally, so
    # reverting would either do nothing useful or destroy real edits.
    pass
