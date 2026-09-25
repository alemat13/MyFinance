"""Per-account transaction totals, and the offset that turns one into the
balance a user sees.

An account's displayed balance is `balance_offset + sum(that account's
transaction amounts)`, so it moves on its own as transactions are added,
edited or removed. `balance_offset` is internal: the API never exposes it.
When a user types a balance (on account create, or by editing the Balance
field), they are stating what the account is worth *right now*, so the
offset is derived from it — offset = entered balance - transaction total —
and the account keeps showing exactly what they typed until the next
transaction moves it.

The whole-table total is cached in the "account_totals" namespace, since
`GET /api/dashboard` and `GET /api/accounts` need it on every load and
production sums tens of thousands of rows. Single-account reads used to
*write* an offset go straight to the database instead: a stale total there
would be persisted into the offset rather than just displayed.
"""

from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

import cache_service
from models import Account, Transaction

NAMESPACE = "account_totals"


def compute_transaction_totals(db: Session) -> list[list]:
    """[[account_id, total], ...] for every account that has transactions.

    A list of pairs rather than a dict because the payload round-trips
    through JSON, which would turn integer keys into strings.
    """
    rows = (
        db.query(Transaction.account_id, func.sum(Transaction.amount))
        .group_by(Transaction.account_id)
        .all()
    )
    return [[account_id, float(total or 0.0)] for account_id, total in rows]


def get_transaction_totals(db: Session) -> dict[int, float]:
    """Cached {account_id: transaction total} for every account."""
    rows = cache_service.get_or_compute(
        db, NAMESPACE, {}, lambda: compute_transaction_totals(db),
    )
    return {int(account_id): float(total) for account_id, total in rows}


def compute_last_transaction_dates(db: Session) -> list[list]:
    """[[account_id, "YYYY-MM-DD"], ...]: each account's latest transaction date."""
    rows = (
        db.query(Transaction.account_id, func.max(Transaction.date))
        .group_by(Transaction.account_id)
        .all()
    )
    return [[account_id, last.isoformat()] for account_id, last in rows if last is not None]


def get_last_transaction_dates(db: Session) -> dict[int, date]:
    """Cached {account_id: latest transaction date}.

    Shares the "account_totals" namespace (under its own params) because
    every mutation that can move a total can also move a last date, so the
    invalidations already in place cover it.
    """
    rows = cache_service.get_or_compute(
        db, NAMESPACE, {"kind": "last_transaction_date"},
        lambda: compute_last_transaction_dates(db),
    )
    return {int(account_id): date.fromisoformat(last) for account_id, last in rows}


def transaction_total(db: Session, account_id: int) -> float:
    """Uncached transaction total for one account."""
    total = (
        db.query(func.sum(Transaction.amount))
        .filter(Transaction.account_id == account_id)
        .scalar()
    )
    return float(total or 0.0)


def account_balance(account: Account, total: float) -> float:
    """The balance shown for `account` given its transaction total."""
    return round((account.balance_offset or 0.0) + total, 2)


def offset_for_balance(db: Session, account_id: int, balance: float) -> float:
    """The offset to store so that `account_id` displays `balance` today."""
    return round(balance - transaction_total(db, account_id), 2)
