"""add email_alerts

Each user's email alert on new transactions (see models.EmailAlert).

New table, so nothing to backfill. sync_schema() would not have created it on
its own — it only adds missing columns to tables that already exist.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-16 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0021'
down_revision: Union[str, Sequence[str], None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'email_alerts',
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=True),
        sa.Column('daily', sa.Boolean(), nullable=False),
        sa.Column('weekly', sa.Boolean(), nullable=False),
        sa.Column('monthly', sa.Boolean(), nullable=False),
        sa.Column('last_daily_sent_at', sa.DateTime(), nullable=True),
        sa.Column('last_weekly_sent_at', sa.DateTime(), nullable=True),
        sa.Column('last_monthly_sent_at', sa.DateTime(), nullable=True),
        sa.Column('last_status', sa.String(length=20), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('user_id'),
    )


def downgrade() -> None:
    op.drop_table('email_alerts')
