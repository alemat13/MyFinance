"""Pending bank operations (MYF-82): reloaded at every sync, edits carried
over to the booked transaction, cancelled pre-authorisations dropped."""

from datetime import date, timedelta

import pytest

import enable_banking
import pending_transactions
from models import (
    Category,
    PendingTransaction,
    Transaction,
    TransactionHistory,
)
from tests.test_bank_sync import (  # noqa: F401  (fixtures)
    _booked,
    bank_sync_env,
    global_weights,
    linked_connection,
)

TODAY = date.today()


def _pending(amount: str, indicator: str, day: date, **extra) -> dict:
    row = {
        "transaction_amount": {"amount": amount, "currency": "EUR"},
        "credit_debit_indicator": indicator,
        "status": "PDNG",
        "transaction_date": day.isoformat(),
    }
    row.update(extra)
    return row


@pytest.fixture()
def bank(monkeypatch):
    """What the bank returns on the next sync; also records the statuses asked."""
    state = {"rows": [], "asked": [], "refuse_unfiltered": False}

    def _fetch(account_uid, date_from, date_to, transaction_status="BOOK"):
        state["asked"].append(transaction_status)
        if transaction_status is None and state["refuse_unfiltered"]:
            raise enable_banking.EnableBankingError("ASPSP_ERROR")
        rows = state["rows"]
        if transaction_status is not None:
            rows = [r for r in rows if r.get("status") == transaction_status]
        return list(rows)

    monkeypatch.setattr(enable_banking, "fetch_transactions", _fetch)
    return state


@pytest.fixture()
def groceries(db):
    category = Category(name="Groceries", type="Expense")
    db.add(category)
    db.commit()
    return category


def _sync(db, link):
    enable_banking.sync_link(db, link)
    assert link.last_sync_status == "success", link.last_sync_error


def _all_pending(db):
    return db.query(PendingTransaction).order_by(PendingTransaction.id).all()


def test_sync_imports_booked_and_keeps_pending_apart(db, bank, linked_connection, global_weights):
    bank["rows"] = [
        _booked("10.00", "DBIT", TODAY.isoformat(), entry_reference="b1"),
        _pending("9.00", "DBIT", TODAY, entry_reference="p1", creditor={"name": "THEATRE"}),
    ]
    _sync(db, linked_connection)

    assert bank["asked"] == [None]  # one call for every status
    assert [t.external_id for t in db.query(Transaction).all()] == ["b1"]
    (pending,) = _all_pending(db)
    assert (pending.external_id, pending.amount, pending.payee) == ("p1", -9.0, "THEATRE")
    assert pending.account_id == linked_connection.account_id
    assert pending.status == "pending"


def test_gone_unedited_row_is_deleted(db, bank, linked_connection, global_weights):
    bank["rows"] = [_pending("75.00", "DBIT", TODAY, entry_reference="hold")]
    _sync(db, linked_connection)
    assert len(_all_pending(db)) == 1

    bank["rows"] = []  # pre-authorisation cancelled
    _sync(db, linked_connection)
    assert _all_pending(db) == []
    assert db.query(Transaction).count() == 0


def test_still_reported_row_is_refreshed_and_keeps_edits(
    db, bank, linked_connection, global_weights, groceries
):
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    pending.user_payee = "Cinema"
    pending.user_category_id = groceries.id
    db.commit()

    bank["rows"] = [_pending("9.50", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    (pending,) = _all_pending(db)
    assert pending.amount == -9.5
    assert (pending.user_payee, pending.user_category_id) == ("Cinema", groceries.id)


def test_edits_carry_over_to_the_booked_row_by_amount(
    db, bank, linked_connection, global_weights, groceries
):
    # A bank that gives no identifier: the pending row gets a fingerprint that
    # the booked one (different wording and date) will not share.
    bank["rows"] = [_pending("832.00", "DBIT", TODAY, remittance_information=["CRECHE"])]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    pending.user_payee = "Daycare"
    pending.user_category_id = groceries.id
    db.commit()

    bank["rows"] = [
        _booked(
            "832.00",
            "DBIT",
            (TODAY + timedelta(days=2)).isoformat(),
            remittance_information=["PRLV CRECHE LAGRANGE"],
        )
    ]
    _sync(db, linked_connection)

    assert _all_pending(db) == []
    (booked,) = db.query(Transaction).all()
    assert (booked.payee, booked.category_id) == ("Daycare", groceries.id)
    history = db.query(TransactionHistory).filter_by(transaction_id=booked.id).all()
    assert [h.source for h in history] == ["bank_sync", "pending"]


def test_edits_carry_over_by_identifier_even_when_the_amount_moved(
    db, bank, linked_connection, global_weights
):
    bank["rows"] = [_pending("150.00", "DBIT", TODAY, entry_reference="fuel")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    pending.user_payee = "Fuel"
    db.commit()

    bank["rows"] = [_booked("62.00", "DBIT", TODAY.isoformat(), entry_reference="fuel")]
    _sync(db, linked_connection)

    assert _all_pending(db) == []
    assert db.query(Transaction).one().payee == "Fuel"


def test_ambiguous_match_waits_for_the_user(
    client, db, bank, linked_connection, global_weights, groceries
):
    bank["rows"] = [_pending("0.58", "DBIT", TODAY, entry_reference="p")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    response = client.put(
        f"/api/pending-transactions/{pending.id}",
        json={"payee": "Coffee", "category_id": groceries.id},
    )
    assert response.status_code == 200
    assert response.json()["edited"] is True

    bank["rows"] = [
        _booked("0.58", "DBIT", TODAY.isoformat(), entry_reference="b1"),
        _booked("0.58", "DBIT", TODAY.isoformat(), entry_reference="b2"),
    ]
    _sync(db, linked_connection)

    (listed,) = client.get(
        "/api/pending-transactions", params={"account_id": linked_connection.account_id}
    ).json()
    assert listed["status"] == "to_reconcile"
    assert listed["payee"] == "Coffee"
    assert len(listed["candidates"]) == 2
    target = listed["candidates"][1]["id"]

    response = client.post(
        f"/api/pending-transactions/{listed['id']}/reconcile", json={"transaction_id": target}
    )
    assert response.status_code == 204
    assert _all_pending(db) == []
    db.expire_all()
    booked = db.get(Transaction, target)
    assert (booked.payee, booked.category_id) == ("Coffee", groceries.id)


def test_edited_cancelled_preauth_can_be_dismissed_and_expires(
    client, db, bank, linked_connection, global_weights
):
    bank["rows"] = [_pending("300.00", "DBIT", TODAY, entry_reference="deposit")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]

    # Still reported: dismissing would only bring it back.
    assert client.delete(f"/api/pending-transactions/{pending.id}").status_code == 409

    pending.user_payee = "Car rental deposit"
    db.commit()
    bank["rows"] = []
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    assert pending.status == "to_reconcile"

    pending.missing_since -= timedelta(days=pending_transactions.RECONCILE_KEEP_DAYS + 1)
    db.commit()
    _sync(db, linked_connection)
    assert _all_pending(db) == []


def test_dismiss_to_reconcile_row(client, db, bank, linked_connection, global_weights):
    bank["rows"] = [_pending("300.00", "DBIT", TODAY, entry_reference="deposit")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    pending.user_payee = "Deposit"
    db.commit()
    bank["rows"] = []
    _sync(db, linked_connection)

    assert client.delete(f"/api/pending-transactions/{pending.id}").status_code == 204
    assert _all_pending(db) == []


def test_bank_refusing_unfiltered_call_falls_back_to_booked(
    db, bank, linked_connection, global_weights
):
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)

    bank["refuse_unfiltered"] = True
    bank["rows"] = [_booked("1.00", "DBIT", TODAY.isoformat(), entry_reference="b1")]
    _sync(db, linked_connection)

    assert bank["asked"][-2:] == [None, "BOOK"]
    assert db.query(Transaction).count() == 1
    # Unknown this time, so left as it was.
    assert len(_all_pending(db)) == 1


def test_repointing_the_link_clears_its_pending_rows(
    client, db, bank, linked_connection, global_weights, sample_account_2
):
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)

    response = client.put(
        f"/api/bank-sync/links/{linked_connection.id}",
        json={"account_id": sample_account_2.id, "sync_enabled": True},
    )
    assert response.status_code == 200
    assert _all_pending(db) == []


def test_update_rejects_unknown_category_and_clears_edits(
    client, db, bank, linked_connection, global_weights
):
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1", creditor={"name": "X"})]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]

    url = f"/api/pending-transactions/{pending.id}"
    assert client.put(url, json={"category_id": 999}).status_code == 422
    assert client.put(url, json={"payee": "Y"}).json()["payee"] == "Y"
    cleared = client.put(url, json={"payee": None}).json()
    assert (cleared["payee"], cleared["edited"]) == ("X", False)
