"""store amounts as exact decimals

Every money column (and the account ownership percentage) goes from a
binary float to NUMERIC with two decimal places (MYF-16), so the database
keeps 12.30 as exactly 12.30 and its sums carry no rounding dust. Existing
values are rounded to the cent; a read-only check of production on
2026-11-09 found none with more than two decimals, so no value changes.
Split weights stay integers.

Revision ID: 0028
Revises: 0027
Create Date: 2026-11-09 21:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0028'
down_revision: Union[str, Sequence[str], None] = '0027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (table, column, precision, nullable)
_COLUMNS = [
    ('accounts', 'balance_offset', 12, True),
    ('transactions', 'amount', 12, False),
    ('transactions', 'checkpoint_value', 12, True),
    ('account_users', 'ownership_percentage', 5, False),
    ('transaction_splits', 'share_amount', 12, False),
    ('transaction_history', 'amount', 12, True),
]


def upgrade() -> None:
    for table, column, precision, nullable in _COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                existing_type=sa.Float(),
                type_=sa.Numeric(precision=precision, scale=2),
                existing_nullable=nullable,
                postgresql_using=f'round({column}::numeric, 2)',
            )


def downgrade() -> None:
    for table, column, precision, nullable in _COLUMNS:
        with op.batch_alter_table(table) as batch:
            batch.alter_column(
                column,
                existing_type=sa.Numeric(precision=precision, scale=2),
                type_=sa.Float(),
                existing_nullable=nullable,
                postgresql_using=f'{column}::double precision',
            )
