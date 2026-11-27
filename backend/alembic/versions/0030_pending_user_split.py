"""pending transactions: the user's split and the automatic suggestion

The split a user sets on a pending transaction, carried to the booked row,
and what the categorisation model and automatic rules suggest for it
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
    with op.batch_alter_table('pending_transactions') as batch_op:
        batch_op.add_column(sa.Column('user_split', sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column('suggested_payee', sa.String(length=200), nullable=True))
        batch_op.add_column(sa.Column('suggested_category_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('suggested_split', sa.JSON(), nullable=True))
        batch_op.create_foreign_key(
            'fk_pending_transactions_suggested_category_id_categories',
            'categories',
            ['suggested_category_id'],
            ['id'],
            ondelete='SET NULL',
        )


def downgrade() -> None:
    with op.batch_alter_table('pending_transactions') as batch_op:
        batch_op.drop_constraint(
            'fk_pending_transactions_suggested_category_id_categories', type_='foreignkey'
        )
        batch_op.drop_column('suggested_split')
        batch_op.drop_column('suggested_category_id')
        batch_op.drop_column('suggested_payee')
        batch_op.drop_column('user_split')
