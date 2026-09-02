def test_get_account_split_weights_defaults_to_zero(client, sample_account, sample_user):
    response = client.get(f"/api/accounts/{sample_account.id}/split-weights")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["user_id"] == sample_user.id
    assert data[0]["weight"] == 0


def test_put_account_split_weights(client, sample_account, sample_user):
    response = client.put(
        f"/api/accounts/{sample_account.id}/split-weights",
        json=[{"user_id": sample_user.id, "weight": 55}],
    )
    assert response.status_code == 200
    assert response.json()[0]["weight"] == 55

    response = client.get(f"/api/accounts/{sample_account.id}/split-weights")
    assert response.json()[0]["weight"] == 55


def test_put_account_split_weights_negative_rejected(client, sample_account, sample_user):
    response = client.put(
        f"/api/accounts/{sample_account.id}/split-weights",
        json=[{"user_id": sample_user.id, "weight": -1}],
    )
    assert response.status_code == 422


def test_put_account_split_weights_all_zero_rejected(client, sample_account, sample_user):
    response = client.put(
        f"/api/accounts/{sample_account.id}/split-weights",
        json=[{"user_id": sample_user.id, "weight": 0}],
    )
    assert response.status_code == 422


def test_account_split_weights_404_for_missing_account(client, sample_user):
    response = client.get("/api/accounts/999999/split-weights")
    assert response.status_code == 404

    response = client.put(
        "/api/accounts/999999/split-weights",
        json=[{"user_id": sample_user.id, "weight": 10}],
    )
    assert response.status_code == 404


def test_account_split_weights_isolated_per_account(client, db, sample_account, sample_user):
    from models import Account
    other_account = Account(name="Other", type="Checking")
    db.add(other_account)
    db.commit()

    client.put(f"/api/accounts/{sample_account.id}/split-weights", json=[{"user_id": sample_user.id, "weight": 55}])

    response = client.get(f"/api/accounts/{other_account.id}/split-weights")
    assert response.json()[0]["weight"] == 0


def test_delete_account_cascades_split_weights(client, db, sample_account, sample_user):
    client.put(f"/api/accounts/{sample_account.id}/split-weights", json=[{"user_id": sample_user.id, "weight": 55}])

    response = client.delete(f"/api/accounts/{sample_account.id}")
    assert response.status_code == 204

    from models import AccountSplitWeight
    assert db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == sample_account.id).all() == []
