from datetime import date, datetime, timedelta

import pytest

from models import Category, GlobalSplitWeight, Transaction, TransactionHistory


@pytest.fixture()
def groceries(db):
    category = Category(name="Groceries", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@pytest.fixture()
def global_weights(db, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    db.commit()


def _make(db, account, category, n):
    rows = [Transaction(date=date(2026, 1, 1 + i), payee=f"Shop {i}", amount=10.0 + i,
                        account_id=account.id, category_id=category.id) for i in range(n)]
    db.add_all(rows)
    db.commit()
    return [t.id for t in rows]


def test_bulk_edit_is_one_entry_with_its_rows_and_transactions(client, db, sample_account, sample_category, groceries):
    ids = _make(db, sample_account, sample_category, 5)
    response = client.put("/api/transactions/bulk-update",
                          json={"transaction_ids": ids, "update": {"category_id": groceries.id}})
    assert response.status_code == 200

    page = client.get("/api/history").json()
    assert page["next_before_id"] is None
    [entry] = page["items"]
    assert entry["count"] == 5
    assert entry["action"] == "updated"
    assert entry["source"] == "bulk"
    assert entry["batch_id"]
    assert entry["transaction_id"] is None
    assert entry["changes"] == {"category_id": {"new": groceries.id}}

    ref = {k: entry[k] for k in ("first_id", "last_id", "action", "source", "batch_id")}
    rows = client.get("/api/history/rows", params=ref).json()
    assert rows["total"] == 5
    assert sorted(r["transaction_id"] for r in rows["items"]) == sorted(ids)

    search = client.post("/api/transactions/search", json={"history_group": ref}).json()
    assert sorted(t["id"] for t in search["items"]) == sorted(ids)


def test_two_bulk_edits_stay_two_entries(client, db, sample_account, sample_category, groceries):
    ids = _make(db, sample_account, sample_category, 3)
    client.put("/api/transactions/bulk-update", json={"transaction_ids": ids, "update": {"category_id": groceries.id}})
    client.put("/api/transactions/bulk-update", json={"transaction_ids": ids, "update": {"category_id": sample_category.id}})

    items = client.get("/api/history").json()["items"]
    assert [e["count"] for e in items] == [3, 3]
    assert items[0]["changes"] == {"category_id": {"new": sample_category.id}}


def test_single_edit_carries_its_own_snapshot(client, sample_transaction, groceries):
    client.put(f"/api/transactions/{sample_transaction.id}", json={"category_id": groceries.id})
    [entry] = client.get("/api/history").json()["items"]
    assert entry["count"] == 1
    assert entry["transaction_id"] == sample_transaction.id
    assert entry["payee"] == "Test Payee"
    assert entry["changes"]["category_id"]["new"] == groceries.id


def test_bulk_rename_reports_payee_as_mixed(client, db, sample_account, sample_category):
    ids = _make(db, sample_account, sample_category, 2)
    client.put("/api/transactions/bulk-update",
               json={"transaction_ids": ids, "update": {"payee": "CB ", "payee_mode": "prepend"}})
    [entry] = client.get("/api/history").json()["items"]
    assert entry["changes"] == {"payee": {"new": None, "mixed": True}}


def _legacy(db, transaction_id, at, new_category, actor=None):
    db.add(TransactionHistory(transaction_id=transaction_id, action="updated", changed_at=at,
                              changed_by_user_id=actor,
                              changes={"category_id": {"old": None, "new": new_category}}))


def test_rows_without_batch_are_grouped_by_change_and_time(client, db, sample_account, sample_category, groceries):
    ids = _make(db, sample_account, sample_category, 6)
    start = datetime(2026, 10, 1, 12, 0, 0)
    # A pre-batch bulk edit: four rows a second apart...
    for i, tid in enumerate(ids[:4]):
        _legacy(db, tid, start + timedelta(seconds=i), groceries.id)
    # ...then a different change right after, and the same change an hour later.
    _legacy(db, ids[4], start + timedelta(seconds=5), sample_category.id)
    _legacy(db, ids[5], start + timedelta(hours=1), groceries.id)
    db.commit()

    items = client.get("/api/history").json()["items"]
    assert [e["count"] for e in items] == [1, 1, 4]
    legacy = items[2]
    assert legacy["batch_id"] is None
    ref = {k: legacy[k] for k in ("first_id", "last_id", "action")}
    rows = client.get("/api/history/rows", params=ref).json()
    assert sorted(r["transaction_id"] for r in rows["items"]) == sorted(ids[:4])


def test_pagination_never_splits_an_entry(client, db, global_weights, sample_account, sample_category, groceries, monkeypatch):
    import history
    monkeypatch.setattr(history, "SCAN_CHUNK", 3)
    ids = _make(db, sample_account, sample_category, 7)
    client.put("/api/transactions/bulk-update", json={"transaction_ids": ids, "update": {"category_id": groceries.id}})
    client.put(f"/api/transactions/{ids[0]}", json={"payee": "Renamed"})
    client.put(f"/api/transactions/{ids[1]}", json={"memo": "Note"})

    first = client.get("/api/history", params={"limit": 2}).json()
    assert [e["count"] for e in first["items"]] == [1, 1]
    second = client.get("/api/history", params={"limit": 2, "before_id": first["next_before_id"]}).json()
    assert [e["count"] for e in second["items"]] == [7]
    assert second["next_before_id"] is None


def test_filters_by_action_and_origin(client, db, sample_account, sample_category, groceries, sample_transaction):
    ids = _make(db, sample_account, sample_category, 2)
    client.put("/api/transactions/bulk-update", json={"transaction_ids": ids, "update": {"category_id": groceries.id}})
    client.put(f"/api/transactions/{sample_transaction.id}", json={"payee": "Renamed"})
    client.delete(f"/api/transactions/{ids[0]}")

    bulk = client.get("/api/history", params={"source": "bulk"}).json()["items"]
    assert [(e["source"], e["count"]) for e in bulk] == [("bulk", 2)]
    manual = client.get("/api/history", params={"source": "manual"}).json()["items"]
    assert [e["action"] for e in manual] == ["deleted", "updated"]
    deleted = client.get("/api/history", params={"action": "deleted"}).json()["items"]
    assert [e["transaction_id"] for e in deleted] == [ids[0]]


def test_bulk_delete_is_one_entry_and_keeps_snapshots(client, db, sample_account, sample_category):
    ids = _make(db, sample_account, sample_category, 3)
    response = client.request("DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": ids})
    assert response.status_code == 200
    [entry] = client.get("/api/history").json()["items"]
    assert (entry["action"], entry["source"], entry["count"]) == ("deleted", "bulk", 3)
    rows = client.get("/api/history/rows", params={k: entry[k] for k in ("first_id", "last_id", "action", "source", "batch_id")}).json()
    assert sorted(r["payee"] for r in rows["items"]) == ["Shop 0", "Shop 1", "Shop 2"]


def test_csv_import_commit_is_one_batch(client, sample_account, sample_category, sample_user):
    rows = [{"date": "2026-02-0%d" % (i + 1), "payee": f"Imp {i}", "amount": -5.0, "account_id": sample_account.id,
             "category_id": sample_category.id, "split_weights": [{"user_id": sample_user.id, "weight": 1}]}
            for i in range(3)]
    assert client.post("/api/import/commit", json={"rows": rows}).status_code == 200
    [entry] = client.get("/api/history").json()["items"]
    assert (entry["action"], entry["source"], entry["count"]) == ("created", "csv_import", 3)
    assert entry["batch_id"]
