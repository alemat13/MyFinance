"""Money columns are exact to the cent (MYF-16): whatever float reaches
them, the database keeps the cent value and hands back a plain float."""

from datetime import date

from sqlalchemy import func, select

from models import Account, Transaction


def _add(db, account, amount):
    t = Transaction(date=date(2026, 1, 1), payee="p", amount=amount, account_id=account.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    return t


def test_amount_is_stored_to_the_cent(db, sample_account):
    t = _add(db, sample_account, 12.30 + 45.10 + 0.20)  # 57.60000000000001 as a float
    db.expire_all()
    stored = db.get(Transaction, t.id).amount
    assert stored == 57.6
    assert isinstance(stored, float)


def test_balance_offset_is_stored_to_the_cent(db, sample_account):
    sample_account.balance_offset = 0.1 + 0.2  # 0.30000000000000004
    db.commit()
    db.expire_all()
    assert db.get(Account, sample_account.id).balance_offset == 0.3


def test_sum_of_amounts_has_no_rounding_dust(db, sample_account):
    for _ in range(10):
        _add(db, sample_account, 0.1)
    total = db.scalar(
        select(func.sum(Transaction.amount)).where(Transaction.account_id == sample_account.id)
    )
    assert total == 1.0  # sum(0.1 for 10 floats) is 0.9999999999999999
    assert isinstance(total, float)


def test_nullable_money_column_stays_null(db, sample_account):
    t = _add(db, sample_account, 5)
    db.expire_all()
    assert db.get(Transaction, t.id).checkpoint_value is None
