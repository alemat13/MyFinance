def test_get_split_weights_defaults_to_zero(client, sample_user):
    response = client.get("/api/split-weights")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == sample_user.id
    assert data[0]["weight"] == 0.0


def test_put_split_weights(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 55000.0}],
    )
    assert response.status_code == 200
    data = response.json()
    assert data[0]["weight"] == 55000.0

    response = client.get("/api/split-weights")
    assert response.json()[0]["weight"] == 55000.0


def test_put_split_weights_negative_rejected(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": -10.0}],
    )
    assert response.status_code == 422


def test_put_split_weights_all_zero_rejected(client, sample_user):
    response = client.put(
        "/api/split-weights",
        json=[{"user_id": sample_user.id, "weight": 0.0}],
    )
    assert response.status_code == 422
