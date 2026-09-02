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
    assert data["color"] is None
    assert data["icon"] is None
    assert "id" in data


def test_create_category_with_color_and_icon(client):
    response = client.post(
        "/api/categories",
        json={"name": "Groceries", "type": "Expense", "color": "#d97706", "icon": "ShoppingCart"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["color"] == "#d97706"
    assert data["icon"] == "ShoppingCart"


def test_update_category_color_and_icon(client, sample_category):
    response = client.put(
        f"/api/categories/{sample_category.id}",
        json={"color": "#4f46e5", "icon": "Landmark"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["color"] == "#4f46e5"
    assert data["icon"] == "Landmark"


def test_create_category_duplicate_name_409(client, sample_category):
    response = client.post(
        "/api/categories",
        json={"name": sample_category.name, "type": "Income"},
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]
    assert "referenced record" not in response.json()["detail"]


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


def test_create_category_with_splits(client, sample_user):
    response = client.post(
        "/api/categories",
        json={
            "name": "Mortgage",
            "type": "Expense",
            "splits": [{"user_id": sample_user.id, "weight": 100}],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert len(data["splits"]) == 1
    assert data["splits"][0]["user_name"] == sample_user.name
    assert data["splits"][0]["weight"] == 100


def test_create_category_splits_not_summing_to_100_is_accepted(client, db, sample_user):
    from models import User
    other_user = User(name="Other User")
    db.add(other_user)
    db.commit()

    response = client.post(
        "/api/categories",
        json={
            "name": "Fine",
            "type": "Expense",
            "splits": [
                {"user_id": sample_user.id, "weight": 30},
                {"user_id": other_user.id, "weight": 45},
            ],
        },
    )
    assert response.status_code == 201
    weights = {s["user_id"]: s["weight"] for s in response.json()["splits"]}
    assert weights == {sample_user.id: 30, other_user.id: 45}


def test_create_category_splits_negative_weight_rejected(client, sample_user):
    response = client.post(
        "/api/categories",
        json={
            "name": "Bad",
            "type": "Expense",
            "splits": [{"user_id": sample_user.id, "weight": -5}],
        },
    )
    assert response.status_code == 422


def test_create_category_splits_all_zero_weight_rejected(client, sample_user):
    response = client.post(
        "/api/categories",
        json={
            "name": "Bad",
            "type": "Expense",
            "splits": [{"user_id": sample_user.id, "weight": 0}],
        },
    )
    assert response.status_code == 422


def test_update_category_splits_replaces_existing(client, sample_category, sample_user):
    response = client.put(
        f"/api/categories/{sample_category.id}",
        json={"splits": [{"user_id": sample_user.id, "weight": 100}]},
    )
    assert response.status_code == 200
    data = response.json()
    assert len(data["splits"]) == 1
    assert data["splits"][0]["weight"] == 100
