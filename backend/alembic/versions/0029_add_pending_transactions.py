"""add pending_transactions

Operations the bank reports as pending, reloaded at every sync (MYF-82).

Revision ID: 0029
Revises: 0028
Create Date: 2026-11-18 17:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0029'
down_revision: Union[str, Sequence[str], None] = '0028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'pending_transactions',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('link_id', sa.Integer(), nullable=False),
        sa.Column('account_id', sa.Integer(), nullable=False),
        sa.Column('external_id', sa.String(length=120), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('payee', sa.String(length=200), nullable=False),
        sa.Column('memo', sa.Text(), nullable=True),
        sa.Column('user_payee', sa.String(length=200), nullable=True),
        sa.Column('user_category_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('first_seen_at', sa.DateTime(), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False),
        sa.Column('missing_since', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['link_id'], ['bank_account_links.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_category_id'], ['categories.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_pending_transactions_account_id', 'pending_transactions', ['account_id'], unique=False
    )
    op.create_index(
        'ix_pending_transactions_link_id', 'pending_transactions', ['link_id'], unique=False
    )
    op.create_index(
        'ix_pending_transactions_link_id_external_id',
        'pending_transactions',
        ['link_id', 'external_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('ix_pending_transactions_link_id_external_id', table_name='pending_transactions')
    op.drop_index('ix_pending_transactions_link_id', table_name='pending_transactions')
    op.drop_index('ix_pending_transactions_account_id', table_name='pending_transactions')
    op.drop_table('pending_transactions')
