"""transaction_history.batch_id, and an index on changed_at

batch_id ties together the history rows one action wrote (a bulk edit, an
import, a sync), so the History screen can show them as one entry. Nullable
and left NULL on every existing row: those are grouped by guesswork when
listed, never rewritten. The two indexes serve that screen.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-19 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0023'
down_revision: Union[str, Sequence[str], None] = '0022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # sync_schema() may already have added the column on startup.
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('transaction_history')}
    if 'batch_id' not in columns:
        op.add_column('transaction_history', sa.Column('batch_id', sa.String(length=32), nullable=True))
    op.create_index(op.f('ix_transaction_history_batch_id'), 'transaction_history', ['batch_id'], unique=False)
    op.create_index(op.f('ix_transaction_history_changed_at'), 'transaction_history', ['changed_at'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_transaction_history_changed_at'), table_name='transaction_history')
    op.drop_index(op.f('ix_transaction_history_batch_id'), table_name='transaction_history')
    op.drop_column('transaction_history', 'batch_id')
