"""add aggregate_cache table

Adds the aggregate_cache table backing the new DB-backed caching service
(cache_service.py) for aggregate query results (dashboard balances, charts).
A new table is picked up automatically by create_all() too, but is added
here as well so Alembic's view of the schema doesn't diverge from what's
actually in the database - same reasoning as 0002's account_split_weights.

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0010'
down_revision: Union[str, Sequence[str], None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'aggregate_cache',
        sa.Column('cache_key', sa.String(), nullable=False),
        sa.Column('namespace', sa.String(), nullable=False),
        sa.Column('payload', sa.Text(), nullable=False),
        sa.Column('computed_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('cache_key'),
    )
    op.create_index('ix_aggregate_cache_namespace', 'aggregate_cache', ['namespace'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_aggregate_cache_namespace', table_name='aggregate_cache')
    op.drop_table('aggregate_cache')
