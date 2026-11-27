"""Pending bank transactions (MYF-82): reloaded at every sync, edits carried
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
    TransactionRule,
    TransactionSplit,
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


def _weights(db, transaction_id):
    return {
        s.user_id: (s.weight, s.source)
        for s in db.query(TransactionSplit).filter_by(transaction_id=transaction_id).all()
    }


def test_split_set_on_pending_row_goes_to_the_booked_row(
    client, db, bank, linked_connection, global_weights, sample_user2, groceries
):
    """MYF-88: the user's split wins over the category and global tiers, on
    the same history row as the other edits."""
    me = global_weights
    bank["rows"] = [_pending("40.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    url = f"/api/pending-transactions/{pending.id}"
    body = client.put(
        url,
        json={
            "category_id": groceries.id,
            "split_weights": [
                {"user_id": me.id, "weight": 1},
                {"user_id": sample_user2.id, "weight": 3},
            ],
        },
    ).json()
    assert body["edited"] is True
    assert {w["user_id"]: w["weight"] for w in body["split_weights"]} == {
        me.id: 1,
        sample_user2.id: 3,
    }

    bank["rows"] = [_booked("40.00", "DBIT", TODAY.isoformat(), entry_reference="p1")]
    _sync(db, linked_connection)

    assert _all_pending(db) == []
    booked = db.query(Transaction).one()
    assert booked.category_id == groceries.id
    assert _weights(db, booked.id) == {me.id: (1, "custom"), sample_user2.id: (3, "custom")}
    shares = {
        s.user_id: s.share_amount
        for s in db.query(TransactionSplit).filter_by(transaction_id=booked.id)
    }
    assert shares == {me.id: -10.0, sample_user2.id: -30.0}
    (carried,) = (
        db.query(TransactionHistory).filter_by(transaction_id=booked.id, source="pending").all()
    )
    assert "splits" in carried.changes and "category_id" in carried.changes


def test_split_alone_is_an_edit_and_survives_manual_reconcile(
    client, db, bank, linked_connection, global_weights, sample_user2
):
    me = global_weights
    bank["rows"] = [_pending("0.58", "DBIT", TODAY, entry_reference="p")]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    client.put(
        f"/api/pending-transactions/{pending.id}",
        json={"split_weights": [{"user_id": sample_user2.id, "weight": 1}]},
    )
    bank["rows"] = [
        _booked("0.58", "DBIT", TODAY.isoformat(), entry_reference="b1"),
        _booked("0.58", "DBIT", TODAY.isoformat(), entry_reference="b2"),
    ]
    _sync(db, linked_connection)

    (listed,) = client.get("/api/pending-transactions").json()
    assert listed["status"] == "to_reconcile"
    target = listed["candidates"][0]["id"]
    assert _weights(db, target) == {me.id: (1, "global")}
    client.post(
        f"/api/pending-transactions/{listed['id']}/reconcile", json={"transaction_id": target}
    )
    db.expire_all()
    assert _weights(db, target) == {sample_user2.id: (1, "custom")}


def test_split_validation_and_clearing(client, db, bank, linked_connection, global_weights):
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    url = f"/api/pending-transactions/{_all_pending(db)[0].id}"
    me = global_weights.id
    assert (
        client.put(url, json={"split_weights": [{"user_id": me, "weight": 0}]}).status_code == 422
    )
    assert (
        client.put(url, json={"split_weights": [{"user_id": 999, "weight": 1}]}).status_code == 422
    )
    assert client.put(url, json={"split_weights": [{"user_id": me, "weight": 2}]}).json()["edited"]
    cleared = client.put(url, json={"split_weights": []}).json()
    assert (cleared["split_weights"], cleared["edited"]) == ([], False)


def _theatre_rule(db, category, user):
    db.add(
        TransactionRule(
            name="Theatre",
            conditions=[{"field": "payee", "operator": "contains", "value": "theatre"}],
            actions={
                "payee": "Theatre",
                "category_id": category.id,
                "split_weights": [{"user_id": user.id, "weight": 1}],
            },
        )
    )
    db.commit()


def test_rules_suggest_payee_category_and_split_while_pending(
    client, db, bank, linked_connection, global_weights, sample_user2, groceries
):
    """MYF-88: shown as a suggestion, not an edit, and not carried over: the
    booked row runs the rules on its own wording."""
    _theatre_rule(db, groceries, sample_user2)
    bank["rows"] = [
        _pending("9.00", "DBIT", TODAY, entry_reference="p1", creditor={"name": "THEATRE"})
    ]
    _sync(db, linked_connection)

    (listed,) = client.get("/api/pending-transactions").json()
    assert listed["payee"] == "Theatre"
    assert (listed["user_payee"], listed["category_id"], listed["edited"]) == (None, None, False)
    assert listed["suggested_category_id"] == groceries.id
    assert listed["suggested_split_weights"] == [{"user_id": sample_user2.id, "weight": 1}]

    # Saving the suggestion as shown is no edit either.
    saved = client.put(
        f"/api/pending-transactions/{listed['id']}", json={"payee": "Theatre"}
    ).json()
    assert saved["edited"] is False

    bank["rows"] = [
        _booked(
            "9.00", "DBIT", TODAY.isoformat(), entry_reference="p1", creditor={"name": "THEATRE"}
        )
    ]
    _sync(db, linked_connection)
    assert _all_pending(db) == []
    booked = db.query(Transaction).one()
    assert (booked.payee, booked.category_id) == ("Theatre", groceries.id)
    assert _weights(db, booked.id) == {sample_user2.id: (1, "custom")}


def test_user_edits_win_over_the_suggestion(
    client, db, bank, linked_connection, global_weights, sample_user2, groceries
):
    me = global_weights
    _theatre_rule(db, groceries, sample_user2)
    bank["rows"] = [
        _pending("9.00", "DBIT", TODAY, entry_reference="p1", creditor={"name": "THEATRE"})
    ]
    _sync(db, linked_connection)
    pending = _all_pending(db)[0]
    client.put(
        f"/api/pending-transactions/{pending.id}",
        json={"payee": "Opera", "split_weights": [{"user_id": me.id, "weight": 1}]},
    )
    bank["rows"] = [
        _booked(
            "9.00", "DBIT", TODAY.isoformat(), entry_reference="p1", creditor={"name": "THEATRE"}
        )
    ]
    _sync(db, linked_connection)
    booked = db.query(Transaction).one()
    # Payee and split are the user's; the category, untouched, is the rule's.
    assert (booked.payee, booked.category_id) == ("Opera", groceries.id)
    assert _weights(db, booked.id) == {me.id: (1, "custom")}


def test_a_broken_suggestion_never_fails_the_sync(
    db, bank, linked_connection, global_weights, monkeypatch
):
    def _boom(*args, **kwargs):
        raise RuntimeError("bad model")

    monkeypatch.setattr(pending_transactions, "suggest", _boom)
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    assert len(_all_pending(db)) == 1


def test_the_active_model_suggests_a_category(
    client, db, bank, linked_connection, global_weights, groceries, monkeypatch
):
    import auto_categorize

    class _Model:
        def predict(self, rows):
            return [(groceries.id, 0.9) for _ in rows]

    monkeypatch.setattr(auto_categorize, "load_active_model", lambda db: (None, _Model()))
    bank["rows"] = [_pending("9.00", "DBIT", TODAY, entry_reference="p1")]
    _sync(db, linked_connection)
    (listed,) = client.get("/api/pending-transactions").json()
    assert (listed["suggested_category_id"], listed["category_id"]) == (groceries.id, None)
