"""add transactions.divide_group_id

Adds a nullable, indexed `transactions.divide_group_id` column used by the
new "divide a transaction" feature (splitting one transaction's amount into
several new transactions by category/date — unrelated to TransactionSplit,
which divides a transaction's amount among users). Set to the anchor part's
own id on every row in the group, including the anchor. Deliberately NOT a
ForeignKey (same reasoning as TransactionHistory's plain-Integer columns):
a real FK would block deleting one sibling while others in the group still
reference the anchor's id.

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0009'
down_revision: Union[str, Sequence[str], None] = '0008'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.add_column(sa.Column('divide_group_id', sa.Integer(), nullable=True))
    op.create_index('ix_transactions_divide_group_id', 'transactions', ['divide_group_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_transactions_divide_group_id', table_name='transactions')
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.drop_column('divide_group_id')
