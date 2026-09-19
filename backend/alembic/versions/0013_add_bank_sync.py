"""add bank sync tables and transactions.external_id

Backs the Enable Banking transaction sync (enable_banking.py):

- bank_connections: one row per consent granted with one bank.
- bank_account_links: one row per account that consent exposes, plus the
  MyFinance account it feeds.
- transactions.external_id: the identifier the bank gave a synced row, with
  a unique index per account so a re-sync of an overlapping window can't
  duplicate anything. Existing rows keep NULL, which the index allows any
  number of - that is what makes this safe to run against the migrated
  production ledger.

The two new tables would be picked up by create_all() anyway, and the plain
nullable column by sync_schema(), but the unique index is beyond what either
can do, so the whole change is written out here.

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-19 22:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0013'
down_revision: Union[str, Sequence[str], None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'bank_connections',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('aspsp_name', sa.String(length=100), nullable=False),
        sa.Column('aspsp_country', sa.String(length=2), nullable=False),
        sa.Column('state', sa.String(length=64), nullable=False),
        sa.Column('authorization_id', sa.String(length=64), nullable=True),
        sa.Column('session_id', sa.String(length=64), nullable=True),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('access_valid_until', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bank_connections_state', 'bank_connections', ['state'])

    op.create_table(
        'bank_account_links',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('connection_id', sa.Integer(), nullable=False),
        sa.Column('remote_account_uid', sa.String(length=64), nullable=False),
        sa.Column('iban', sa.String(length=50), nullable=True),
        sa.Column('remote_name', sa.String(length=200), nullable=True),
        sa.Column('currency', sa.String(length=3), nullable=True),
        sa.Column('account_id', sa.Integer(), nullable=True),
        sa.Column('sync_enabled', sa.Boolean(), nullable=False),
        sa.Column('sync_from_date', sa.Date(), nullable=True),
        sa.Column('last_synced_at', sa.DateTime(), nullable=True),
        sa.Column('last_sync_status', sa.String(length=20), nullable=True),
        sa.Column('last_sync_error', sa.Text(), nullable=True),
        sa.Column('last_imported_count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['connection_id'], ['bank_connections.id'], ),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_bank_account_links_connection_id', 'bank_account_links', ['connection_id'])
    op.create_index('ix_bank_account_links_account_id', 'bank_account_links', ['account_id'])

    op.add_column('transactions', sa.Column('external_id', sa.String(length=120), nullable=True))
    op.create_index(
        'ix_transactions_account_id_external_id', 'transactions',
        ['account_id', 'external_id'], unique=True,
    )


def downgrade() -> None:
    op.drop_index('ix_transactions_account_id_external_id', table_name='transactions')
    op.drop_column('transactions', 'external_id')
    op.drop_index('ix_bank_account_links_account_id', table_name='bank_account_links')
    op.drop_index('ix_bank_account_links_connection_id', table_name='bank_account_links')
    op.drop_table('bank_account_links')
    op.drop_index('ix_bank_connections_state', table_name='bank_connections')
    op.drop_table('bank_connections')
