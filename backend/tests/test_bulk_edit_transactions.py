from datetime import date

import pytest

from models import Transaction


@pytest.fixture()
def sample_category2(db):
    from models import Category
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


def test_bulk_update_category_applies_to_all_selected(client, db, sample_account, sample_category, sample_category2):
    t1 = _make_transaction(db, sample_account, sample_category)
    t2 = _make_transaction(db, sample_account, sample_category)

    response = client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [t1.id, t2.id], "update": {"category_id": sample_category2.id}},
    )
    assert response.status_code == 200
    assert response.json() == {"updated_count": 2, "transaction_ids": [t1.id, t2.id]}

    for tid in (t1.id, t2.id):
        assert client.get(f"/api/transactions/{tid}").json()["category_id"] == sample_category2.id


def test_bulk_update_accounting_month_offset_applies_per_transaction_own_date(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category, date=date(2026, 1, 15))
    t2 = _make_transaction(db, sample_account, sample_category, date=date(2026, 3, 15))

    response = client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [t1.id, t2.id], "update": {"accounting_month_offset": 1}},
    )
    assert response.status_code == 200

    data1 = client.get(f"/api/transactions/{t1.id}").json()
    data2 = client.get(f"/api/transactions/{t2.id}").json()
    assert data1["accounting_month_offset"] == 1
    assert data1["accounting_month"] == "2026-02"
    assert data2["accounting_month_offset"] == 1
    assert data2["accounting_month"] == "2026-04"


def test_bulk_update_split_weights_reprorates_against_each_transactions_own_amount(client, db, sample_account, sample_category, sample_user):
    t1 = _make_transaction(db, sample_account, sample_category, amount=100.0)
    t2 = _make_transaction(db, sample_account, sample_category, amount=200.0)

    response = client.put(
        "/api/transactions/bulk-update",
        json={
            "transaction_ids": [t1.id, t2.id],
            "update": {"split_weights": [{"user_id": sample_user.id, "weight": 1}]},
        },
    )
    assert response.status_code == 200

    splits1 = client.get(f"/api/transactions/{t1.id}").json()["splits"]
    splits2 = client.get(f"/api/transactions/{t2.id}").json()["splits"]
    assert splits1[0]["weight"] == 1 and splits1[0]["share_amount"] == 100.0
    assert splits2[0]["weight"] == 1 and splits2[0]["share_amount"] == 200.0


def test_bulk_update_two_fields_at_once(client, db, sample_account, sample_category, sample_category2):
    t1 = _make_transaction(db, sample_account, sample_category)

    response = client.put(
        "/api/transactions/bulk-update",
        json={
            "transaction_ids": [t1.id],
            "update": {"category_id": sample_category2.id, "accounting_month_offset": 2},
        },
    )
    assert response.status_code == 200
    data = client.get(f"/api/transactions/{t1.id}").json()
    assert data["category_id"] == sample_category2.id
    assert data["accounting_month_offset"] == 2


def test_bulk_update_missing_transaction_id_404_and_no_mutation(client, db, sample_account, sample_category, sample_category2):
    t1 = _make_transaction(db, sample_account, sample_category)

    response = client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [t1.id, 999999], "update": {"category_id": sample_category2.id}},
    )
    assert response.status_code == 404

    data = client.get(f"/api/transactions/{t1.id}").json()
    assert data["category_id"] == sample_category.id


def test_bulk_update_invalid_weights_422_and_no_mutation(client, db, sample_account, sample_category, sample_user):
    t1 = _make_transaction(db, sample_account, sample_category)

    response = client.put(
        "/api/transactions/bulk-update",
        json={
            "transaction_ids": [t1.id],
            "update": {"split_weights": [{"user_id": sample_user.id, "weight": -1}]},
        },
    )
    assert response.status_code == 422

    data = client.get(f"/api/transactions/{t1.id}").json()
    assert data["splits"] == []


def test_bulk_update_empty_transaction_ids_422(client):
    response = client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [], "update": {"category_id": 1}},
    )
    assert response.status_code == 422


def test_bulk_update_no_fields_set_422(client, db, sample_account, sample_category):
    t1 = _make_transaction(db, sample_account, sample_category)

    response = client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [t1.id], "update": {}},
    )
    assert response.status_code == 422


def test_bulk_update_writes_one_history_row_per_changed_transaction(client, db, sample_account, sample_category, sample_category2):
    t1 = _make_transaction(db, sample_account, sample_category)
    t2 = _make_transaction(db, sample_account, sample_category)

    client.put(
        "/api/transactions/bulk-update",
        json={"transaction_ids": [t1.id, t2.id], "update": {"category_id": sample_category2.id}},
    )

    for tid in (t1.id, t2.id):
        history = client.get(f"/api/transactions/{tid}/history").json()
        assert len(history) == 1
        assert history[0]["changes"] == {
            "category_id": {"old": sample_category.id, "new": sample_category2.id},
        }


def test_bulk_update_split_only_change_writes_no_history_row(client, db, sample_account, sample_category, sample_user):
    t1 = _make_transaction(db, sample_account, sample_category)

    client.put(
        "/api/transactions/bulk-update",
        json={
            "transaction_ids": [t1.id],
            "update": {"split_weights": [{"user_id": sample_user.id, "weight": 1}]},
        },
    )

    history = client.get(f"/api/transactions/{t1.id}/history").json()
    assert history == []


def test_bulk_update_mixed_accounts_and_currencies_succeeds(client, db, sample_category, sample_user):
    from models import Account
    eur_account = Account(name="EUR Checking", type="Checking", balance=0.0, currency="EUR")
    usd_account = Account(name="USD Checking", type="Checking", balance=0.0, currency="USD")
    db.add_all([eur_account, usd_account])
    db.commit()
    db.refresh(eur_account)
    db.refresh(usd_account)

    t1 = _make_transaction(db, eur_account, sample_category, amount=50.0)
    t2 = _make_transaction(db, usd_account, sample_category, amount=75.0)

    response = client.put(
        "/api/transactions/bulk-update",
        json={
            "transaction_ids": [t1.id, t2.id],
            "update": {"split_weights": [{"user_id": sample_user.id, "weight": 1}]},
        },
    )
    assert response.status_code == 200
    assert response.json()["updated_count"] == 2

    assert client.get(f"/api/transactions/{t1.id}").json()["splits"][0]["share_amount"] == 50.0
    assert client.get(f"/api/transactions/{t2.id}").json()["splits"][0]["share_amount"] == 75.0


def test_bulk_update_actor_user_id_recorded_in_history(client, db, sample_account, sample_category, sample_category2, sample_user):
    t1 = _make_transaction(db, sample_account, sample_category)

    client.put(
        f"/api/transactions/bulk-update?actor_user_id={sample_user.id}",
        json={"transaction_ids": [t1.id], "update": {"category_id": sample_category2.id}},
    )

    history = client.get(f"/api/transactions/{t1.id}/history").json()
    assert history[0]["changed_by_user_id"] == sample_user.id
