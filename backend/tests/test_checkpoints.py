"""Checkpoints: a transaction that states what its account is worth at a
date, whose amount is derived (value minus the balance just before it) and
re-derived whenever an earlier row of the account changes."""

from datetime import date

import enable_banking
from models import Transaction, TransactionHistory, TransactionSplit


def _post(client, account_id, user_id, day, amount=None, checkpoint_value=None, payee="Row"):
    body = {
        "account_id": account_id, "date": day, "payee": payee,
        "amount": amount if amount is not None else 0,
        "split_weights": [{"user_id": user_id, "weight": 1}],
    }
    if checkpoint_value is not None:
        body["checkpoint_value"] = checkpoint_value
    response = client.post("/api/transactions", json=body)
    assert response.status_code == 201, response.text
    return response.json()


def _get(client, transaction_id):
    return client.get(f"/api/transactions/{transaction_id}").json()


def _balance(client, account_id):
    return next(a["balance"] for a in client.get("/api/accounts").json() if a["id"] == account_id)


def test_checkpoint_amount_is_value_minus_balance_before(client, sample_account, sample_user):
    # sample_account starts at 1000 (its offset).
    _post(client, sample_account.id, sample_user.id, "2026-01-10", amount=200)
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1500, payee="Valuation")

    assert cp["checkpoint_value"] == 1500
    assert cp["amount"] == 300
    assert cp["splits"][0]["share_amount"] == 300
    assert _balance(client, sample_account.id) == 1500


def test_amount_sent_with_a_new_checkpoint_is_ignored(client, sample_account, sample_user):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", amount=999, checkpoint_value=900)
    assert cp["amount"] == -100


def test_earlier_row_recomputes_later_checkpoints_only(client, sample_account, sample_user):
    cp1 = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    cp2 = _post(client, sample_account.id, sample_user.id, "2026-02-28", checkpoint_value=1250)
    assert (_get(client, cp1["id"])["amount"], _get(client, cp2["id"])["amount"]) == (100, 150)

    # Between the two: only the second checkpoint absorbs it.
    row = _post(client, sample_account.id, sample_user.id, "2026-02-10", amount=50)
    assert (_get(client, cp1["id"])["amount"], _get(client, cp2["id"])["amount"]) == (100, 100)
    assert _balance(client, sample_account.id) == 1250

    # Before both: the first absorbs it, the second is unchanged.
    early = _post(client, sample_account.id, sample_user.id, "2026-01-05", amount=-40)
    assert (_get(client, cp1["id"])["amount"], _get(client, cp2["id"])["amount"]) == (140, 100)

    # A row after the last checkpoint moves the balance, not the checkpoints.
    _post(client, sample_account.id, sample_user.id, "2026-03-05", amount=20)
    assert _balance(client, sample_account.id) == 1270

    # Editing and deleting earlier rows re-derive too.
    assert client.put(f"/api/transactions/{row['id']}", json={"amount": 80}).status_code == 200
    assert _get(client, cp2["id"])["amount"] == 70
    assert client.delete(f"/api/transactions/{early['id']}").status_code == 204
    assert _get(client, cp1["id"])["amount"] == 100
    assert _balance(client, sample_account.id) == 1270


def test_same_day_rows_come_before_the_checkpoint(client, sample_account, sample_user):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1000)
    _post(client, sample_account.id, sample_user.id, "2026-01-31", amount=30)
    assert _get(client, cp["id"])["amount"] == -30
    assert _balance(client, sample_account.id) == 1000


def test_changing_the_value_rederives_its_amount_and_records_it(client, sample_account, sample_user, db):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    response = client.put(f"/api/transactions/{cp['id']}", json={"checkpoint_value": 1300})
    assert response.status_code == 200
    assert response.json()["amount"] == 300
    assert _balance(client, sample_account.id) == 1300

    history = db.query(TransactionHistory).filter_by(transaction_id=cp["id"]).order_by(TransactionHistory.id).all()
    assert [h.action for h in history] == ["created", "updated"]
    assert history[0].amount == 100
    assert history[1].changes["checkpoint_value"] == {"old": 1100, "new": 1300}
    assert history[1].changes["amount"] == {"old": 100, "new": 300}


def test_a_later_checkpoint_moved_by_an_earlier_row_gets_a_history_row(client, sample_account, sample_user, db):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    _post(client, sample_account.id, sample_user.id, "2026-01-10", amount=60)
    row = db.query(TransactionHistory).filter_by(transaction_id=cp["id"], source="checkpoint").one()
    assert row.changes == {"amount": {"old": 100, "new": 40}}


def test_checkpoint_amount_cannot_be_set_directly(client, sample_account, sample_user):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    # The form sends the unchanged amount back: accepted.
    assert client.put(f"/api/transactions/{cp['id']}", json={"amount": 100, "payee": "AV"}).status_code == 200
    assert client.put(f"/api/transactions/{cp['id']}", json={"amount": 5}).status_code == 422
    assert client.put(f"/api/transactions/{cp['id']}", json={"checkpoint_value": None}).status_code == 422


def test_an_ordinary_transaction_cannot_take_a_value(client, sample_account, sample_user):
    row = _post(client, sample_account.id, sample_user.id, "2026-01-10", amount=10)
    assert client.put(f"/api/transactions/{row['id']}", json={"checkpoint_value": 5}).status_code == 422
    assert _get(client, row["id"])["checkpoint_value"] is None


def test_checkpoint_cannot_be_divided(client, sample_account, sample_user):
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    response = client.post(f"/api/transactions/{cp['id']}/divide", json={"parts": [
        {"date": "2026-01-31", "payee": "a", "amount": 50},
        {"date": "2026-01-31", "payee": "b", "amount": 50},
    ]})
    assert response.status_code == 422


def test_moving_a_row_out_recomputes_both_accounts(client, sample_account, sample_account_2, sample_user):
    row = _post(client, sample_account.id, sample_user.id, "2026-01-10", amount=200)
    cp1 = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1500)
    cp2 = _post(client, sample_account_2.id, sample_user.id, "2026-01-31", checkpoint_value=500)
    assert (_get(client, cp1["id"])["amount"], _get(client, cp2["id"])["amount"]) == (300, 500)

    response = client.put("/api/transactions/bulk-update", json={
        "transaction_ids": [row["id"]], "update": {"account_id": sample_account_2.id},
    })
    assert response.status_code == 200
    assert (_get(client, cp1["id"])["amount"], _get(client, cp2["id"])["amount"]) == (500, 300)
    assert (_balance(client, sample_account.id), _balance(client, sample_account_2.id)) == (1500, 500)


def test_bulk_delete_recomputes(client, sample_account, sample_user):
    row = _post(client, sample_account.id, sample_user.id, "2026-01-10", amount=200)
    cp = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1500)
    response = client.request("DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": [row["id"]]})
    assert response.status_code == 200
    assert _get(client, cp["id"])["amount"] == 500


def test_typed_balance_is_refused_on_an_account_with_checkpoints(client, sample_account, sample_user):
    _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1500)
    assert client.put(f"/api/accounts/{sample_account.id}", json={"balance": 2000}).status_code == 422
    # The unchanged balance, as the account form sends it with any edit, is fine.
    response = client.put(f"/api/accounts/{sample_account.id}", json={"balance": 1500, "name": "AV"})
    assert response.status_code == 200
    assert response.json()["balance"] == 1500


def test_import_never_flags_a_real_row_as_duplicate_of_a_checkpoint(client, sample_account, sample_user, sample_category):
    # Same account, date and amount as the file's first row.
    _post(client, sample_account.id, sample_user.id, "2026-01-15", checkpoint_value=957.50)
    assert _get(client, client.post("/api/transactions/search", json={"unpaginated": True}).json()["items"][0]["id"])["amount"] == -42.50

    from tests.test_import import _preview
    rows = _preview(client, sample_account.id).json()
    assert rows[0]["status"] != "possible_duplicate"


def test_bank_sync_never_swallows_a_row_matching_a_checkpoint(db, client, sample_account, sample_user):
    from tests.test_bank_sync import _booked
    from models import BankAccountLink, BankConnection, GlobalSplitWeight
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    connection = BankConnection(aspsp_name="B", aspsp_country="FR", state="s", session_id="x", status="linked")
    db.add(connection)
    db.flush()
    link = BankAccountLink(connection_id=connection.id, remote_account_uid="u", account_id=sample_account.id,
                           sync_enabled=True)
    db.add(link)
    db.commit()
    cp = _post(client, sample_account.id, sample_user.id, "2026-03-04", checkpoint_value=957.50)
    assert cp["amount"] == -42.50

    rows = enable_banking.normalize_transactions([_booked("42.50", "DBIT", "2026-03-04", entry_reference="a")])
    created = enable_banking.import_transactions(db, link, rows, date(2026, 3, 1), date(2026, 3, 31))

    assert created == 1
    # The synced row lands before the checkpoint (same day), which absorbs it.
    db.expire_all()
    assert db.get(Transaction, cp["id"]).amount == 0
    shares = db.query(TransactionSplit).filter_by(transaction_id=cp["id"]).all()
    assert [s.share_amount for s in shares] == [0]


def test_checkpoint_reports_the_start_of_its_period(client, sample_account, sample_user):
    cp1 = _post(client, sample_account.id, sample_user.id, "2026-01-31", checkpoint_value=1100)
    cp2 = _post(client, sample_account.id, sample_user.id, "2026-02-28", checkpoint_value=1250)
    row = _post(client, sample_account.id, sample_user.id, "2026-02-10", amount=50)

    assert _get(client, cp1["id"])["checkpoint_since"] is None
    assert _get(client, cp2["id"])["checkpoint_since"] == "2026-01-31"
    assert _get(client, row["id"])["checkpoint_since"] is None
    listed = {t["id"]: t for t in client.post("/api/transactions/search", json={}).json()["items"]}
    assert listed[cp2["id"]]["checkpoint_since"] == "2026-01-31"
