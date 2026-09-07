def test_get_users_empty(client):
    response = client.get("/api/users")
    assert response.status_code == 200
    assert response.json() == []


def test_create_user(client):
    response = client.post(
        "/api/users",
        json={"name": "Alice", "email": "alice@example.com"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Alice"
    assert data["email"] == "alice@example.com"
    assert "id" in data


def test_get_users(client, sample_user):
    response = client.get("/api/users")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == sample_user.name


def test_update_user(client, sample_user):
    response = client.put(
        f"/api/users/{sample_user.id}",
        json={"name": "Updated"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"


def test_delete_user(client, sample_user):
    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 204
    response = client.get("/api/users")
    assert response.json() == []


def test_update_user_404(client):
    response = client.put("/api/users/999", json={"name": "Nope"})
    assert response.status_code == 404


def test_delete_user_404(client):
    response = client.delete("/api/users/999")
    assert response.status_code == 404


def test_delete_user_with_ownership_409(client, sample_account_with_user, sample_user):
    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 409


def test_delete_user_with_global_split_weight_succeeds(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 100}],
    )
    assert response.status_code == 200

    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 204

    response = client.get("/api/users")
    assert response.json() == []


def test_delete_user_with_account_split_weight_succeeds(client, sample_account, sample_user):
    response = client.put(
        f"/api/accounts/{sample_account.id}/split-weights",
        json=[{"user_id": sample_user.id, "weight": 100}],
    )
    assert response.status_code == 200

    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 204

    response = client.get("/api/users")
    assert response.json() == []


def test_delete_sole_split_participant_with_no_fallback_rejected(client, sample_account, sample_category, sample_user):
    """Splits are mandatory: deleting the only person on a transaction's
    split is refused when there's no other user to fall back to, rather
    than silently leaving the transaction with zero splits."""
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201
    transaction_id = response.json()["id"]

    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 409

    # Neither the user nor the transaction's split were touched.
    assert client.get("/api/users").json() != []
    response = client.get(f"/api/transactions/{transaction_id}")
    assert len(response.json()["splits"]) == 1


def test_delete_sole_split_participant_heals_via_fallback(client, sample_account, sample_category, sample_user, sample_user2):
    """When another user has a usable global weight, deleting the sole
    split participant re-resolves the transaction's split via the cascade
    instead of leaving it empty."""
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 1}, {"user_id": sample_user2.id, "weight": 1}],
    )
    assert response.status_code == 200

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Test",
            "amount": 100.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201
    transaction_id = response.json()["id"]

    response = client.delete(f"/api/users/{sample_user.id}")
    assert response.status_code == 204

    response = client.get(f"/api/transactions/{transaction_id}")
    data = response.json()
    assert data["splits"] == [
        {"user_id": sample_user2.id, "user_name": sample_user2.name, "weight": 1, "share_amount": 100.0, "source": "global"},
    ]
