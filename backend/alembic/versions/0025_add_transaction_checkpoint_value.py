"""add transactions.checkpoint_value

Checkpoints (see checkpoints.py): a nullable column, NULL on every existing
row, so nothing to backfill.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-26 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0025'
down_revision: Union[str, Sequence[str], None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # sync_schema() may already have added it on startup.
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('transactions')}
    if 'checkpoint_value' not in columns:
        op.add_column('transactions', sa.Column('checkpoint_value', sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.drop_column('checkpoint_value')
