def test_get_split_weights_defaults_to_zero(client, sample_user):
    """A user inserted directly (not via POST /api/users, as this fixture
    does) has no GlobalSplitWeight row at all, so GET synthesizes 0 for
    them — see test_new_user_gets_global_weight_of_one_by_default below for
    the real, mandatory-by-default bootstrap path."""
    response = client.get("/api/split-weights")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == sample_user.id
    assert data[0]["weight"] == 0


def test_new_user_gets_global_weight_of_one_by_default(client):
    """Splits are mandatory, so every user created through the real API gets
    a positive global split weight out of the box — the household's global
    tier can never be entirely unconfigured."""
    create_response = client.post("/api/users", json={"name": "New User"})
    assert create_response.status_code == 201
    user_id = create_response.json()["id"]

    response = client.get("/api/split-weights")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == user_id
    assert data[0]["weight"] == 1


def test_put_split_weights(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 55000}],
    )
    assert response.status_code == 200
    data = response.json()
    assert data[0]["weight"] == 55000

    response = client.get("/api/split-weights")
    assert response.json()[0]["weight"] == 55000


def test_put_split_weights_negative_rejected(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": -10}],
    )
    assert response.status_code == 422


def test_put_split_weights_all_zero_rejected(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 0}],
    )
    assert response.status_code == 422


def test_put_split_weights_empty_list_rejected(client, sample_user):
    """Unlike the account/category tiers, the global tier is a mandatory
    floor — it can never be cleared out entirely."""
    response = client.put("/api/split-weights", json=[])
    assert response.status_code == 422

    # And the previously-configured weight is still in effect afterward.
    response = client.get("/api/split-weights")
    assert response.json()[0]["weight"] == 0


def test_put_split_weights_duplicate_user_rejected(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 3}, {"user_id": sample_user.id, "weight": 7}],
    )
    assert response.status_code == 422
