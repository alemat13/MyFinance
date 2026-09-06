"""add accounts.archived

Adds a `accounts.archived` boolean flag (default false) so a closed account
can be hidden from the dashboard and the new-transaction account picker
without deleting it or its history. This is additive and defaulted, so
sync_schema() could add the bare column on its own, but it's tracked here
via a proper migration so Alembic's view of the schema doesn't diverge from
what's actually in the database (same reasoning as 0004).

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-06 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0005'
down_revision: Union[str, Sequence[str], None] = '0004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('accounts') as batch_op:
        batch_op.add_column(sa.Column('archived', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('accounts') as batch_op:
        batch_op.drop_column('archived')
