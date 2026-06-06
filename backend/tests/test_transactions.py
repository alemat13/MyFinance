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
