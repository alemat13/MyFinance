import io
import json
import zipfile
from datetime import date, datetime

from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight, AccountSplitWeight, TransactionSplit, TransactionHistory,
    BankConnection, BankAccountLink, OneDriveBackupSettings,
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
        "account_split_weights": [],
        "transactions": [],
        "transaction_splits": [],
        "transaction_history": [],
    }
    payload.update(overrides)
    return payload


def _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2):
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    db.add(CategorySplit(category_id=sample_category.id, user_id=sample_user.id, weight=50))
    db.add(CategorySplit(category_id=sample_category.id, user_id=sample_user2.id, weight=50))
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    db.add(AccountSplitWeight(account_id=sample_account.id, user_id=sample_user.id, weight=1))
    transaction = Transaction(
        date=date(2026, 1, 15), payee="Payee", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(transaction)
    db.flush()
    db.add(TransactionSplit(transaction_id=transaction.id, user_id=sample_user.id, weight=1, share_amount=100.0, source="custom"))
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
    assert len(data["account_split_weights"]) == 1
    assert [t["id"] for t in data["transactions"]] == [transaction.id]
    assert data["transactions"][0]["reconciled"] is False
    assert len(data["transaction_splits"]) == 1
    assert len(data["transaction_history"]) == 1


def test_export_import_round_trip_preserves_reconciled(client, db, sample_account, sample_category, sample_user, sample_user2):
    transaction = _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)
    db.query(Transaction).filter(Transaction.id == transaction.id).update({"reconciled": True})
    db.commit()

    export_response = client.get("/api/backup/export")
    data = _unzip_payload(export_response.content)
    assert data["transactions"][0]["reconciled"] is True

    response = _post_import(client, export_response.content, mode="overwrite")
    assert response.status_code == 200

    restored = client.get(f"/api/transactions/{transaction.id}").json()
    assert restored["reconciled"] is True


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
    assert summary["account_split_weights"] == 1

    users = client.get("/api/users").json()
    assert {u["id"] for u in users} == {sample_user.id, sample_user2.id}

    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["id"] == sample_account.id
    assert len(accounts[0]["users"]) == 1
    assert len(accounts[0]["split_weights"]) == 1

    transactions = client.post("/api/transactions/search", json={"unpaginated": True}).json()["items"]
    assert len(transactions) == 1
    assert transactions[0]["id"] == original_payload["transactions"][0]["id"]
    assert len(transactions[0]["splits"]) == 1

    history = client.get(f"/api/transactions/{transactions[0]['id']}/history").json()
    assert len(history) == 1


def test_import_overwrite_with_uncategorized_transaction_succeeds(client, db, sample_account, sample_user):
    transaction = Transaction(
        date=date(2026, 1, 15), payee="Uncategorized Payee", amount=42.0,
        account_id=sample_account.id, category_id=None,
    )
    db.add(transaction)
    db.commit()

    export_response = client.get("/api/backup/export")
    payload = _unzip_payload(export_response.content)
    assert payload["transactions"][0]["category_id"] is None
    zip_bytes = export_response.content

    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 200

    transactions = client.post("/api/transactions/search", json={"unpaginated": True}).json()["items"]
    assert len(transactions) == 1
    assert transactions[0]["category_id"] is None


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


def test_export_includes_category_parent_id(client, db, sample_category):
    child = Category(name="Child", type=sample_category.type, parent_id=sample_category.id)
    db.add(child)
    db.commit()

    response = client.get("/api/backup/export")
    data = _unzip_payload(response.content)
    by_name = {c["name"]: c for c in data["categories"]}
    assert by_name["Child"]["parent_id"] == sample_category.id
    assert by_name[sample_category.name]["parent_id"] is None


def test_import_overwrite_invalidates_balances_cache(client, db, sample_account, sample_category, sample_user, sample_user2):
    _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)

    warm = client.get("/api/balances")
    warm_balances = {b["user_id"]: b["net_position"] for b in warm.json()}
    assert warm_balances[sample_user.id] == 0.0  # share 100 - paid (100% of 100) = 0

    export_response = client.get("/api/backup/export")
    payload = _unzip_payload(export_response.content)
    payload["transaction_splits"][0]["share_amount"] = 40.0
    zip_bytes = _zip_payload(payload)

    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 200

    after = client.get("/api/balances")
    balances = {b["user_id"]: b["net_position"] for b in after.json()}
    assert balances[sample_user.id] == -60.0  # share 40 - paid 100 = -60, not the stale 0.0


def test_import_overwrite_reorders_out_of_order_category_hierarchy(client):
    # Child listed before its parent in the payload - import must still
    # succeed, since categories are inserted top-level-first regardless of
    # payload order (parent_id is a self-referential FK, checked immediately).
    payload = _minimal_payload(
        categories=[
            {"id": 2, "name": "Rent", "type": "Expense", "color": None, "icon": None, "parent_id": 1},
            {"id": 1, "name": "Housing", "type": "Expense", "color": None, "icon": None, "parent_id": None},
        ],
    )
    zip_bytes = _zip_payload(payload)
    response = _post_import(client, zip_bytes, mode="overwrite")
    assert response.status_code == 200

    categories = client.get("/api/categories").json()
    by_name = {c["name"]: c for c in categories}
    assert by_name["Rent"]["parent_id"] == by_name["Housing"]["id"]


def test_import_overwrite_dangling_category_parent_returns_422(client):
    payload = _minimal_payload(
        categories=[{
            "id": 1, "name": "Rent", "type": "Expense", "color": None, "icon": None, "parent_id": 999999,
        }],
    )
    zip_bytes = _zip_payload(payload)
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

    # Existing data must be untouched since validation runs before any write.
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 1
    assert accounts[0]["id"] == sample_account.id


def test_round_trip_preserves_the_raw_fields(client, db, sample_account, sample_user):
    """A restore that dropped these would silently undo a backfill nothing
    else can redo — the Linxo export is a one-off file, not a feed."""
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    transaction = Transaction(
        date=date(2026, 1, 15), payee="Courses", amount=-42.50,
        account_id=sample_account.id,
        raw_source="linxo_export",
        raw_label="CB CARREFOURMARKET 14/01 PARIS 75 CB N° XXXX",
        raw_counterparty="CARREFOURMARKET",
        raw_transaction_code="PointOfSale",
        raw_merchant_location="PARIS 75 FR",
        raw_initiated_date=date(2026, 1, 14),
        raw_booking_date=date(2026, 1, 16),
    )
    db.add(transaction)
    db.commit()

    exported = _unzip_payload(client.get("/api/backup/export").content)
    assert exported["transactions"][0]["raw_label"] == "CB CARREFOURMARKET 14/01 PARIS 75 CB N° XXXX"

    assert _post_import(client, _zip_payload(exported)).status_code == 200
    db.expire_all()
    restored = db.query(Transaction).one()
    assert restored.raw_source == "linxo_export"
    assert restored.raw_label == "CB CARREFOURMARKET 14/01 PARIS 75 CB N° XXXX"
    assert restored.raw_counterparty == "CARREFOURMARKET"
    assert restored.raw_transaction_code == "PointOfSale"
    assert restored.raw_merchant_location == "PARIS 75 FR"
    assert restored.raw_initiated_date == date(2026, 1, 14)
    assert restored.raw_booking_date == date(2026, 1, 16)


def test_archive_written_before_the_raw_fields_existed_still_imports(client, sample_account):
    """Older archives have no raw_* keys at all — they must still validate."""
    payload = _minimal_payload(
        accounts=[{
            "id": sample_account.id, "name": sample_account.name, "type": sample_account.type,
            "balance": 0.0, "currency": "EUR", "archived": False,
            "created_at": datetime.utcnow().isoformat(),
        }],
        transactions=[{
            "id": 1, "date": "2026-01-15", "payee": "Ancienne archive", "memo": None,
            "amount": -10.0, "account_id": sample_account.id, "category_id": None,
            "created_at": datetime.utcnow().isoformat(),
        }],
    )
    assert _post_import(client, _zip_payload(payload)).status_code == 200


def _seed_bank_connection(db, account):
    connection = BankConnection(
        aspsp_name="CCF", aspsp_country="FR", state="nonce", session_id="sess-1",
        status="linked", access_valid_until=datetime(2026, 12, 20),
    )
    db.add(connection)
    db.flush()
    db.add(BankAccountLink(
        connection_id=connection.id, remote_account_uid="uid-1", iban="FR7600000000000000000000000",
        remote_name="Compte joint", currency="EUR", account_id=account.id,
        sync_from_date=date(2026, 9, 20), last_imported_count=12,
    ))
    db.add(BankAccountLink(connection_id=connection.id, remote_account_uid="uid-2"))
    db.commit()
    return connection


def test_round_trip_preserves_bank_connections_and_links(client, db, sample_account):
    """Losing these means granting the PSD2 consent again at every bank."""
    _seed_bank_connection(db, sample_account)

    exported = _unzip_payload(client.get("/api/backup/export").content)
    assert [c["session_id"] for c in exported["bank_connections"]] == ["sess-1"]
    assert len(exported["bank_account_links"]) == 2

    response = _post_import(client, _zip_payload(exported))
    assert response.status_code == 200
    assert response.json()["bank_connections"] == 1
    assert response.json()["bank_account_links"] == 2

    db.expire_all()
    connection = db.query(BankConnection).one()
    assert (connection.aspsp_name, connection.session_id, connection.status) == ("CCF", "sess-1", "linked")
    links = {l.remote_account_uid: l for l in db.query(BankAccountLink).all()}
    assert links["uid-1"].account_id == sample_account.id
    assert links["uid-1"].sync_from_date == date(2026, 9, 20)
    assert links["uid-1"].last_imported_count == 12
    assert links["uid-2"].account_id is None


def test_archive_without_bank_sections_leaves_no_bank_connected(client, db, sample_account):
    """An archive written before bank sync was exported keeps today's
    behaviour: an overwrite restore clears the connections."""
    _seed_bank_connection(db, sample_account)
    assert _post_import(client, _zip_payload(_minimal_payload())).status_code == 200
    db.expire_all()
    assert db.query(BankConnection).count() == 0
    assert db.query(BankAccountLink).count() == 0


def test_import_overwrite_dangling_bank_link_returns_422(client):
    payload = _minimal_payload(
        bank_connections=[],
        bank_account_links=[{"id": 1, "connection_id": 99, "remote_account_uid": "uid-1"}],
    )
    response = _post_import(client, _zip_payload(payload))
    assert response.status_code == 422


def test_import_overwrite_keeps_the_onedrive_connection(client, db):
    """Never in an archive, and never wiped by a restore either."""
    db.add(OneDriveBackupSettings(
        id=1, connected=True, account_email="alex@example.com", folder_path="/MyFinance Backups",
        refresh_token_encrypted="encrypted-token",
    ))
    db.commit()

    exported = _unzip_payload(client.get("/api/backup/export").content)
    assert "onedrive" not in json.dumps(exported).lower()
    assert "encrypted-token" not in json.dumps(exported)

    assert _post_import(client, _zip_payload(exported)).status_code == 200
    db.expire_all()
    settings = db.query(OneDriveBackupSettings).one()
    assert settings.connected is True
    assert settings.folder_path == "/MyFinance Backups"
    assert settings.refresh_token_encrypted == "encrypted-token"


# ── Partial restore (admin mode) ──────────────────────────────────────

def _now() -> str:
    return datetime.utcnow().isoformat()


def test_partial_restore_recreates_rows_under_new_ids(client, db, sample_account, sample_category, sample_user):
    payload = _minimal_payload(
        users=[{"id": 900, "name": "Ignored", "email": None, "created_at": _now()}],
        accounts=[{
            "id": sample_account.id, "name": "Restored Account", "type": "Checking", "balance": 30.0,
            "currency": "EUR", "created_at": _now(),
        }],
        categories=[
            {"id": 70, "name": "Restored Child", "type": "Expense", "color": None, "icon": None, "parent_id": 71},
            {"id": 71, "name": "Restored Parent", "type": "Expense", "color": None, "icon": None, "parent_id": None},
        ],
        account_users=[{"account_id": sample_account.id, "user_id": sample_user.id, "ownership_percentage": 100.0}],
        account_split_weights=[{"account_id": sample_account.id, "user_id": sample_user.id, "weight": 3}],
        category_splits=[{"category_id": 70, "user_id": sample_user.id, "weight": 2}],
        transactions=[
            {"id": 1, "date": "2026-01-15", "payee": "Anchor", "amount": 20.0,
             "account_id": sample_account.id, "category_id": 70, "divide_group_id": 1, "created_at": _now()},
            {"id": 2, "date": "2026-01-16", "payee": "Part", "amount": 10.0,
             "account_id": sample_account.id, "category_id": None, "divide_group_id": 1, "created_at": _now()},
        ],
        transaction_splits=[
            {"transaction_id": 1, "user_id": sample_user.id, "weight": 1, "share_amount": 20.0, "source": "custom"},
            {"transaction_id": 2, "user_id": sample_user.id, "weight": 1, "share_amount": 10.0, "source": "custom"},
        ],
        transaction_history=[
            {"id": 5, "transaction_id": 1, "action": "created", "source": "manual", "changed_at": _now(),
             "changed_by_user_id": 900, "date": "2026-01-15", "payee": "Anchor", "amount": 20.0,
             "account_id": sample_account.id, "category_id": 70},
            {"id": 6, "transaction_id": 99, "action": "deleted", "changed_at": _now()},
        ],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 200, response.text
    summary = response.json()
    assert summary["mode"] == "partial"
    assert summary["users"] == 0
    assert summary["transactions"] == 2
    assert summary["transaction_history"] == 1

    assert {u.name for u in db.query(User).all()} == {sample_user.name}
    restored_account = db.query(Account).filter_by(name="Restored Account").one()
    assert restored_account.id != sample_account.id
    accounts = {a["name"]: a for a in client.get("/api/accounts").json()}
    assert accounts["Restored Account"]["balance"] == 30.0
    assert sample_account.name in accounts

    parent = db.query(Category).filter_by(name="Restored Parent").one()
    child = db.query(Category).filter_by(name="Restored Child").one()
    assert child.parent_id == parent.id

    anchor = db.query(Transaction).filter_by(payee="Anchor").one()
    part = db.query(Transaction).filter_by(payee="Part").one()
    assert anchor.account_id == restored_account.id
    assert anchor.category_id == child.id
    assert anchor.divide_group_id == anchor.id
    assert part.divide_group_id == anchor.id
    assert [s.user_id for s in anchor.splits] == [sample_user.id]

    assert db.query(AccountUser).filter_by(account_id=restored_account.id).one().user_id == sample_user.id
    assert db.query(AccountSplitWeight).filter_by(account_id=restored_account.id).one().weight == 3
    assert db.query(CategorySplit).filter_by(category_id=child.id).one().weight == 2

    history = db.query(TransactionHistory).filter_by(transaction_id=anchor.id).one()
    assert history.account_id == restored_account.id
    assert history.category_id == child.id
    assert history.changed_by_user_id is None  # user 900 isn't in this database


def test_partial_restore_falls_back_to_existing_rows(client, db, sample_account, sample_category, sample_user):
    payload = _minimal_payload(
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Onto existing", "amount": -5.0,
                       "account_id": sample_account.id, "category_id": sample_category.id, "created_at": _now()}],
        transaction_splits=[{"transaction_id": 1, "user_id": sample_user.id, "weight": 1,
                             "share_amount": -5.0, "source": "custom"}],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 200, response.text
    restored = db.query(Transaction).filter_by(payee="Onto existing").one()
    assert restored.account_id == sample_account.id
    assert restored.category_id == sample_category.id


def test_partial_restore_with_unknown_account_restores_nothing(client, db, sample_account, sample_user):
    payload = _minimal_payload(
        accounts=[{"id": 800, "name": "Would be created", "type": "Checking", "balance": 0.0,
                   "currency": "EUR", "created_at": _now()}],
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Orphan", "amount": -5.0,
                       "account_id": 12345, "category_id": None, "created_at": _now()}],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 422
    assert "12345" in response.json()["detail"]
    assert db.query(Account).filter_by(name="Would be created").count() == 0
    assert db.query(Transaction).filter_by(payee="Orphan").count() == 0


def test_partial_restore_with_unknown_split_user_restores_nothing(client, db, sample_account):
    payload = _minimal_payload(
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Unknown user", "amount": -5.0,
                       "account_id": sample_account.id, "category_id": None, "created_at": _now()}],
        transaction_splits=[{"transaction_id": 1, "user_id": 4242, "weight": 1,
                             "share_amount": -5.0, "source": "custom"}],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 422
    assert db.query(Transaction).filter_by(payee="Unknown user").count() == 0


def test_partial_restore_refuses_a_bank_id_already_on_the_account(client, db, sample_account):
    db.add(Transaction(date=date(2026, 2, 1), payee="Synced", amount=-5.0,
                       account_id=sample_account.id, external_id="bank-1"))
    db.commit()
    payload = _minimal_payload(
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Same bank row", "amount": -5.0,
                       "account_id": sample_account.id, "category_id": None, "external_id": "bank-1",
                       "created_at": _now()}],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 422
    assert db.query(Transaction).filter_by(payee="Same bank row").count() == 0


def test_partial_restore_invalidates_balances_cache(client, db, sample_account, sample_user):
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    db.commit()
    assert client.get("/api/balances").status_code == 200

    payload = _minimal_payload(
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Shared", "amount": 50.0,
                       "account_id": sample_account.id, "category_id": None, "created_at": _now()}],
        transaction_splits=[{"transaction_id": 1, "user_id": sample_user.id, "weight": 1,
                             "share_amount": 20.0, "source": "custom"}],
    )
    assert _post_import(client, _zip_payload(payload), mode="partial").status_code == 200
    balances = {b["user_id"]: b["net_position"] for b in client.get("/api/balances").json()}
    assert balances[sample_user.id] == -30.0  # share 20 - paid 50


def test_partial_restore_reuses_a_category_of_the_same_name(client, db, sample_account, sample_category, sample_user):
    db.add(CategorySplit(category_id=sample_category.id, user_id=sample_user.id, weight=1))
    db.commit()
    payload = _minimal_payload(
        categories=[{"id": 300, "name": sample_category.name, "type": sample_category.type,
                     "color": None, "icon": None, "parent_id": None}],
        category_splits=[{"category_id": 300, "user_id": sample_user.id, "weight": 9}],
        transactions=[{"id": 1, "date": "2026-02-01", "payee": "Same name", "amount": -5.0,
                       "account_id": sample_account.id, "category_id": 300, "created_at": _now()}],
    )
    response = _post_import(client, _zip_payload(payload), mode="partial")
    assert response.status_code == 200, response.text
    assert response.json()["categories"] == 0
    assert db.query(Category).filter_by(name=sample_category.name).count() == 1
    assert db.query(Transaction).filter_by(payee="Same name").one().category_id == sample_category.id
    assert db.query(CategorySplit).filter_by(category_id=sample_category.id).one().weight == 1


def test_partial_restore_of_a_full_export_appends_a_second_copy(client, db, sample_account, sample_category, sample_user, sample_user2):
    _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)
    export = client.get("/api/backup/export").content

    response = _post_import(client, export, mode="partial")
    assert response.status_code == 200, response.text
    assert db.query(Account).filter_by(name=sample_account.name).count() == 2
    assert db.query(Category).count() == 1
    assert db.query(Transaction).count() == 2


def test_import_overwrite_failing_mid_restore_keeps_the_existing_data(
    client, db, sample_account, sample_category, sample_user, sample_user2,
):
    """An archive that passes the reference checks but fails on insert (here
    a duplicate user id) must roll the whole restore back, wipe included —
    not leave the database empty."""
    transaction = _seed_full_graph(db, sample_account, sample_category, sample_user, sample_user2)
    payload = _unzip_payload(client.get("/api/backup/export").content)
    payload["users"].append(dict(payload["users"][0], name="Duplicate id"))

    response = _post_import(client, _zip_payload(payload), mode="overwrite")
    assert response.status_code == 409

    db.expire_all()
    assert db.query(User).count() == 2
    assert db.query(Account).count() == 1
    assert db.query(Category).count() == 1
    assert db.query(Transaction).one().id == transaction.id
    assert db.query(TransactionSplit).count() == 1
    assert db.query(TransactionHistory).count() == 1
    assert db.query(AccountUser).count() == 1


def test_import_oversized_upload_returns_413(client, monkeypatch):
    import routers.backup as backup_router
    monkeypatch.setattr(backup_router, "MAX_BACKUP_UPLOAD_BYTES", 10)
    response = client.post(
        "/api/backup/import",
        files={"file": ("backup.zip", b"x" * 11, "application/zip")},
    )
    assert response.status_code == 413


def test_import_refuses_an_archive_too_large_once_decompressed(client, monkeypatch):
    monkeypatch.setattr(backup, "MAX_DECOMPRESSED_BYTES", 100)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(backup.ZIP_ENTRY_NAME, " " * 1000)
    response = client.post(
        "/api/backup/import",
        files={"file": ("backup.zip", buf.getvalue(), "application/zip")},
    )
    assert response.status_code == 422
    assert "decompressed" in response.json()["detail"]
