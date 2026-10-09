"""add categorizer_models

Holds the trained category/payee suggestion models (see categorizer.py). The
fitted model is a gzipped pickle in `blob`, kept in the database rather than on
disk because the backend runs several Cloud Run instances and the one that
answers a suggestion is rarely the one that trained the model.

New table, so nothing to backfill. sync_schema() would not have created it on
its own — it only adds missing columns to tables that already exist.

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-09 16:05:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0016'
down_revision: Union[str, Sequence[str], None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'categorizer_models',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('trained_rows', sa.Integer(), nullable=False),
        sa.Column('tested_rows', sa.Integer(), nullable=False),
        sa.Column('note', sa.String(length=200), nullable=True),
        sa.Column('params', sa.JSON(), nullable=True),
        sa.Column('metrics', sa.JSON(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('blob', sa.LargeBinary(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('categorizer_models')
