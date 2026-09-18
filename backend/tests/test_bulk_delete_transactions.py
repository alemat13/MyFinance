from datetime import date

import pytest

from models import Category, Transaction, TransactionSplit


@pytest.fixture()
def sample_category2(db):
    category = Category(name="Test Groceries", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def _make_transaction(db, account, category, **overrides):
    defaults = dict(date=date(2026, 1, 15), payee="Payee", amount=100.0,
                     account_id=account.id, category_id=category.id)
    defaults.update(overrides)
    transaction = Transaction(**defaults)
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction


def _bulk_delete(client, transaction_ids, actor_user_id=None):
    params = f"?actor_user_id={actor_user_id}" if actor_user_id is not None else ""
    return client.request(
        "DELETE",
        f"/api/transactions/bulk-delete{params}",
        json={"transaction_ids": transaction_ids},
    )


def test_bulk_delete_transactions_deletes_all_selected(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category)
    t2 = _make_transaction(db, sample_account, sample_category)

    response = _bulk_delete(client, [t1.id, t2.id])
    assert response.status_code == 200
    assert response.json() == {"deleted_count": 2, "transaction_ids": [t1.id, t2.id]}

    assert client.get(f"/api/transactions/{t1.id}").status_code == 404
    assert client.get(f"/api/transactions/{t2.id}").status_code == 404


def test_bulk_delete_transactions_deletes_splits_too(client, db, sample_transaction):
    response = _bulk_delete(client, [sample_transaction.id])
    assert response.status_code == 200

    assert client.get(f"/api/transactions/{sample_transaction.id}").status_code == 404
    remaining_splits = db.query(TransactionSplit).filter(
        TransactionSplit.transaction_id == sample_transaction.id
    ).all()
    assert remaining_splits == []


def test_bulk_delete_missing_transaction_id_404_and_no_mutation(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category)

    response = _bulk_delete(client, [t1.id, 999999])
    assert response.status_code == 404

    assert client.get(f"/api/transactions/{t1.id}").status_code == 200


def test_bulk_delete_empty_transaction_ids_422(client):
    response = _bulk_delete(client, [])
    assert response.status_code == 422


def test_bulk_delete_writes_one_history_row_per_deleted_transaction(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category)
    t2 = _make_transaction(db, sample_account, sample_category)

    _bulk_delete(client, [t1.id, t2.id])

    for tid in (t1.id, t2.id):
        history = client.get(f"/api/transactions/{tid}/history").json()
        assert len(history) == 1
        assert history[0]["action"] == "deleted"


def test_bulk_delete_actor_user_id_recorded_in_history(client, db, sample_account, sample_category, sample_user):
    t1 = _make_transaction(db, sample_account, sample_category)

    _bulk_delete(client, [t1.id], actor_user_id=sample_user.id)

    history = client.get(f"/api/transactions/{t1.id}/history").json()
    assert history[0]["changed_by_user_id"] == sample_user.id


def test_bulk_delete_route_not_shadowed_by_transaction_id_route(client, db, sample_account, sample_category):
    # Sanity check for the route-registration-order hazard: "bulk-delete"
    # must not be swallowed by the /{transaction_id} DELETE route and 422
    # on failed int conversion before this route is ever tried.
    t1 = _make_transaction(db, sample_account, sample_category)

    response = _bulk_delete(client, [t1.id])
    assert response.status_code == 200


def test_bulk_delete_does_not_protect_divide_group_transactions(client, sample_transaction, sample_category, sample_user):
    divide_response = client.post(
        f"/api/transactions/{sample_transaction.id}/divide",
        json={
            "parts": [
                {"date": "2026-01-15", "payee": "Part A", "amount": 300.0, "category_id": sample_category.id,
                 "split_weights": [{"user_id": sample_user.id, "weight": 1}]},
                {"date": "2026-01-15", "payee": "Part B", "amount": 200.0, "category_id": sample_category.id,
                 "split_weights": [{"user_id": sample_user.id, "weight": 1}]},
            ]
        },
    )
    assert divide_response.status_code == 200
    parts = divide_response.json()["transactions"]
    anchor_id, sibling_id = parts[0]["id"], parts[1]["id"]

    # Bulk delete stays as permissive as single delete: no new protection
    # against removing divide-group anchors/siblings.
    response = _bulk_delete(client, [anchor_id, sibling_id])
    assert response.status_code == 200
    assert response.json()["deleted_count"] == 2
