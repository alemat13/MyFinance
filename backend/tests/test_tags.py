from datetime import date

import pytest

from models import GlobalSplitWeight, Tag, Transaction, TransactionHistory, TransactionRule, TransactionSplit, TransactionTag
from tests.test_backup import _post_import, _unzip_payload
from tests.test_import import PREVIEW_FORM, _csv_file


@pytest.fixture()
def trip(db):
    tag = Tag(name="Trip", color="#00aa00")
    db.add(tag)
    db.commit()
    return tag


@pytest.fixture()
def refund(db):
    tag = Tag(name="Refund")
    db.add(tag)
    db.commit()
    return tag


@pytest.fixture()
def global_weight(db, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    db.commit()


def _txn(db, account_id, payee="Shop", amount=-10.0, user_id=None, tags=()):
    t = Transaction(date=date(2026, 8, 1), payee=payee, amount=amount, account_id=account_id)
    db.add(t)
    db.flush()
    if user_id is not None:
        db.add(TransactionSplit(transaction_id=t.id, user_id=user_id, weight=1, share_amount=amount, source="global"))
    t.tags = list(tags)
    db.commit()
    return t


def _history_tags(db, transaction_id):
    return [
        (h.changes or {}).get("tags")
        for h in db.query(TransactionHistory).filter(TransactionHistory.transaction_id == transaction_id)
        .order_by(TransactionHistory.id).all()
        if (h.changes or {}).get("tags")
    ]


# ── Tag list ─────────────────────────────────────────────────────

def test_create_list_rename_delete(client, db, sample_account, trip):
    _txn(db, sample_account.id, tags=[trip])
    created = client.post("/api/tags", json={"name": " Work "})
    assert created.status_code == 201
    assert created.json()["name"] == "Work"

    listed = client.get("/api/tags").json()
    assert [(t["name"], t["transaction_count"]) for t in listed] == [("Trip", 1), ("Work", 0)]

    assert client.post("/api/tags", json={"name": "trip"}).status_code == 422
    assert client.post("/api/tags", json={"name": "a,b"}).status_code == 422

    renamed = client.put(f"/api/tags/{trip.id}", json={"name": "Holidays"})
    assert renamed.json()["name"] == "Holidays"
    assert renamed.json()["color"] == "#00aa00"


def test_deleting_a_tag_removes_it_from_transactions_with_history(client, db, sample_account, trip, refund):
    t = _txn(db, sample_account.id, tags=[trip, refund])
    assert client.delete(f"/api/tags/{trip.id}").status_code == 204
    db.expire_all()
    assert [tag.name for tag in db.get(Transaction, t.id).tags] == ["Refund"]
    assert db.query(TransactionTag).count() == 1
    assert _history_tags(db, t.id) == [{"old": ["Refund", "Trip"], "new": ["Refund"]}]


# ── One transaction ──────────────────────────────────────────────

def test_create_and_update_transaction_tags_with_history(client, db, sample_account, sample_user, trip, refund):
    body = {"date": "2026-08-02", "payee": "Hotel", "amount": -100, "account_id": sample_account.id,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}], "tag_ids": [trip.id]}
    created = client.post("/api/transactions", json=body)
    assert created.status_code == 201
    tid = created.json()["id"]
    assert [t["name"] for t in created.json()["tags"]] == ["Trip"]

    updated = client.put(f"/api/transactions/{tid}", json={"tag_ids": [refund.id]})
    assert [t["name"] for t in updated.json()["tags"]] == ["Refund"]

    # Not sending tag_ids leaves them alone.
    untouched = client.put(f"/api/transactions/{tid}", json={"memo": "x"})
    assert [t["name"] for t in untouched.json()["tags"]] == ["Refund"]

    assert _history_tags(db, tid) == [
        {"old": None, "new": ["Trip"]},
        {"old": ["Trip"], "new": ["Refund"]},
    ]
    history = client.get(f"/api/transactions/{tid}/history").json()
    assert history[1]["changes"]["tags"] == {"old": ["Trip"], "new": ["Refund"]}

    assert client.put(f"/api/transactions/{tid}", json={"tag_ids": [9999]}).status_code == 422


# ── Search ───────────────────────────────────────────────────────

def test_search_by_tag_simple_and_advanced(client, db, sample_account, trip, refund):
    a = _txn(db, sample_account.id, "A", tags=[trip])
    b = _txn(db, sample_account.id, "B", tags=[trip, refund])
    c = _txn(db, sample_account.id, "C")

    def ids(body):
        res = client.post("/api/transactions/search", json=body)
        assert res.status_code == 200, res.text
        return sorted(i["id"] for i in res.json()["items"])

    assert ids({"tag_id": trip.id}) == [a.id, b.id]
    assert ids({"untagged": True}) == [c.id]
    assert ids({"conditions": [{"field": "tag_id", "operator": "eq", "value": refund.id}]}) == [b.id]
    assert ids({"conditions": [{"field": "tag_id", "operator": "ne", "value": refund.id}]}) == [a.id, c.id]
    assert ids({"conditions": [{"field": "tag_id", "operator": "eq", "value": None}]}) == [c.id]
    assert ids({"conditions": [{"field": "tag_id", "operator": "ne", "value": None}]}) == [a.id, b.id]


# ── Bulk ─────────────────────────────────────────────────────────

def test_bulk_add_and_remove_tags(client, db, sample_account, trip, refund):
    a = _txn(db, sample_account.id, "A", tags=[refund])
    b = _txn(db, sample_account.id, "B")
    res = client.put("/api/transactions/bulk-update", json={
        "transaction_ids": [a.id, b.id],
        "update": {"add_tag_ids": [trip.id], "remove_tag_ids": [refund.id]},
    })
    assert res.status_code == 200, res.text
    db.expire_all()
    assert [t.name for t in db.get(Transaction, a.id).tags] == ["Trip"]
    assert [t.name for t in db.get(Transaction, b.id).tags] == ["Trip"]
    assert _history_tags(db, a.id) == [{"old": ["Refund"], "new": ["Trip"]}]

    both = client.put("/api/transactions/bulk-update", json={
        "transaction_ids": [a.id], "update": {"add_tag_ids": [trip.id], "remove_tag_ids": [trip.id]},
    })
    assert both.status_code == 422


def test_bulk_add_by_filter(client, db, sample_account, trip):
    _txn(db, sample_account.id, "Shop 1")
    _txn(db, sample_account.id, "Shop 2")
    res = client.put("/api/transactions/bulk-update", json={
        "filter": {"search": "shop"}, "expected_count": 2, "update": {"add_tag_ids": [trip.id]},
    })
    assert res.json()["updated_count"] == 2
    assert db.query(TransactionTag).count() == 2


# ── Rules ────────────────────────────────────────────────────────

def test_rule_adds_tags_and_tests_them(client, db, sample_account, sample_user, trip, refund):
    rule = client.post("/api/rules", json={
        "name": "Hotels", "conditions": [{"field": "payee", "operator": "contains", "value": "hotel"}],
        "actions": {"add_tag_ids": [trip.id]},
    })
    assert rule.status_code == 201, rule.text
    second = client.post("/api/rules", json={
        "name": "Trip refunds",
        "conditions": [{"field": "tag_id", "operator": "eq", "value": trip.id},
                       {"field": "amount", "operator": "gt", "value": 0}],
        "actions": {"add_tag_ids": [refund.id]},
    })
    assert second.status_code == 201, second.text

    hotel = _txn(db, sample_account.id, "Hotel Paris", amount=50.0, user_id=sample_user.id, tags=[refund])
    preview = client.post("/api/rules/preview", json={"transaction_ids": [hotel.id]}).json()
    # Refund was already there, so only Trip is new.
    assert preview["items"][0]["outcome"]["add_tag_names"] == ["Trip"]

    applied = client.post("/api/rules/apply", json={"transaction_ids": [hotel.id]})
    assert applied.json()["updated_count"] == 1
    db.expire_all()
    assert sorted(t.name for t in db.get(Transaction, hotel.id).tags) == ["Refund", "Trip"]
    assert _history_tags(db, hotel.id) == [{"old": ["Refund"], "new": ["Refund", "Trip"]}]


def test_rule_with_unknown_tag_is_refused(client):
    res = client.post("/api/rules", json={
        "name": "X", "conditions": [{"field": "payee", "operator": "contains", "value": "x"}],
        "actions": {"add_tag_ids": [42]},
    })
    assert res.status_code == 404


def test_import_preview_reports_and_commit_writes_rule_tags(client, db, sample_account, global_weight, trip):
    db.add(TransactionRule(name="Hotels", conditions=[{"field": "payee", "operator": "contains", "value": "hotel"}],
                           actions={"add_tag_ids": [trip.id]}))
    db.commit()
    csv = "Date,Label,Amount,Category\n2026-08-03,Hotel Nice,-80,\n"
    preview = client.post("/api/import/preview", data={**PREVIEW_FORM, "account_id": sample_account.id},
                          files=_csv_file(csv)).json()
    assert preview[0]["rules"]["add_tag_ids"] == [trip.id]

    commit = client.post("/api/import/commit", json={"rows": [{
        "date": "2026-08-03", "payee": "Hotel Nice", "amount": -80, "account_id": sample_account.id,
        "tag_ids": preview[0]["rules"]["add_tag_ids"],
    }]})
    assert commit.status_code == 200, commit.text
    tid = commit.json()["transaction_ids"][0]
    assert [t.name for t in db.get(Transaction, tid).tags] == ["Trip"]
    assert _history_tags(db, tid) == [{"old": None, "new": ["Trip"]}]


# ── Divide ───────────────────────────────────────────────────────

def test_divided_parts_keep_the_tags(client, db, sample_account, sample_user, global_weight, trip):
    t = _txn(db, sample_account.id, "Big", amount=-100.0, user_id=sample_user.id, tags=[trip])
    res = client.post(f"/api/transactions/{t.id}/divide", json={"parts": [
        {"date": "2026-08-01", "payee": "Big 1", "amount": -60},
        {"date": "2026-08-01", "payee": "Big 2", "amount": -40},
    ]})
    assert res.status_code == 200, res.text
    assert [[tag["name"] for tag in p["tags"]] for p in res.json()["transactions"]] == [["Trip"], ["Trip"]]


# ── Backup ───────────────────────────────────────────────────────

def test_backup_round_trip_keeps_tags(client, db, sample_account, sample_user, trip):
    t = _txn(db, sample_account.id, user_id=sample_user.id, tags=[trip])
    exported = client.get("/api/backup/export")
    payload = _unzip_payload(exported.content)
    assert payload["tags"][0]["name"] == "Trip"
    assert payload["transaction_tags"] == [{"transaction_id": t.id, "tag_id": trip.id}]

    restored = _post_import(client, exported.content, mode="overwrite")
    assert restored.status_code == 200, restored.text
    assert restored.json()["transaction_tags"] == 1
    db.expire_all()
    assert [tag.name for tag in db.get(Transaction, t.id).tags] == ["Trip"]


def test_partial_restore_reuses_tags_by_name(client, db, sample_account, sample_user, trip):
    _txn(db, sample_account.id, user_id=sample_user.id, tags=[trip])
    exported = client.get("/api/backup/export")
    restored = _post_import(client, exported.content, mode="partial")
    assert restored.status_code == 200, restored.text
    assert restored.json()["tags"] == 0
    assert db.query(Tag).count() == 1
    assert db.query(TransactionTag).count() == 2
