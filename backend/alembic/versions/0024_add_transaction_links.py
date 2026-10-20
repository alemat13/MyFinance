"""add transaction_links and transactions.link_id

Groups of linked transactions (see models.TransactionLink). A new table and
a nullable column, so nothing to backfill.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-20 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0024'
down_revision: Union[str, Sequence[str], None] = '0023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    # create_all()/sync_schema() may already have made either on startup.
    if 'transaction_links' not in inspector.get_table_names():
        op.create_table(
            'transaction_links',
            sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
            sa.Column('name', sa.String(length=100), nullable=True),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
    columns = {c['name'] for c in inspector.get_columns('transactions')}
    has_fk = any(fk['referred_table'] == 'transaction_links' for fk in inspector.get_foreign_keys('transactions'))
    if 'link_id' not in columns or not has_fk:
        with op.batch_alter_table('transactions') as batch_op:
            if 'link_id' not in columns:
                batch_op.add_column(sa.Column('link_id', sa.Integer(), nullable=True))
            batch_op.create_foreign_key(
                'fk_transactions_link_id_transaction_links', 'transaction_links', ['link_id'], ['id'],
                ondelete='SET NULL',
            )
    if 'ix_transactions_link_id' not in {i['name'] for i in inspector.get_indexes('transactions')}:
        op.create_index(op.f('ix_transactions_link_id'), 'transactions', ['link_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_transactions_link_id'), table_name='transactions')
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.drop_constraint('fk_transactions_link_id_transaction_links', type_='foreignkey')
        batch_op.drop_column('link_id')
    op.drop_table('transaction_links')
