"""rename accounts.balance to accounts.balance_offset

The dashboard/accounts "Balance" used to be this stored column echoed back
verbatim: set once at account creation and never touched again, so it drifted
away from the account's transactions immediately. It is now derived —
`balance_offset + sum(that account's transaction amounts)` — and the column
holds only the internal offset.

Renaming (rather than dropping and adding) keeps each account's declared
balance, and the backfill preserves what every account displays today:
offset = old balance - current transaction total. So the moment after this
migration runs, every account shows the same number it showed before; from
then on it moves with its transactions.

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '0011'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_ACCOUNT_TX_TOTAL = (
    "COALESCE((SELECT SUM(amount) FROM transactions "
    "WHERE transactions.account_id = accounts.id), 0)"
)


# A plain RENAME COLUMN rather than op.alter_column(): SQLite (>= 3.25) and
# Postgres both take this statement verbatim, while Alembic's SQLite path
# would otherwise rebuild the whole table, which fails against the foreign
# keys pointing at accounts. The column keeps its existing type and
# nullability, so nothing else has to change.
def upgrade() -> None:
    op.execute("ALTER TABLE accounts RENAME COLUMN balance TO balance_offset")
    op.execute(
        f"UPDATE accounts SET balance_offset = "
        f"COALESCE(balance_offset, 0) - {_ACCOUNT_TX_TOTAL}"
    )


def downgrade() -> None:
    op.execute(
        f"UPDATE accounts SET balance_offset = "
        f"COALESCE(balance_offset, 0) + {_ACCOUNT_TX_TOTAL}"
    )
    op.execute("ALTER TABLE accounts RENAME COLUMN balance_offset TO balance")
