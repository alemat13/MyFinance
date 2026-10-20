from datetime import date

from models import Transaction, TransactionHistory, TransactionLink, TransactionSplit
from tests.test_backup import _post_import, _unzip_payload


def _txn(db, account_id, payee="Shop", amount=-10.0, user_id=None):
    t = Transaction(date=date(2026, 8, 1), payee=payee, amount=amount, account_id=account_id)
    db.add(t)
    db.flush()
    if user_id is not None:
        db.add(TransactionSplit(transaction_id=t.id, user_id=user_id, weight=1, share_amount=amount, source="global"))
    db.commit()
    return t


def _link_changes(db, transaction_id):
    return [
        (h.source, h.changes["link"])
        for h in db.query(TransactionHistory).filter(TransactionHistory.transaction_id == transaction_id)
        .order_by(TransactionHistory.id).all()
        if (h.changes or {}).get("link")
    ]


def test_link_lists_members_and_net(client, db, sample_account, sample_account_2):
    doctor = _txn(db, sample_account.id, "Dr Martin", -60.0)
    cpam = _txn(db, sample_account.id, "CPAM", 42.0)
    mutuelle = _txn(db, sample_account_2.id, "MGEN", 12.0)

    res = client.post("/api/transaction-links", json={"transaction_ids": [doctor.id, cpam.id, mutuelle.id], "name": " Dentist "})
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["name"] == "Dentist"
    assert [t["payee"] for t in body["transactions"]] == ["Dr Martin", "CPAM", "MGEN"]
    assert body["totals"] == [{"currency": "EUR", "amount": -6.0}]

    got = client.get(f"/api/transactions/{doctor.id}").json()
    assert got["link_id"] == body["id"]
    assert _link_changes(db, doctor.id) == [("link", {"old": None, "new": "Dentist"})]


def test_link_needs_two_transactions(client, db, sample_account):
    t = _txn(db, sample_account.id)
    assert client.post("/api/transaction-links", json={"transaction_ids": [t.id, t.id]}).status_code == 422
    assert client.post("/api/transaction-links", json={"transaction_ids": [t.id, 9999]}).status_code == 404


def test_linking_with_a_member_joins_its_group(client, db, sample_account):
    a, b, c, d = (_txn(db, sample_account.id, p) for p in "ABCD")
    first = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id], "name": "Trip"}).json()
    second = client.post("/api/transaction-links", json={"transaction_ids": [c.id, d.id]}).json()

    merged = client.post("/api/transaction-links", json={"transaction_ids": [b.id, c.id]}).json()
    assert merged["id"] == first["id"]
    assert merged["name"] == "Trip"
    assert sorted(t["payee"] for t in merged["transactions"]) == ["A", "B", "C", "D"]
    assert db.get(TransactionLink, second["id"]) is None
    assert _link_changes(db, d.id)[-1] == ("link", {"old": f"#{second['id']}", "new": "Trip"})


def test_unlink_dissolves_a_group_left_with_one(client, db, sample_account):
    a, b, c = (_txn(db, sample_account.id, p) for p in "ABC")
    group = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id, c.id]}).json()

    res = client.post(f"/api/transaction-links/{group['id']}/unlink", json={"transaction_ids": [c.id]})
    assert [t["payee"] for t in res.json()["transactions"]] == ["A", "B"]

    res = client.post(f"/api/transaction-links/{group['id']}/unlink", json={"transaction_ids": [b.id]})
    assert res.status_code == 200
    assert res.json() is None
    db.expire_all()
    assert db.get(TransactionLink, group["id"]) is None
    assert db.get(Transaction, a.id).link_id is None


def test_rename_and_delete(client, db, sample_account):
    a, b = (_txn(db, sample_account.id, p) for p in "AB")
    group = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id]}).json()
    assert client.put(f"/api/transaction-links/{group['id']}", json={"name": "Transfer"}).json()["name"] == "Transfer"
    assert client.put(f"/api/transaction-links/{group['id']}", json={"name": "  "}).json()["name"] is None

    assert client.delete(f"/api/transaction-links/{group['id']}").status_code == 204
    db.expire_all()
    assert db.get(Transaction, a.id).link_id is None
    assert db.query(TransactionLink).count() == 0
    assert client.get(f"/api/transaction-links/{group['id']}").status_code == 404


def test_deleting_a_member_prunes_a_group_of_two(client, db, sample_account):
    a, b = (_txn(db, sample_account.id, p) for p in "AB")
    group = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id]}).json()

    assert client.delete(f"/api/transactions/{a.id}").status_code == 204
    db.expire_all()
    assert db.get(TransactionLink, group["id"]) is None
    assert db.get(Transaction, b.id).link_id is None


def test_bulk_delete_prunes_groups(client, db, sample_account):
    a, b, c = (_txn(db, sample_account.id, p) for p in "ABC")
    group = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id, c.id]}).json()

    res = client.request("DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": [a.id]})
    assert res.status_code == 200, res.text
    db.expire_all()
    assert db.get(TransactionLink, group["id"]) is not None

    client.request("DELETE", "/api/transactions/bulk-delete", json={"transaction_ids": [b.id]})
    db.expire_all()
    assert db.get(TransactionLink, group["id"]) is None
    assert db.get(Transaction, c.id).link_id is None


def test_linked_condition_in_search(client, db, sample_account):
    a, b, c = (_txn(db, sample_account.id, p) for p in "ABC")
    client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id]})

    def payees(value):
        res = client.post("/api/transactions/search", json={
            "conditions": [{"field": "linked", "operator": "eq", "value": value}],
        })
        assert res.status_code == 200, res.text
        return sorted(t["payee"] for t in res.json()["items"])

    assert payees(True) == ["A", "B"]
    assert payees(False) == ["C"]


def test_rules_refuse_the_linked_condition(client, db):
    res = client.post("/api/rules", json={
        "name": "Linked",
        "conditions": [{"field": "linked", "operator": "eq", "value": True}],
        "actions": {"reconciled": True},
    })
    assert res.status_code == 422


def test_backup_round_trip_keeps_links(client, db, sample_account, sample_user):
    a = _txn(db, sample_account.id, "A", user_id=sample_user.id)
    b = _txn(db, sample_account.id, "B", user_id=sample_user.id)
    group = client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id], "name": "Transfer"}).json()

    exported = client.get("/api/backup/export")
    payload = _unzip_payload(exported.content)
    assert [l["name"] for l in payload["transaction_links"]] == ["Transfer"]

    restored = _post_import(client, exported.content, mode="overwrite")
    assert restored.status_code == 200, restored.text
    assert restored.json()["transaction_links"] == 1
    db.expire_all()
    assert db.get(Transaction, a.id).link_id == group["id"]

    partial = _post_import(client, exported.content, mode="partial")
    assert partial.status_code == 200, partial.text
    assert partial.json()["transaction_links"] == 1
    assert db.query(TransactionLink).count() == 2
    new_ids = {t.link_id for t in db.query(Transaction).filter(Transaction.id > b.id).all()}
    assert len(new_ids) == 1 and group["id"] not in new_ids


def test_history_lists_a_link_as_one_entry(client, db, sample_account):
    a, b, c = (_txn(db, sample_account.id, p) for p in "ABC")
    client.post("/api/transaction-links", json={"transaction_ids": [a.id, b.id, c.id], "name": "Transfer"})

    res = client.get("/api/history", params={"source": "link"})
    assert res.status_code == 200, res.text
    entries = res.json()["items"]
    assert len(entries) == 1
    assert entries[0]["count"] == 3
    assert entries[0]["changes"] == {"link": {"new": "Transfer"}}
