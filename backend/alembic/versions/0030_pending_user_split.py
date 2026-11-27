"""add pending_transactions.user_split

The split a user sets on a pending transaction, carried to the booked row
(MYF-88).

Revision ID: 0030
Revises: 0029
Create Date: 2026-11-27 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0030'
down_revision: Union[str, Sequence[str], None] = '0029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('pending_transactions', sa.Column('user_split', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('pending_transactions', 'user_split')
