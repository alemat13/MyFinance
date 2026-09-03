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


def test_create_category_malformed_color_422(client):
    response = client.post(
        "/api/categories",
        json={"name": "Bad Color", "type": "Expense", "color": "not-a-color"},
    )
    assert response.status_code == 422


def test_create_category_overlong_color_422(client):
    response = client.post(
        "/api/categories",
        json={"name": "Overlong Color", "type": "Expense", "color": "#d97706ff"},
    )
    assert response.status_code == 422


def test_create_category_unknown_icon_422(client):
    response = client.post(
        "/api/categories",
        json={"name": "Bad Icon", "type": "Expense", "icon": "NotARealIcon"},
    )
    assert response.status_code == 422


def test_update_category_malformed_color_422(client, sample_category):
    response = client.put(
        f"/api/categories/{sample_category.id}",
        json={"color": "red"},
    )
    assert response.status_code == 422


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


def test_create_subcategory(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    response = client.post(
        "/api/categories",
        json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["parent_id"] == parent["id"]
    assert data["parent_name"] == "Housing"


def test_get_categories_includes_parent_fields(client, sample_category):
    parent_id = sample_category.id
    client.put(f"/api/categories/{parent_id}", json={"type": "Expense"})
    child = client.post(
        "/api/categories",
        json={"name": "Child", "type": "Expense", "parent_id": parent_id},
    ).json()
    response = client.get("/api/categories")
    by_name = {c["name"]: c for c in response.json()}
    assert by_name["Child"]["parent_id"] == parent_id
    assert by_name["Child"]["parent_name"] == by_name[sample_category.name]["name"]
    assert child["id"] == by_name["Child"]["id"]


def test_create_subcategory_type_mismatch_422(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    response = client.post(
        "/api/categories",
        json={"name": "Salary", "type": "Income", "parent_id": parent["id"]},
    )
    assert response.status_code == 422


def test_create_subcategory_parent_not_found_422(client):
    response = client.post(
        "/api/categories",
        json={"name": "Rent", "type": "Expense", "parent_id": 999},
    )
    assert response.status_code == 422


def test_create_category_under_a_subcategory_422(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    child = client.post(
        "/api/categories",
        json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]},
    ).json()
    response = client.post(
        "/api/categories",
        json={"name": "Grandchild", "type": "Expense", "parent_id": child["id"]},
    )
    assert response.status_code == 422


def test_update_category_self_parent_422(client, sample_category):
    response = client.put(
        f"/api/categories/{sample_category.id}",
        json={"parent_id": sample_category.id},
    )
    assert response.status_code == 422


def test_update_category_cannot_demote_parent_with_children_422(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    other = client.post("/api/categories", json={"name": "Other", "type": "Expense"}).json()
    client.post("/api/categories", json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]})
    response = client.put(f"/api/categories/{parent['id']}", json={"parent_id": other["id"]})
    assert response.status_code == 422


def test_update_category_type_change_with_children_422(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    client.post("/api/categories", json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]})
    response = client.put(f"/api/categories/{parent['id']}", json={"type": "Income"})
    assert response.status_code == 422


def test_update_subcategory_type_must_still_match_parent_422(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    child = client.post(
        "/api/categories",
        json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]},
    ).json()
    response = client.put(f"/api/categories/{child['id']}", json={"type": "Income"})
    assert response.status_code == 422


def test_update_category_can_reparent_to_another_top_level_category(client):
    housing = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    utilities = client.post("/api/categories", json={"name": "Utilities", "type": "Expense"}).json()
    child = client.post(
        "/api/categories",
        json={"name": "Electricity", "type": "Expense", "parent_id": housing["id"]},
    ).json()
    response = client.put(f"/api/categories/{child['id']}", json={"parent_id": utilities["id"]})
    assert response.status_code == 200
    assert response.json()["parent_id"] == utilities["id"]


def test_delete_category_with_subcategories_409(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    client.post("/api/categories", json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]})
    response = client.delete(f"/api/categories/{parent['id']}")
    assert response.status_code == 409


def test_delete_category_after_removing_subcategories_succeeds(client):
    parent = client.post("/api/categories", json={"name": "Housing", "type": "Expense"}).json()
    child = client.post(
        "/api/categories",
        json={"name": "Rent", "type": "Expense", "parent_id": parent["id"]},
    ).json()
    client.delete(f"/api/categories/{child['id']}")
    response = client.delete(f"/api/categories/{parent['id']}")
    assert response.status_code == 204
