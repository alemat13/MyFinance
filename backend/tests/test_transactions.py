def test_create_transaction(client, sample_account, sample_category):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201


def test_get_transactions(client, sample_transaction):
    response = client.get("/api/transactions")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1


def test_get_transaction_has_names(client, sample_transaction):
    response = client.get("/api/transactions")
    data = response.json()
    assert len(data) == 1
    assert data[0]["account_name"] is not None
    assert data[0]["category_name"] is not None


def test_transaction_currency_reflects_account(client, db, sample_category):
    from models import Account
    account = Account(name="USD Checking", type="Checking", balance=0.0, currency="USD")
    db.add(account)
    db.commit()

    response = client.post(
        "/api/transactions",
        json={
            "account_id": account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    assert response.json()["currency"] == "USD"


def test_update_transaction(client, sample_transaction):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"amount": 999.0},
    )
    assert response.status_code == 200
    assert response.json()["amount"] == 999.0


def test_delete_transaction(client, sample_transaction):
    response = client.delete(f"/api/transactions/{sample_transaction.id}")
    assert response.status_code == 204
    response = client.get("/api/transactions")
    assert response.json() == []


def test_update_transaction_404(client):
    response = client.put("/api/transactions/999", json={"amount": 100.0})
    assert response.status_code == 404


def test_delete_transaction_404(client):
    response = client.delete("/api/transactions/999")
    assert response.status_code == 404


def test_get_transactions_filtered_by_user(client, sample_account_with_user, sample_user, sample_category, db):
    from datetime import date
    from models import Transaction
    t = Transaction(
        date=date(2026, 1, 15),
        payee="User Specific",
        amount=100.0,
        account_id=sample_account_with_user.id,
        category_id=sample_category.id,
    )
    db.add(t)
    db.commit()

    response = client.get(f"/api/transactions?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["payee"] == "User Specific"


def test_get_transactions_filtered_by_user_no_match(client, sample_user):
    response = client.get(f"/api/transactions?user_id={sample_user.id}")
    assert response.status_code == 200
    assert response.json() == []


def test_create_transaction_no_split_config_has_no_splits(client, sample_account, sample_category):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    assert response.json()["splits"] == []


def test_create_transaction_uses_global_default_weight(client, sample_account, sample_category, sample_user, db):
    from models import GlobalSplitWeight, User
    other_user = User(name="Other User")
    db.add(other_user)
    db.flush()
    other_user_id = other_user.id
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=60.0),
        GlobalSplitWeight(user_id=other_user_id, weight=40.0),
    ])
    db.commit()

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    assert response.status_code == 201
    splits = {s["user_id"]: s for s in response.json()["splits"]}
    assert splits[sample_user.id]["share_amount"] == 60.0
    assert splits[sample_user.id]["source"] == "global_default"
    assert splits[other_user_id]["share_amount"] == 40.0


def test_create_transaction_with_manual_split_override(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 100.0}],
        },
    )
    assert response.status_code == 201
    splits = response.json()["splits"]
    assert len(splits) == 1
    assert splits[0]["share_amount"] == 100.0
    assert splits[0]["source"] == "manual"


def test_create_transaction_manual_override_sum_mismatch_422(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 40.0}],
        },
    )
    assert response.status_code == 422


def test_update_transaction_amount_on_manual_split_requires_new_override(client, sample_account, sample_category, sample_user):
    create_response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_overrides": [{"user_id": sample_user.id, "share_amount": 100.0}],
        },
    )
    transaction_id = create_response.json()["id"]

    # Changing the amount without a matching override should fail...
    response = client.put(f"/api/transactions/{transaction_id}", json={"amount": 200.0})
    assert response.status_code == 422

    # ...but succeeds once a matching override is supplied.
    response = client.put(
        f"/api/transactions/{transaction_id}",
        json={"amount": 200.0, "split_overrides": [{"user_id": sample_user.id, "share_amount": 200.0}]},
    )
    assert response.status_code == 200
    assert response.json()["splits"][0]["share_amount"] == 200.0


def test_update_transaction_amount_on_auto_split_recomputes(client, sample_account, sample_category, sample_user, db):
    from models import GlobalSplitWeight
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=100.0))
    db.commit()

    create_response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
        },
    )
    transaction_id = create_response.json()["id"]
    assert create_response.json()["splits"][0]["share_amount"] == 100.0

    response = client.put(f"/api/transactions/{transaction_id}", json={"amount": 200.0})
    assert response.status_code == 200
    assert response.json()["splits"][0]["share_amount"] == 200.0


def test_split_preview_endpoint(client, sample_category, sample_user):
    client.put("/api/split-weights", json=[{"user_id": sample_user.id, "weight": 100.0}])

    response = client.post(
        "/api/split-preview",
        json={"amount": 50.0, "category_id": sample_category.id},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["share_amount"] == 50.0


def test_split_preview_no_config_returns_422(client, sample_category):
    response = client.post(
        "/api/split-preview",
        json={"amount": 50.0, "category_id": sample_category.id},
    )
    assert response.status_code == 422
