def _create_transaction(client, sample_account, sample_category, actor_user_id=None, payee="Test Payee"):
    params = f"?actor_user_id={actor_user_id}" if actor_user_id is not None else ""
    return client.post(
        f"/api/transactions{params}",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": payee,
            "amount": 100.0,
        },
    )


def test_create_transaction_writes_history_row(client, sample_account, sample_category, sample_user):
    response = _create_transaction(client, sample_account, sample_category, actor_user_id=sample_user.id)
    transaction_id = response.json()["id"]

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "created"
    assert history[0]["source"] == "manual"
    assert history[0]["changed_by_user_id"] == sample_user.id
    assert history[0]["changed_by_user_name"] == sample_user.name
    assert history[0]["payee"] == "Test Payee"
    assert history[0]["changes"] is None


def test_create_transaction_without_actor_leaves_changed_by_null(client, sample_account, sample_category):
    response = _create_transaction(client, sample_account, sample_category)
    transaction_id = response.json()["id"]

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["changed_by_user_id"] is None
    assert history[0]["changed_by_user_name"] is None


def test_update_transaction_writes_diff_only_for_changed_fields(client, sample_transaction):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"payee": "New Payee"},
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "updated"
    assert history[0]["changes"] == {"payee": {"old": "Test Payee", "new": "New Payee"}}


def test_update_transaction_with_full_unchanged_payload_writes_no_history(client, sample_transaction):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={
            "date": str(sample_transaction.date),
            "payee": sample_transaction.payee,
            "amount": sample_transaction.amount,
            "account_id": sample_transaction.account_id,
            "category_id": sample_transaction.category_id,
        },
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert history == []


def test_update_transaction_date_change_is_json_serializable(client, sample_transaction):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"date": "2026-02-01"},
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert len(history) == 1
    assert history[0]["changes"] == {"date": {"old": "2026-01-15", "new": "2026-02-01"}}


def test_update_transaction_split_only_change_writes_splits_diff(client, sample_transaction, sample_user):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"split_weights": [{"user_id": sample_user.id, "weight": 2}]},
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "updated"
    assert history[0]["changes"] == {
        "splits": {
            "old": [],
            "new": [{"user_id": sample_user.id, "weight": 2, "source": "custom"}],
        },
    }


def test_update_transaction_non_split_field_leaves_splits_untouched_in_history(client, sample_transaction, sample_user):
    client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"split_weights": [{"user_id": sample_user.id, "weight": 1}]},
    )

    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"payee": "Renamed Payee"},
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert len(history) == 2
    assert "splits" not in history[1]["changes"]
    assert history[1]["changes"] == {"payee": {"old": "Test Payee", "new": "Renamed Payee"}}


def test_update_transaction_clearing_split_weights_records_empty_new(client, sample_transaction, sample_user):
    client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"split_weights": [{"user_id": sample_user.id, "weight": 1}]},
    )

    response = client.put(
        f"/api/transactions/{sample_transaction.id}",
        json={"split_weights": []},
    )
    assert response.status_code == 200

    history = client.get(f"/api/transactions/{sample_transaction.id}/history").json()
    assert len(history) == 2
    assert history[1]["changes"] == {
        "splits": {
            "old": [{"user_id": sample_user.id, "weight": 1, "source": "custom"}],
            "new": [],
        },
    }


def test_create_transaction_with_split_weights_records_initial_splits(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Split Payee",
            "amount": 100.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201
    transaction_id = response.json()["id"]

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "created"
    assert history[0]["changes"] == {
        "splits": {
            "old": None,
            "new": [{"user_id": sample_user.id, "weight": 1, "source": "custom"}],
        },
    }


def test_import_commit_with_split_weights_records_initial_splits(client, sample_account, sample_category, sample_user):
    response = client.post(
        "/api/import/commit",
        json={
            "rows": [
                {
                    "account_id": sample_account.id,
                    "category_id": sample_category.id,
                    "date": "2026-01-15",
                    "payee": "Imported Split Payee",
                    "amount": 42.0,
                    "split_weights": [{"user_id": sample_user.id, "weight": 1}],
                },
            ],
        },
    )
    assert response.status_code == 200
    transaction_id = response.json()["transaction_ids"][0]

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["changes"] == {
        "splits": {
            "old": None,
            "new": [{"user_id": sample_user.id, "weight": 1, "source": "custom"}],
        },
    }


def test_delete_transaction_writes_history_and_survives_deletion(client, sample_transaction):
    transaction_id = sample_transaction.id
    response = client.delete(f"/api/transactions/{transaction_id}")
    assert response.status_code == 204

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "deleted"
    assert history[0]["payee"] == "Test Payee"


def test_full_lifecycle_history_ordered_oldest_first(client, sample_account, sample_category):
    response = _create_transaction(client, sample_account, sample_category)
    transaction_id = response.json()["id"]

    client.put(f"/api/transactions/{transaction_id}", json={"payee": "Renamed"})
    client.delete(f"/api/transactions/{transaction_id}")

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert [h["action"] for h in history] == ["created", "updated", "deleted"]


def test_history_for_unknown_transaction_returns_empty_list(client):
    response = client.get("/api/transactions/999/history")
    assert response.status_code == 200
    assert response.json() == []


def test_import_commit_writes_history_with_csv_source(client, sample_account, sample_category, sample_user):
    response = client.post(
        f"/api/import/commit?actor_user_id={sample_user.id}",
        json={
            "rows": [
                {
                    "account_id": sample_account.id,
                    "category_id": sample_category.id,
                    "date": "2026-01-15",
                    "payee": "Imported Payee",
                    "amount": 42.0,
                },
            ],
        },
    )
    assert response.status_code == 200
    transaction_id = response.json()["transaction_ids"][0]

    history = client.get(f"/api/transactions/{transaction_id}/history").json()
    assert len(history) == 1
    assert history[0]["action"] == "created"
    assert history[0]["source"] == "csv_import"
    assert history[0]["changed_by_user_id"] == sample_user.id
    assert history[0]["payee"] == "Imported Payee"
