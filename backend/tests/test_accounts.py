def test_get_accounts_empty(client):
    response = client.get("/api/accounts")
    assert response.status_code == 200
    assert response.json() == []


def test_create_account(client):
    response = client.post(
        "/api/accounts",
        json={"name": "Test", "type": "Checking", "balance": 100.0},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test"
    assert data["type"] == "Checking"
    assert data["balance"] == 100.0
    assert "id" in data


def test_get_accounts(client, sample_account):
    response = client.get("/api/accounts")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == sample_account.name


def test_update_account(client, sample_account):
    response = client.put(
        f"/api/accounts/{sample_account.id}",
        json={"name": "Updated"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"


def test_delete_account(client, sample_account):
    response = client.delete(f"/api/accounts/{sample_account.id}")
    assert response.status_code == 204
    response = client.get("/api/accounts")
    assert response.json() == []


def test_update_account_404(client):
    response = client.put("/api/accounts/999", json={"name": "Nope"})
    assert response.status_code == 404


def test_delete_account_404(client):
    response = client.delete("/api/accounts/999")
    assert response.status_code == 404


def test_delete_account_with_transactions_409(client, sample_transaction):
    response = client.delete(f"/api/accounts/{sample_transaction.account_id}")
    assert response.status_code == 409


def test_create_account_with_users(client, sample_user):
    response = client.post(
        "/api/accounts",
        json={
            "name": "Joint",
            "type": "Checking",
            "balance": 1000.0,
            "users": [{"user_id": sample_user.id, "ownership_percentage": 100.0}],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Joint"
    assert len(data["users"]) == 1
    assert data["users"][0]["user_name"] == sample_user.name
    assert data["users"][0]["ownership_percentage"] == 100.0


def test_create_account_users_sum_not_100_returns_422(client, sample_user):
    response = client.post(
        "/api/accounts",
        json={
            "name": "Bad",
            "type": "Checking",
            "users": [{"user_id": sample_user.id, "ownership_percentage": 50.0}],
        },
    )
    assert response.status_code == 422


def test_get_accounts_filtered_by_user(client, sample_account_with_user, sample_user):
    response = client.get(f"/api/accounts?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == sample_account_with_user.id


def test_get_accounts_filtered_by_user_no_match(client, sample_user):
    response = client.get(f"/api/accounts?user_id={sample_user.id}")
    assert response.status_code == 200
    assert response.json() == []
