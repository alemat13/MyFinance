def test_dashboard_empty(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["accounts"] == []
    assert data["recent_transactions"] == []


def test_dashboard_with_data(client, sample_transaction):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert len(data["accounts"]) == 1
    assert len(data["recent_transactions"]) == 1
