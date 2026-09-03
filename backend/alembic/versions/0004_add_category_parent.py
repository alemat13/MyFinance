"""add category parent_id

Adds a nullable, self-referential `categories.parent_id` FK to support a
strict 2-level category hierarchy (a category may have a parent, but a
parent may not itself have a parent - enforced in application code, not by
the DB). This is additive and nullable-with-no-default, so sync_schema()
could technically add the bare column on its own, but it wouldn't create
an actual DB-level FK constraint - added here via a proper migration so
Alembic's view of the schema doesn't diverge from what's actually in the
database (same reasoning as 0002's additive-but-still-migrated columns).

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0004'
down_revision: Union[str, Sequence[str], None] = '0003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('categories') as batch_op:
        batch_op.add_column(sa.Column('parent_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            'fk_categories_parent_id_categories', 'categories', ['parent_id'], ['id'],
        )


def downgrade() -> None:
    with op.batch_alter_table('categories') as batch_op:
        batch_op.drop_constraint('fk_categories_parent_id_categories', type_='foreignkey')
        batch_op.drop_column('parent_id')
