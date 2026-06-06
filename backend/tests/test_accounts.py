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
