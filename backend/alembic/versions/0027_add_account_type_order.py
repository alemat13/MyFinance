"""add account_type_order

The user's order of account type groups on the Accounts screen (MYF-70).

Revision ID: 0027
Revises: 0026
Create Date: 2026-11-02 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0027'
down_revision: Union[str, Sequence[str], None] = '0026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'account_type_order',
        sa.Column('type_key', sa.String(length=50), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint('type_key'),
    )


def downgrade() -> None:
    op.drop_table('account_type_order')
