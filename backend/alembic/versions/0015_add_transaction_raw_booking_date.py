"""add transactions.raw_booking_date

Bank-synced transactions are now dated by the day they were made
(transaction_date), so the bank's booking date needs a place of its own in
the read-only raw_* fields. Nullable and plain, like the rest of 0014: no
backfill, rows imported before this keep it empty.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-25 12:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0015'
down_revision: Union[str, Sequence[str], None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('transactions', sa.Column('raw_booking_date', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('transactions', 'raw_booking_date')
