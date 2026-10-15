from models import TransactionHistory


def test_edit_raw_fields_sets_and_records_history(client, db, sample_transaction, sample_user):
    response = client.put(
        f"/api/transactions/{sample_transaction.id}/raw?actor_user_id={sample_user.id}",
        json={"raw_source": "enable_banking", "raw_label": "  CARTE 12/05 CARREFOUR  ", "raw_booking_date": "2026-05-13"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["raw_source"] == "enable_banking"
    assert body["raw_label"] == "CARTE 12/05 CARREFOUR"
    assert body["raw_booking_date"] == "2026-05-13"

    history = db.query(TransactionHistory).filter_by(transaction_id=sample_transaction.id, source="admin").one()
    assert history.action == "updated"
    assert history.changed_by_user_id == sample_user.id
    assert history.changes == {
        "raw_source": {"old": None, "new": "enable_banking"},
        "raw_label": {"old": None, "new": "CARTE 12/05 CARREFOUR"},
        "raw_booking_date": {"old": None, "new": "2026-05-13"},
    }


def test_edit_raw_fields_clears_and_leaves_omitted_fields(client, db, sample_transaction):
    client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_label": "A", "raw_counterparty": "B"})
    response = client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_label": "   ", "raw_counterparty": None})
    body = response.json()
    assert body["raw_label"] is None
    assert body["raw_counterparty"] is None

    response = client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_merchant_location": "PARIS"})
    assert response.json()["raw_merchant_location"] == "PARIS"
    assert response.json()["raw_label"] is None


def test_edit_raw_fields_without_change_writes_no_history(client, db, sample_transaction):
    client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_label": "A"})
    before = db.query(TransactionHistory).filter_by(transaction_id=sample_transaction.id).count()
    response = client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_label": "A"})
    assert response.status_code == 200
    assert db.query(TransactionHistory).filter_by(transaction_id=sample_transaction.id).count() == before


def test_edit_raw_fields_leaves_core_fields_alone(client, sample_transaction):
    before = client.get(f"/api/transactions/{sample_transaction.id}").json()
    after = client.put(f"/api/transactions/{sample_transaction.id}/raw", json={"raw_label": "X"}).json()
    for field in ("date", "payee", "memo", "amount", "account_id", "category_id", "splits"):
        assert after[field] == before[field]


def test_edit_raw_fields_validation(client, sample_transaction):
    url = f"/api/transactions/{sample_transaction.id}/raw"
    assert client.put(url, json={"raw_source": "somewhere"}).status_code == 422
    assert client.put(url, json={"raw_merchant_category_code": "12345678901"}).status_code == 422
    assert client.put(url, json={"raw_initiated_date": "not-a-date"}).status_code == 422


def test_edit_raw_fields_unknown_transaction(client):
    assert client.put("/api/transactions/99999/raw", json={"raw_label": "X"}).status_code == 404
