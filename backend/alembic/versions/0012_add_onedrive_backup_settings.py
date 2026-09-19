"""add onedrive_backup_settings table

Adds the onedrive_backup_settings table backing the new OneDrive automatic
backup connection (onedrive.py): a single global row (id=1) holding the
connection state, encrypted OAuth tokens, and the user-configurable
frequency/retention settings. A new table is picked up automatically by
create_all() too, but is added here as well so Alembic's view of the schema
doesn't diverge from what's actually in the database - same reasoning as
0010's aggregate_cache.

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012'
down_revision: Union[str, Sequence[str], None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'onedrive_backup_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('connected', sa.Boolean(), nullable=False),
        sa.Column('account_email', sa.String(), nullable=True),
        sa.Column('folder_path', sa.String(), nullable=True),
        sa.Column('frequency', sa.String(length=20), nullable=False),
        sa.Column('retention_count', sa.Integer(), nullable=False),
        sa.Column('access_token_encrypted', sa.Text(), nullable=True),
        sa.Column('refresh_token_encrypted', sa.Text(), nullable=True),
        sa.Column('token_expires_at', sa.DateTime(), nullable=True),
        sa.Column('last_backup_at', sa.DateTime(), nullable=True),
        sa.Column('last_backup_status', sa.String(length=20), nullable=True),
        sa.Column('last_backup_error', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('onedrive_backup_settings')
