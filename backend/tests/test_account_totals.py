"""The account balance shown by /api/accounts and /api/dashboard is derived:
the account's stored offset plus the sum of its transaction amounts. The
offset itself is internal and never leaves the API."""

from models import Account, AggregateCache


def _add_transaction(client, account_id, user_id, amount, payee="Test"):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": account_id,
            "date": "2026-01-15",
            "payee": payee,
            "amount": amount,
            "split_weights": [{"user_id": user_id, "weight": 1}],
        },
    )
    assert response.status_code == 201
    return response.json()


def test_created_account_reports_the_balance_entered(client):
    response = client.post(
        "/api/accounts",
        json={"name": "Test", "type": "Checking", "balance": 100.0},
    )
    assert response.json()["balance"] == 100.0


def test_offset_is_never_exposed(client):
    client.post("/api/accounts", json={"name": "Test", "type": "Checking", "balance": 100.0})
    account = client.get("/api/accounts").json()[0]
    assert "balance_offset" not in account
    assert "offset" not in account


def test_balance_follows_transactions(client, sample_account, sample_user):
    _add_transaction(client, sample_account.id, sample_user.id, 250.0)
    assert client.get("/api/accounts").json()[0]["balance"] == 1250.0

    _add_transaction(client, sample_account.id, sample_user.id, -50.0)
    assert client.get("/api/accounts").json()[0]["balance"] == 1200.0


def test_deleting_a_transaction_moves_the_balance_back(client, sample_account, sample_user):
    created = _add_transaction(client, sample_account.id, sample_user.id, 250.0)
    assert client.get("/api/accounts").json()[0]["balance"] == 1250.0

    assert client.delete(f"/api/transactions/{created['id']}").status_code == 204
    assert client.get("/api/accounts").json()[0]["balance"] == 1000.0


def test_editing_the_balance_restates_it_without_losing_transactions(client, sample_account, sample_user):
    _add_transaction(client, sample_account.id, sample_user.id, 250.0)

    response = client.put(f"/api/accounts/{sample_account.id}", json={"balance": 900.0})
    assert response.status_code == 200
    assert response.json()["balance"] == 900.0
    assert client.get("/api/accounts").json()[0]["balance"] == 900.0

    # ...and the corrected balance keeps moving with new activity.
    _add_transaction(client, sample_account.id, sample_user.id, 100.0)
    assert client.get("/api/accounts").json()[0]["balance"] == 1000.0


def test_editing_another_field_leaves_the_balance_alone(client, sample_account, sample_user):
    _add_transaction(client, sample_account.id, sample_user.id, 250.0)

    response = client.put(f"/api/accounts/{sample_account.id}", json={"name": "Renamed"})
    assert response.status_code == 200
    assert response.json()["balance"] == 1250.0


def test_moving_a_transaction_between_accounts_moves_both_balances(
    client, sample_account, sample_account_2, sample_user,
):
    created = _add_transaction(client, sample_account.id, sample_user.id, 250.0)

    response = client.put(
        f"/api/transactions/{created['id']}",
        json={
            "account_id": sample_account_2.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 250.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 200

    balances = {a["name"]: a["balance"] for a in client.get("/api/accounts").json()}
    assert balances[sample_account.name] == 1000.0
    assert balances[sample_account_2.name] == 250.0


def test_dashboard_reports_the_same_derived_balance(client, sample_account_with_user, sample_user):
    _add_transaction(client, sample_account_with_user.id, sample_user.id, 250.0)
    dashboard = client.get("/api/dashboard").json()
    assert dashboard["accounts"][0]["balance"] == 1250.0


def test_account_totals_are_cached_and_invalidated(client, db, sample_account, sample_user):
    client.get("/api/accounts")
    assert db.query(AggregateCache).filter(AggregateCache.namespace == "account_totals").count() == 1

    _add_transaction(client, sample_account.id, sample_user.id, 250.0)
    assert db.query(AggregateCache).filter(AggregateCache.namespace == "account_totals").count() == 0


def test_backup_roundtrip_preserves_the_displayed_balance(client, sample_account, sample_user):
    _add_transaction(client, sample_account.id, sample_user.id, 250.0)
    assert client.get("/api/accounts").json()[0]["balance"] == 1250.0

    archive = client.get("/api/backup/export")
    assert archive.status_code == 200

    response = client.post(
        "/api/backup/import",
        files={"file": ("backup.zip", archive.content, "application/zip")},
        data={"mode": "overwrite"},
    )
    assert response.status_code == 200

    accounts = client.get("/api/accounts").json()
    assert accounts[0]["balance"] == 1250.0


def test_balance_offset_is_the_difference_from_the_transaction_total(client, db, sample_account, sample_user):
    _add_transaction(client, sample_account.id, sample_user.id, 250.0)
    client.put(f"/api/accounts/{sample_account.id}", json={"balance": 900.0})

    stored = db.query(Account).filter(Account.id == sample_account.id).first()
    db.refresh(stored)
    assert stored.balance_offset == 650.0
