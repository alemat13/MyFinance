import io
import json
import zipfile
from datetime import date, datetime

from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight, TransactionSplit, TransactionHistory,
)
import backup


def _zip_payload(payload: dict) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(backup.ZIP_ENTRY_NAME, json.dumps(payload))
    return buffer.getvalue()


def _unzip_payload(content: bytes) -> dict:
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        return json.loads(zf.read(backup.ZIP_ENTRY_NAME))


def _post_import(client, zip_bytes: bytes, mode: str = "overwrite"):
    return client.post(
        "/api/backup/import",
        params={"mode": mode},
        files={"file": ("backup.zip", zip_bytes, "application/zip")},
    )


def _minimal_payload(schema_version: int = 1, **overrides) -> dict:
    payload = {
        "schema_version": schema_version,
        "exported_at": datetime.utcnow().isoformat(),
        "users": [],
        "accounts": [],
        "categories": [],
        "account_users": [],
        "category_splits": [],
        "global_split_weights": [],
        "transactions": [],
        "transaction_splits": [],
        "transaction_history": [],
    }
    payload.update(overrides)
    return payload


def _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2):
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    db.add(CategorySplit(category_id=sample_category.id, user_id=sample_user.id, split_percentage=50.0))
    db.add(CategorySplit(category_id=sample_category.id, user_id=sample_user2.id, split_percentage=50.0))
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1.0))
    transaction = Transaction(
        date=date(2026, 1, 15), payee="Payee", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(transaction)
    db.flush()
    db.add(TransactionSplit(transaction_id=transaction.id, user_id=sample_user.id, share_amount=100.0, source="manual"))
    db.add(TransactionHistory(
        transaction_id=transaction.id, action="created", source="manual",
        changed_at=datetime.utcnow(), changed_by_user_id=sample_user.id,
        date=transaction.date, payee=transaction.payee, memo=None,
        amount=transaction.amount, account_id=transaction.account_id, category_id=transaction.category_id,
    ))
    db.commit()
    return transaction


def test_export_empty(client):
    response = client.get("/api/backup/export")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    data = _unzip_payload(response.content)
    assert data["schema_version"] == 1
    assert data["users"] == []
    assert data["accounts"] == []


def test_export_with_data(client, db, sample_account, sample_category, sample_user, sample_user2):
    transaction = _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)

    response = client.get("/api/backup/export")
    assert response.status_code == 200
    data = _unzip_payload(response.content)

    assert {u["id"] for u in data["users"]} == {sample_user.id, sample_user2.id}
    assert [a["id"] for a in data["accounts"]] == [sample_account.id]
    assert [c["id"] for c in data["categories"]] == [sample_category.id]
    assert len(data["account_users"]) == 1
    assert len(data["category_splits"]) == 2
    assert len(data["global_split_weights"]) == 1
    assert [t["id"] for t in data["transactions"]] == [transaction.id]
    assert len(data["transaction_splits"]) == 1
    assert len(data["transaction_history"]) == 1


def test_import_overwrite_replaces_data(client, db, sample_account, sample_category, sample_user, sample_user2):
    _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)
    export_response = client.get("/api/backup/export")
    original_payload = _unzip_payload(export_response.content)
    zip_bytes = export_response.content

    # Mutate the DB so overwrite has something different to replace.
    client.post("/api/users", json={"name": "Extra User"})

    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 200
    summary = response.json()
    assert summary["mode"] == "overwrite"
    assert summary["users"] == 2
    assert summary["transactions"] == 1

    users = client.get("/api/users").json()
    assert {u["id"] for u in users} == {sample_user.id, sample_user2.id}

    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["id"] == sample_account.id
    assert len(accounts[0]["users"]) == 1

    transactions = client.get("/api/transactions").json()
    assert len(transactions) == 1
    assert transactions[0]["id"] == original_payload["transactions"][0]["id"]
    assert len(transactions[0]["splits"]) == 1

    history = client.get(f"/api/transactions/{transactions[0]['id']}/history").json()
    assert len(history) == 1


def test_import_append_combines_with_existing(client, sample_account, sample_category):
    # Existing data already present via fixtures (ids 1). Append payload uses
    # disjoint ids so no collision occurs.
    payload = _minimal_payload(
        users=[{"id": 501, "name": "Appended User", "email": None, "created_at": datetime.utcnow().isoformat()}],
        accounts=[{
            "id": 502, "name": "Appended Account", "type": "Checking", "balance": 0.0,
            "currency": "EUR", "created_at": datetime.utcnow().isoformat(),
        }],
    )
    zip_bytes = _zip_payload(payload)

    response = _post_import(client, zip_bytes, mode="append")
    assert response.status_code == 200
    summary = response.json()
    assert summary["mode"] == "append"
    assert summary["users"] == 1
    assert summary["accounts"] == 1

    users = client.get("/api/users").json()
    accounts = client.get("/api/accounts").json()
    assert {u["id"] for u in users} == {501}
    assert {a["id"] for a in accounts} == {sample_account.id, 502}


def test_import_append_id_collision_returns_409(client, sample_user):
    payload = _minimal_payload(
        users=[{"id": sample_user.id, "name": "Duplicate", "email": None, "created_at": datetime.utcnow().isoformat()}],
    )
    zip_bytes = _zip_payload(payload)

    response = _post_import(client, zip_bytes, mode="append")
    assert response.status_code == 409


def test_import_malformed_zip_returns_422(client):
    response = client.post(
        "/api/backup/import",
        params={"mode": "overwrite"},
        files={"file": ("backup.zip", b"not a zip file", "application/zip")},
    )
    assert response.status_code == 422


def test_import_wrong_schema_version_returns_422(client):
    zip_bytes = _zip_payload(_minimal_payload(schema_version=999))
    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 422


def test_import_overwrite_dangling_fk_returns_422_without_wiping_data(client, sample_account):
    payload = _minimal_payload(
        transactions=[{
            "id": 1, "date": "2026-01-01", "payee": "Bad", "memo": None, "amount": 1.0,
            "account_id": 999999, "category_id": 999999,
            "created_at": datetime.utcnow().isoformat(),
        }],
    )
    zip_bytes = _zip_payload(payload)

    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 422

    # Existing data must be untouched since validation runs before drop_all().
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["id"] == sample_account.id
