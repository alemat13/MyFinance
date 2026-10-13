"""add transaction_rules

Holds the automatic rules (see transaction_rules.py): conditions in the
advanced filter's own shape, and the bulk-edit actions a rule applies.

New table, so nothing to backfill. sync_schema() would not have created it on
its own — it only adds missing columns to tables that already exist.

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-13 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0018'
down_revision: Union[str, Sequence[str], None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'transaction_rules',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('match_mode', sa.String(length=3), nullable=False),
        sa.Column('conditions', sa.JSON(), nullable=False),
        sa.Column('actions', sa.JSON(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('transaction_rules')
