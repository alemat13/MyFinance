"""drop onedrive_backup_settings.frequency and retention_count

Unused since the grandfather-father-son retention (0017 made them nullable and
the model stopped declaring them). Nothing reads them, so they simply go.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-29 11:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0026'
down_revision: Union[str, Sequence[str], None] = '0025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    columns = {c['name'] for c in sa.inspect(op.get_bind()).get_columns('onedrive_backup_settings')}
    with op.batch_alter_table('onedrive_backup_settings') as batch_op:
        if 'frequency' in columns:
            batch_op.drop_column('frequency')
        if 'retention_count' in columns:
            batch_op.drop_column('retention_count')


def downgrade() -> None:
    # Back as 0017 left them: nullable, unread.
    with op.batch_alter_table('onedrive_backup_settings') as batch_op:
        batch_op.add_column(sa.Column('frequency', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('retention_count', sa.Integer(), nullable=True))
