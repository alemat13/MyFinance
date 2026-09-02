"""split weights refactor

Replaces percentage-based category splits with an integer-weight model:

- category_splits.split_percentage (float, sum-to-100) is renamed AND
  retyped to weight (integer, no sum requirement). Scaled by 100 (not a
  plain ROUND) so 2-decimal percentages such as 33.33/33.33/33.34 survive
  the float->int conversion as distinct weights (3333/3333/3334) instead of
  collapsing into indistinguishable integers. Every weight in a given split
  is scaled by the same factor, so relative proportions - and therefore
  every future prorata result - are unchanged.
- global_split_weights.weight retypes float -> integer in place, same x100
  scaling.
- transaction_splits.source values are remapped to the new vocabulary
  ('category_default' -> 'category', 'global_default' -> 'global',
  'manual' -> 'custom'). Cosmetic only - source is display-only, never used
  for logic.
- account_split_weights (new table) and transaction_splits.weight (new
  column) are additive-only and would also be picked up automatically by
  sync_schema()/create_all(), but are created here too so Alembic's view of
  the schema doesn't diverge from what's actually in the database.

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0002'
down_revision: Union[str, Sequence[str], None] = '0001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # category_splits: split_percentage (float) -> weight (int).
    # Batch mode (table-recreate on SQLite, plain ALTER on Postgres) so this
    # runs identically in local dev (SQLite, no native ALTER COLUMN/DROP
    # COLUMN-with-constraints) and production (Postgres).
    with op.batch_alter_table('category_splits') as batch_op:
        batch_op.add_column(sa.Column('weight', sa.Integer(), nullable=True))
    op.execute("UPDATE category_splits SET weight = ROUND(split_percentage * 100)")
    with op.batch_alter_table('category_splits') as batch_op:
        batch_op.alter_column('weight', nullable=False, server_default='0')
        batch_op.drop_column('split_percentage')

    # global_split_weights: retype weight float -> int in place, same x100
    # scaling. Values are pre-scaled here (while the column is still a
    # float) so the type-only ALTER below just rounds+casts an
    # already-integral value on every backend - avoids double-scaling and
    # keeps the SQLite batch-recreate path (which ignores postgresql_using
    # and simply copies values, relying on SQLite's INTEGER affinity to
    # coerce an integral REAL to an int) consistent with Postgres.
    op.execute("UPDATE global_split_weights SET weight = ROUND(weight * 100)")
    with op.batch_alter_table('global_split_weights') as batch_op:
        batch_op.alter_column(
            'weight',
            type_=sa.Integer(),
            postgresql_using='ROUND(weight)::INTEGER',
            server_default='0',
        )

    # New middle-priority prefill tier.
    op.create_table(
        'account_split_weights',
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('weight', sa.Integer(), nullable=False, server_default='0'),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('account_id', 'user_id'),
    )

    # transaction_splits: new stored weight column, plus source vocabulary remap.
    with op.batch_alter_table('transaction_splits') as batch_op:
        batch_op.add_column(sa.Column('weight', sa.Integer(), nullable=False, server_default='0'))
    op.execute("UPDATE transaction_splits SET source = 'category' WHERE source = 'category_default'")
    op.execute("UPDATE transaction_splits SET source = 'global' WHERE source = 'global_default'")
    op.execute("UPDATE transaction_splits SET source = 'custom' WHERE source = 'manual'")


def downgrade() -> None:
    op.execute("UPDATE transaction_splits SET source = 'category_default' WHERE source = 'category'")
    op.execute("UPDATE transaction_splits SET source = 'global_default' WHERE source = 'global'")
    op.execute("UPDATE transaction_splits SET source = 'manual' WHERE source = 'custom'")
    with op.batch_alter_table('transaction_splits') as batch_op:
        batch_op.drop_column('weight')

    op.drop_table('account_split_weights')

    # postgresql_using already rescales weight / 100.0 as part of the type
    # conversion on Postgres; SQLite's batch-recreate path ignores
    # postgresql_using entirely and just copies the raw integer value
    # across unscaled, so only SQLite still needs the explicit backfill
    # below. Running it unconditionally on both backends would divide by
    # 100 twice on Postgres.
    with op.batch_alter_table('global_split_weights') as batch_op:
        batch_op.alter_column(
            'weight',
            type_=sa.Float(),
            postgresql_using='weight / 100.0',
            server_default=None,
        )
    if op.get_bind().dialect.name != 'postgresql':
        op.execute("UPDATE global_split_weights SET weight = weight / 100.0")

    with op.batch_alter_table('category_splits') as batch_op:
        batch_op.add_column(sa.Column('split_percentage', sa.Float(), nullable=True))
    op.execute("UPDATE category_splits SET split_percentage = weight / 100.0")
    with op.batch_alter_table('category_splits') as batch_op:
        batch_op.alter_column('split_percentage', nullable=False, server_default='0.0')
        batch_op.drop_column('weight')
