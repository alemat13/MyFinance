def test_get_categories_empty(client):
    response = client.get("/api/categories")
    assert response.status_code == 200
    assert response.json() == []


def test_create_category(client):
    response = client.post(
        "/api/categories",
        json={"name": "Test", "type": "Income"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test"
    assert data["type"] == "Income"
    assert "id" in data


def test_get_categories(client, sample_category):
    response = client.get("/api/categories")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["name"] == sample_category.name


def test_update_category(client, sample_category):
    response = client.put(
        f"/api/categories/{sample_category.id}",
        json={"name": "Updated"},
    )
    assert response.status_code == 200
    assert response.json()["name"] == "Updated"


def test_delete_category(client, sample_category):
    response = client.delete(f"/api/categories/{sample_category.id}")
    assert response.status_code == 204
    response = client.get("/api/categories")
    assert response.json() == []


def test_update_category_404(client):
    response = client.put("/api/categories/999", json={"name": "Nope"})
    assert response.status_code == 404


def test_delete_category_404(client):
    response = client.delete("/api/categories/999")
    assert response.status_code == 404


def test_delete_category_with_transactions_409(client, sample_transaction):
    response = client.delete(
        f"/api/categories/{sample_transaction.category_id}"
    )
    assert response.status_code == 409
