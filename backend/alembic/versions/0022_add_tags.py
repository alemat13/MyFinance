"""add tags and transaction_tags

Free labels on transactions, many-to-many (see models.Tag). New tables, so
nothing to backfill.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-17 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0022'
down_revision: Union[str, Sequence[str], None] = '0021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'tags',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('name', sa.String(length=50), nullable=False),
        sa.Column('color', sa.String(length=7), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name'),
    )
    op.create_table(
        'transaction_tags',
        sa.Column('transaction_id', sa.Integer(), nullable=False),
        sa.Column('tag_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['transaction_id'], ['transactions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['tag_id'], ['tags.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('transaction_id', 'tag_id'),
    )
    op.create_index(op.f('ix_transaction_tags_tag_id'), 'transaction_tags', ['tag_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_transaction_tags_tag_id'), table_name='transaction_tags')
    op.drop_table('transaction_tags')
    op.drop_table('tags')
