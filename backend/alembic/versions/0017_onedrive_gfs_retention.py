"""onedrive backup: grandfather-father-son retention

Replaces the single "keep last N" count with four: how many days, ISO weeks,
months and years each keep their newest backup (onedrive.select_backups_to_keep).
New columns get server defaults 8 / 5 / 13 / 10, so the existing row picks
them up as-is.

retention_count is not dropped here, only made nullable: the backend still
serving the old code between `alembic upgrade head` and the redeploy keeps
reading it. A later migration can drop it.

Revision ID: 0017
Revises: 0016
Create Date: 2026-10-12 06:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0017'
down_revision: Union[str, Sequence[str], None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('onedrive_backup_settings') as batch_op:
        batch_op.add_column(sa.Column('keep_daily', sa.Integer(), nullable=False, server_default='8'))
        batch_op.add_column(sa.Column('keep_weekly', sa.Integer(), nullable=False, server_default='5'))
        batch_op.add_column(sa.Column('keep_monthly', sa.Integer(), nullable=False, server_default='13'))
        batch_op.add_column(sa.Column('keep_yearly', sa.Integer(), nullable=False, server_default='10'))
        batch_op.alter_column('retention_count', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute("UPDATE onedrive_backup_settings SET retention_count = 30 WHERE retention_count IS NULL")
    with op.batch_alter_table('onedrive_backup_settings') as batch_op:
        batch_op.alter_column('retention_count', existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column('keep_yearly')
        batch_op.drop_column('keep_monthly')
        batch_op.drop_column('keep_weekly')
        batch_op.drop_column('keep_daily')
