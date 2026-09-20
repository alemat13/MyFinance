"""add the read-only raw_* fields on transactions

Seven nullable columns holding what the source reported before anyone
renamed anything: the bank's own label, the counterparty it named, its
transaction code, an MCC, a merchant location, the date the purchase was
initiated, and raw_source saying which of the two feeds wrote them
('enable_banking' or 'linxo_export').

Every column is plain and nullable, so sync_schema() would add them on its
own at startup. They're written out here anyway, because a migration is the
only thing that makes the change reversible and visible in `alembic
history` — and the downgrade is what the OneDrive/bank-sync rollback path
would need if this ever had to come back out of production.

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-20 07:50:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0014'
down_revision: Union[str, Sequence[str], None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_COLUMNS = (
    ('raw_source', sa.String(length=20)),
    ('raw_label', sa.Text()),
    ('raw_counterparty', sa.String(length=200)),
    ('raw_transaction_code', sa.String(length=60)),
    ('raw_merchant_category_code', sa.String(length=10)),
    ('raw_merchant_location', sa.String(length=120)),
    ('raw_initiated_date', sa.Date()),
)


def upgrade() -> None:
    for name, type_ in _COLUMNS:
        op.add_column('transactions', sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(_COLUMNS):
        op.drop_column('transactions', name)
