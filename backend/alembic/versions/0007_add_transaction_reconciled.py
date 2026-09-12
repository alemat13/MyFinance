"""add transactions.reconciled

Adds a `transactions.reconciled` boolean flag (default false) so a
transaction can be manually marked as reviewed/validated by the user,
individually or in bulk. This is additive and defaulted, so sync_schema()
could add the bare column on its own, but it's tracked here via a proper
migration so Alembic's view of the schema doesn't diverge from what's
actually in the database (same reasoning as 0005).

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-12 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0007'
down_revision: Union[str, Sequence[str], None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.add_column(sa.Column('reconciled', sa.Boolean(), nullable=False, server_default='0'))


def downgrade() -> None:
    with op.batch_alter_table('transactions') as batch_op:
        batch_op.drop_column('reconciled')
