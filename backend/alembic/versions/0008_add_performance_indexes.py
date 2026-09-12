"""add performance indexes

Adds indexes for columns that are hit on nearly every request but had none:
`transactions.account_id`/`category_id`/`date` (plus a composite
`(account_id, date)` matching the "transactions for this account, sorted by
date" query shape), `categories.parent_id`, and the trailing `user_id`
column on the three association tables where it's only the second half of
a composite primary key (`account_users`, `category_splits`,
`account_split_weights`, `transaction_splits`) - each of those tables also
gets a composite index matching its actual filter shape where one exists
(`account_users(user_id, ownership_percentage)`, used by every
`?user_id=`-scoped visibility filter). Index-only change: no data or
behavior impact.

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0008'
down_revision: Union[str, Sequence[str], None] = '0007'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_transactions_account_id', 'transactions', ['account_id'], unique=False)
    op.create_index('ix_transactions_category_id', 'transactions', ['category_id'], unique=False)
    op.create_index('ix_transactions_date', 'transactions', ['date'], unique=False)
    op.create_index('ix_transactions_account_id_date', 'transactions', ['account_id', 'date'], unique=False)
    op.create_index('ix_categories_parent_id', 'categories', ['parent_id'], unique=False)
    op.create_index('ix_account_users_user_id', 'account_users', ['user_id'], unique=False)
    op.create_index('ix_account_users_user_id_ownership_percentage', 'account_users', ['user_id', 'ownership_percentage'], unique=False)
    op.create_index('ix_category_splits_user_id', 'category_splits', ['user_id'], unique=False)
    op.create_index('ix_account_split_weights_user_id', 'account_split_weights', ['user_id'], unique=False)
    op.create_index('ix_transaction_splits_user_id', 'transaction_splits', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_transaction_splits_user_id', table_name='transaction_splits')
    op.drop_index('ix_account_split_weights_user_id', table_name='account_split_weights')
    op.drop_index('ix_category_splits_user_id', table_name='category_splits')
    op.drop_index('ix_account_users_user_id_ownership_percentage', table_name='account_users')
    op.drop_index('ix_account_users_user_id', table_name='account_users')
    op.drop_index('ix_categories_parent_id', table_name='categories')
    op.drop_index('ix_transactions_account_id_date', table_name='transactions')
    op.drop_index('ix_transactions_date', table_name='transactions')
    op.drop_index('ix_transactions_category_id', table_name='transactions')
    op.drop_index('ix_transactions_account_id', table_name='transactions')
