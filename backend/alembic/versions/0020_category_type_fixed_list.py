"""category type: fixed list Income / Expense / Transfer, other

categories.type used to be free text. From now on the API only accepts
schemas.CATEGORY_TYPES; any older value outside that list is moved onto the
last one, "Transfer, other" (production held only the three, so this is a
safety net). No schema change: the column stays String(50).

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-16 08:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0020'
down_revision: Union[str, Sequence[str], None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE categories SET type = 'Transfer, other' "
        "WHERE type IS NULL OR type NOT IN ('Income', 'Expense', 'Transfer, other')"
    ))
    # A type change moves a category in or out of the charts' figures.
    op.execute(sa.text("DELETE FROM aggregate_cache WHERE namespace = 'charts'"))


def downgrade() -> None:
    # The values replaced are not recorded, so there is nothing to restore.
    pass
