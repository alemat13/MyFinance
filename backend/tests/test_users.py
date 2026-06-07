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
