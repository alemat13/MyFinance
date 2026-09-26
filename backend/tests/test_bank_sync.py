from datetime import date, datetime, timedelta, timezone

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

import enable_banking
from models import (
    Account,
    BankAccountLink,
    BankConnection,
    GlobalSplitWeight,
    Transaction,
    TransactionHistory,
    TransactionSplit,
)


def _generate_private_key_pem() -> str:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()


@pytest.fixture(autouse=True)
def bank_sync_env(monkeypatch):
    monkeypatch.setenv("ENABLE_BANKING_APPLICATION_ID", "test-application-id")
    monkeypatch.setenv("ENABLE_BANKING_PRIVATE_KEY", _generate_private_key_pem())
    monkeypatch.setenv("ENABLE_BANKING_REDIRECT_URL", "http://localhost:8000/api/bank-sync/callback")
    monkeypatch.setenv("BANK_SYNC_SCHEDULER_SECRET", "test-scheduler-secret")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:5173")


@pytest.fixture()
def global_weights(db, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=1))
    db.commit()
    return sample_user


@pytest.fixture()
def linked_connection(db, sample_account):
    connection = BankConnection(
        aspsp_name="BoursoBank", aspsp_country="FR", state="state-1",
        session_id="session-1", status="linked",
        access_valid_until=datetime(2026, 12, 1),
    )
    db.add(connection)
    db.flush()
    link = BankAccountLink(
        connection_id=connection.id,
        remote_account_uid="remote-uid-1",
        iban="FR7612345678901234567890123",
        remote_name="Compte Courant",
        currency="EUR",
        account_id=sample_account.id,
        sync_enabled=True,
        sync_from_date=date(2026, 1, 1),
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


def _booked(amount: str, indicator: str, booking_date: str, **extra) -> dict:
    row = {
        "transaction_amount": {"amount": amount, "currency": "EUR"},
        "credit_debit_indicator": indicator,
        "status": "BOOK",
        "booking_date": booking_date,
    }
    row.update(extra)
    return row


# ── JWT / configuration ───────────────────────────────────────────────

def test_build_jwt_carries_application_id_as_kid():
    import jwt

    token = enable_banking.build_jwt()
    header = jwt.get_unverified_header(token)
    assert header["kid"] == "test-application-id"
    assert header["alg"] == "RS256"
    claims = jwt.decode(token, options={"verify_signature": False}, audience=enable_banking.JWT_AUDIENCE)
    assert claims["iss"] == enable_banking.JWT_ISSUER
    assert claims["exp"] > claims["iat"]


def test_build_jwt_without_key_raises(monkeypatch):
    monkeypatch.delenv("ENABLE_BANKING_PRIVATE_KEY")
    with pytest.raises(enable_banking.EnableBankingError):
        enable_banking.build_jwt()


def test_private_key_accepts_escaped_newlines(monkeypatch):
    pem = _generate_private_key_pem()
    monkeypatch.setenv("ENABLE_BANKING_PRIVATE_KEY", pem.replace("\n", "\\n"))
    assert enable_banking.build_jwt()


# ── Normalising bank payloads ─────────────────────────────────────────

def test_debit_becomes_negative_and_credit_positive():
    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a"),
        _booked("1200.00", "CRDT", "2026-03-05", entry_reference="b"),
    ])
    assert [r["amount"] for r in rows] == [-42.50, 1200.00]


def test_payee_prefers_counterparty_then_remittance():
    rows = enable_banking.normalize_transactions([
        _booked("10.00", "DBIT", "2026-03-04", entry_reference="a", creditor={"name": "Carrefour"}),
        _booked("20.00", "CRDT", "2026-03-04", entry_reference="b", debtor={"name": "Employeur"}),
        _booked("30.00", "DBIT", "2026-03-04", entry_reference="c", remittance_information=["VIR SEPA LOYER"]),
        _booked("40.00", "DBIT", "2026-03-04", entry_reference="d"),
    ])
    assert [r["payee"] for r in rows] == ["Carrefour", "Employeur", "VIR SEPA LOYER", "Unknown"]
    assert rows[2]["memo"] == "VIR SEPA LOYER"


def test_card_prefix_is_stripped_from_payee_only():
    rows = enable_banking.normalize_transactions([
        _booked("55.98", "DBIT", "2026-09-19", entry_reference="a",
                remittance_information=["CARTE 18/09 IGP PELLEPORT"]),
        _booked("0.58", "DBIT", "2026-09-22", entry_reference="b",
                remittance_information=["CARTE 21/09/26 NYX*NESHUEVO"]),
        _booked("9.00", "DBIT", "2026-09-22", entry_reference="c",
                remittance_information=["CARTE 21/09/2026 JOE AND JOE"]),
    ])
    assert [r["payee"] for r in rows] == ["IGP PELLEPORT", "NYX*NESHUEVO", "JOE AND JOE"]
    full = ["CARTE 18/09 IGP PELLEPORT", "CARTE 21/09/26 NYX*NESHUEVO", "CARTE 21/09/2026 JOE AND JOE"]
    assert [r["memo"] for r in rows] == full
    assert [r["raw_label"] for r in rows] == full


def test_card_number_suffix_is_stripped_from_payee_only():
    rows = enable_banking.normalize_transactions([
        _booked("22.55", "DBIT", "2026-09-24", entry_reference="a",
                remittance_information=["INTERMARCHE CB*4325"]),
        _booked("6.00", "DBIT", "2026-09-23", entry_reference="b",
                remittance_information=["CARTE 22/09/26 ANTHROPIC CB*4325"]),
    ])
    assert [r["payee"] for r in rows] == ["INTERMARCHE", "ANTHROPIC"]
    assert [r["memo"] for r in rows] == ["INTERMARCHE CB*4325", "CARTE 22/09/26 ANTHROPIC CB*4325"]


def test_label_cleanup_leaves_other_labels_alone():
    assert enable_banking.clean_label("PRLV SEPA PayPal Europe S.a.r.l.") == "PRLV SEPA PayPal Europe S.a.r.l."
    # Only a leading prefix, with a merchant after it.
    assert enable_banking.clean_label("VIR CARTE 18/09 REMBOURSEMENT") == "VIR CARTE 18/09 REMBOURSEMENT"
    assert enable_banking.clean_label("CARTE 18/09") == "CARTE 18/09"
    # Only a trailing card number, never one in the middle of the label.
    assert enable_banking.clean_label("CB*4325 REMBOURSEMENT") == "CB*4325 REMBOURSEMENT"
    assert enable_banking.clean_label("CB*4325") == "CB*4325"
    assert enable_banking.clean_label(None) is None


def test_label_cleanup_does_not_change_the_fingerprint(monkeypatch):
    """Rows without a bank identifier are deduplicated on a fingerprint of the
    payee. It must stay the uncleaned one, or editing the patterns would give
    every row in the overlap window a new external_id and import it twice."""
    raw = [_booked("3.50", "DBIT", "2026-03-04", remittance_information=["CARTE 03/03 CAFE"])]
    with_cleanup = enable_banking.normalize_transactions(raw)
    monkeypatch.setattr(enable_banking, "_LABEL_CLEANUP_PATTERNS", [])
    without_cleanup = enable_banking.normalize_transactions(raw)
    assert with_cleanup[0]["payee"] == "CAFE"
    assert without_cleanup[0]["payee"] == "CARTE 03/03 CAFE"
    assert with_cleanup[0]["external_id"] == without_cleanup[0]["external_id"]


def test_external_id_falls_back_to_transaction_id_then_fingerprint():
    rows = enable_banking.normalize_transactions([
        _booked("10.00", "DBIT", "2026-03-04", entry_reference="entry-1"),
        _booked("10.00", "DBIT", "2026-03-04", transaction_id="txn-1"),
        _booked("10.00", "DBIT", "2026-03-04", creditor={"name": "Carrefour"}),
    ])
    assert rows[0]["external_id"] == "entry-1"
    assert rows[1]["external_id"] == "txn-1"
    assert rows[2]["external_id"].startswith("fp:")


def test_identical_same_day_rows_get_distinct_fingerprints():
    raw = [_booked("3.50", "DBIT", "2026-03-04", creditor={"name": "Cafe"})] * 2
    rows = enable_banking.normalize_transactions(raw)
    assert rows[0]["external_id"] != rows[1]["external_id"]
    # Stable across runs: the same payload yields the same ids again.
    assert [r["external_id"] for r in enable_banking.normalize_transactions(raw)] == \
           [r["external_id"] for r in rows]


def test_rows_without_date_or_direction_are_dropped():
    rows = enable_banking.normalize_transactions([
        {"transaction_amount": {"amount": "5.00"}, "credit_debit_indicator": "DBIT"},
        _booked("5.00", "UNKNOWN", "2026-03-04"),
        _booked("5.00", "DBIT", "2026-03-04", entry_reference="ok"),
    ])
    assert [r["external_id"] for r in rows] == ["ok"]


def test_falls_back_to_value_date_when_booking_date_missing():
    rows = enable_banking.normalize_transactions([
        {
            "transaction_amount": {"amount": "5.00"},
            "credit_debit_indicator": "DBIT",
            "value_date": "2026-03-09",
            "entry_reference": "a",
        },
    ])
    assert rows[0]["date"] == date(2026, 3, 9)


def test_dated_by_transaction_date_when_booked_later():
    # A transfer made on Saturday 19 September, booked on Monday the 21st.
    rows = enable_banking.normalize_transactions([
        _booked("80.00", "DBIT", "2026-09-21", transaction_date="2026-09-19", entry_reference="a"),
    ])
    assert rows[0]["date"] == date(2026, 9, 19)
    assert rows[0]["raw_initiated_date"] == date(2026, 9, 19)
    assert rows[0]["raw_booking_date"] == date(2026, 9, 21)


def test_fingerprint_still_uses_booking_date():
    booked_only = enable_banking.normalize_transactions([_booked("80.00", "DBIT", "2026-09-21")])
    with_initiated = enable_banking.normalize_transactions([
        _booked("80.00", "DBIT", "2026-09-21", transaction_date="2026-09-19"),
    ])
    assert with_initiated[0]["external_id"] == booked_only[0]["external_id"]


# ── Importing ─────────────────────────────────────────────────────────

def test_import_creates_transactions_with_split_and_history(db, linked_connection, global_weights):
    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a", creditor={"name": "Carrefour"}),
    ])
    created = enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    assert created == 1
    transaction = db.query(Transaction).one()
    assert transaction.amount == -42.50
    assert transaction.payee == "Carrefour"
    assert transaction.external_id == "a"
    assert transaction.category_id is None
    split = db.query(TransactionSplit).one()
    assert (split.user_id, split.weight, split.share_amount) == (global_weights.id, 1, -42.50)
    history = db.query(TransactionHistory).one()
    assert (history.action, history.source) == ("created", "bank_sync")


def test_reimporting_the_same_window_creates_nothing(db, linked_connection, global_weights):
    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a"),
        _booked("10.00", "DBIT", "2026-03-05", entry_reference="b"),
    ])
    first = enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))
    second = enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    assert (first, second) == (2, 0)
    assert db.query(Transaction).count() == 2


def test_preexisting_rows_without_external_id_are_not_duplicated(db, linked_connection, global_weights, sample_category):
    # Stands in for the migrated ledger: same day, same amount, different
    # label, and no identifier the bank could ever match.
    db.add(Transaction(
        date=date(2026, 3, 4), payee="CARREFOUR MARKET", amount=-42.50,
        account_id=linked_connection.account_id, category_id=sample_category.id,
    ))
    db.commit()

    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a", creditor={"name": "Carrefour"}),
    ])
    created = enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    assert created == 0
    assert db.query(Transaction).count() == 1


def test_legacy_guard_only_absorbs_as_many_rows_as_exist(db, linked_connection, global_weights):
    db.add(Transaction(
        date=date(2026, 3, 4), payee="CAFE", amount=-3.50,
        account_id=linked_connection.account_id,
    ))
    db.commit()

    rows = enable_banking.normalize_transactions([
        _booked("3.50", "DBIT", "2026-03-04", creditor={"name": "Cafe"}),
        _booked("3.50", "DBIT", "2026-03-04", creditor={"name": "Cafe"}),
    ])
    created = enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    assert created == 1
    assert db.query(Transaction).count() == 2


def test_import_without_any_resolvable_weights_raises(db, linked_connection):
    rows = enable_banking.normalize_transactions([_booked("5.00", "DBIT", "2026-03-04", entry_reference="a")])
    with pytest.raises(enable_banking.EnableBankingError):
        enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))
    assert db.query(Transaction).count() == 0


def test_import_invalidates_aggregate_caches(db, linked_connection, global_weights):
    import cache_service

    cache_service.get_or_compute(db, "balances", {"user_id": global_weights.id}, lambda: [])
    rows = enable_banking.normalize_transactions([_booked("5.00", "DBIT", "2026-03-04", entry_reference="a")])
    enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    from models import AggregateCache
    assert db.query(AggregateCache).count() == 0


# ── Sync window and scheduling ────────────────────────────────────────

def test_first_sync_starts_at_sync_from_date(linked_connection):
    date_from, date_to = enable_banking.sync_window(linked_connection, date(2026, 3, 10))
    assert (date_from, date_to) == (date(2026, 1, 1), date(2026, 3, 10))


def test_first_sync_without_sync_from_date_uses_default_history(linked_connection):
    linked_connection.sync_from_date = None
    date_from, _ = enable_banking.sync_window(linked_connection, date(2026, 3, 10))
    assert date_from == date(2026, 3, 10) - timedelta(days=enable_banking.DEFAULT_INITIAL_HISTORY_DAYS)


def test_later_syncs_reach_back_by_the_overlap(linked_connection):
    linked_connection.last_synced_at = datetime(2026, 3, 9, 8, 0)
    linked_connection.last_sync_status = "success"
    date_from, _ = enable_banking.sync_window(linked_connection, date(2026, 3, 10))
    assert date_from == date(2026, 3, 9) - timedelta(days=enable_banking.SYNC_OVERLAP_DAYS)


def test_sync_window_never_reaches_before_sync_from_date(linked_connection):
    linked_connection.sync_from_date = date(2026, 3, 8)
    linked_connection.last_synced_at = datetime(2026, 3, 9, 8, 0)
    linked_connection.last_sync_status = "success"
    date_from, _ = enable_banking.sync_window(linked_connection, date(2026, 3, 10))
    assert date_from == date(2026, 3, 8)


def test_a_failed_link_still_waits_out_the_interval(linked_connection):
    """Banks cap account calls at 4 a day, so a broken link must not be
    retried on every scheduler tick."""
    linked_connection.last_synced_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    linked_connection.last_sync_status = "failed"
    assert enable_banking.is_sync_due(linked_connection) is False


def test_never_synced_link_is_due(linked_connection):
    assert enable_banking.is_sync_due(linked_connection) is True


def test_unmapped_or_disabled_link_is_never_due(linked_connection):
    linked_connection.account_id = None
    assert enable_banking.is_sync_due(linked_connection) is False
    linked_connection.account_id = 1
    linked_connection.sync_enabled = False
    assert enable_banking.is_sync_due(linked_connection) is False


def test_link_on_an_unlinked_connection_is_never_due(db, linked_connection):
    linked_connection.connection.status = "expired"
    db.commit()
    assert enable_banking.is_sync_due(linked_connection) is False


def test_sync_link_records_failure_instead_of_raising(db, linked_connection, global_weights, monkeypatch):
    def _boom(*args, **kwargs):
        raise enable_banking.EnableBankingError("bank is down")

    monkeypatch.setattr(enable_banking, "fetch_transactions", _boom)
    created = enable_banking.sync_link(db, linked_connection)

    assert created == 0
    assert linked_connection.last_sync_status == "failed"
    assert "bank is down" in linked_connection.last_sync_error
    # Stamped anyway, so the next scheduler tick doesn't burn the bank's quota.
    assert linked_connection.last_synced_at is not None


def test_sync_link_success_records_count(db, linked_connection, global_weights, monkeypatch):
    monkeypatch.setattr(enable_banking, "fetch_transactions", lambda *a, **k: [
        _booked("9.99", "DBIT", "2026-03-04", entry_reference="a"),
    ])
    created = enable_banking.sync_link(db, linked_connection)

    assert created == 1
    assert linked_connection.last_sync_status == "success"
    assert linked_connection.last_imported_count == 1
    assert linked_connection.last_sync_error is None


# ── Routes ────────────────────────────────────────────────────────────

def test_list_connections_hides_pending_ones(client, db, linked_connection):
    db.add(BankConnection(aspsp_name="CCF", aspsp_country="FR", state="state-2", status="pending"))
    db.commit()

    response = client.get("/api/bank-sync/connections")
    assert response.status_code == 200
    data = response.json()
    assert [c["aspsp_name"] for c in data] == ["BoursoBank"]
    assert data[0]["accounts"][0]["iban"] == "FR7612345678901234567890123"
    assert data[0]["accounts"][0]["account_name"] == "Test Checking"


def test_connection_response_never_exposes_the_session_id(client, linked_connection):
    body = client.get("/api/bank-sync/connections").text
    assert "session-1" not in body


def test_create_connection_returns_the_consent_url(client, db, monkeypatch):
    monkeypatch.setattr(enable_banking, "start_authorization", lambda *a, **k: {
        "url": "https://auth.enablebanking.com/ais/start?sessionid=abc",
        "authorization_id": "auth-1",
    })
    response = client.post("/api/bank-sync/connections", json={"aspsp_name": "BoursoBank", "aspsp_country": "FR"})

    assert response.status_code == 200
    assert response.json()["authorization_url"].startswith("https://auth.enablebanking.com/")
    assert db.query(BankConnection).filter(BankConnection.status == "pending").count() == 1


def test_failed_authorization_leaves_no_pending_connection(client, db, monkeypatch):
    def _boom(*args, **kwargs):
        raise enable_banking.EnableBankingError("nope")

    monkeypatch.setattr(enable_banking, "start_authorization", _boom)
    response = client.post("/api/bank-sync/connections", json={"aspsp_name": "BoursoBank"})

    assert response.status_code == 502
    assert db.query(BankConnection).count() == 0


def test_callback_completes_the_connection_and_lists_accounts(client, db, monkeypatch):
    connection = BankConnection(aspsp_name="CCF", aspsp_country="FR", state="state-9", status="pending")
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-9",
        "access": {"valid_until": "2026-12-01T12:00:00Z"},
        "accounts": [{
            "uid": "uid-9", "name": "Compte Joint", "currency": "EUR",
            "account_id": {"iban": "FR761111"},
        }],
    })
    response = client.get("/api/bank-sync/callback?code=the-code&state=state-9", follow_redirects=False)

    assert response.status_code == 307
    assert "bank=connected" in response.headers["location"]
    db.refresh(connection)
    assert connection.status == "linked"
    link = db.query(BankAccountLink).one()
    assert (link.remote_account_uid, link.iban, link.remote_name) == ("uid-9", "FR761111", "Compte Joint")
    assert link.account_id is None


def test_reconsenting_repoints_the_existing_link_by_iban(client, db, linked_connection, monkeypatch):
    linked_connection.connection.status = "expired"
    db.commit()
    original_link_id = linked_connection.id

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-2",
        "access": {"valid_until": "2027-01-01T12:00:00Z"},
        "accounts": [{
            "uid": "remote-uid-2", "name": "Compte Courant", "currency": "EUR",
            "account_id": {"iban": "FR7612345678901234567890123"},
        }],
    })
    client.get("/api/bank-sync/callback?code=c&state=state-1", follow_redirects=False)

    assert db.query(BankAccountLink).count() == 1
    db.refresh(linked_connection)
    assert linked_connection.id == original_link_id
    assert linked_connection.remote_account_uid == "remote-uid-2"
    # The mapping the user set survives the renewal.
    assert linked_connection.account_id is not None


def test_callback_reads_accounts_given_as_bare_uids(client, db, monkeypatch):
    """Some ASPSPs return `accounts` as uid strings rather than objects; the
    IBAN, name and currency then take their own call."""
    connection = BankConnection(aspsp_name="BoursoBank", aspsp_country="FR", state="state-11", status="pending")
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-11",
        "access": {"valid_until": "2026-12-19T00:00:00Z"},
        "accounts": ["uid-11"],
    })
    monkeypatch.setattr(enable_banking, "fetch_account_details", lambda uid: {
        "uid": uid, "name": "Compte Bourso", "currency": "EUR",
        "account_id": {"iban": "FR7630004"},
    })
    client.get("/api/bank-sync/callback?code=c&state=state-11", follow_redirects=False)

    link = db.query(BankAccountLink).one()
    assert (link.remote_account_uid, link.iban, link.remote_name) == ("uid-11", "FR7630004", "Compte Bourso")


def test_callback_falls_back_to_accounts_data(client, db, monkeypatch):
    """An empty `accounts` doesn't mean an empty consent — the uids can be in
    `accounts_data` instead, which is what BoursoBank did."""
    connection = BankConnection(aspsp_name="BoursoBank", aspsp_country="FR", state="state-12", status="pending")
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-12",
        "access": {"valid_until": "2026-12-19T00:00:00Z"},
        "accounts": [],
        "accounts_data": [{"uid": "uid-12", "identification_hash": "hash"}],
    })
    monkeypatch.setattr(enable_banking, "fetch_account_details", lambda uid: {
        "uid": uid, "product": "Compte courant", "currency": "EUR",
        "account_id": {"iban": "FR7630004222"},
    })
    client.get("/api/bank-sync/callback?code=c&state=state-12", follow_redirects=False)

    link = db.query(BankAccountLink).one()
    assert (link.remote_account_uid, link.iban, link.remote_name) == ("uid-12", "FR7630004222", "Compte courant")


def test_an_account_whose_details_fail_is_still_listed(client, db, monkeypatch):
    connection = BankConnection(aspsp_name="BoursoBank", aspsp_country="FR", state="state-13", status="pending")
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-13", "accounts": ["uid-13"],
    })

    def refuse(uid):
        raise enable_banking.EnableBankingError("403")

    monkeypatch.setattr(enable_banking, "fetch_account_details", refuse)
    client.get("/api/bank-sync/callback?code=c&state=state-13", follow_redirects=False)

    link = db.query(BankAccountLink).one()
    assert link.remote_account_uid == "uid-13"
    assert link.iban is None


def test_a_consent_naming_no_account_says_what_came_back(client, db, monkeypatch):
    connection = BankConnection(aspsp_name="BoursoBank", aspsp_country="FR", state="state-14", status="pending")
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "create_session", lambda code: {
        "session_id": "session-14", "accounts": [], "status": "AUTHORIZED",
    })
    response = client.get("/api/bank-sync/callback?code=c&state=state-14", follow_redirects=False)

    assert "bank=connected" in response.headers["location"]
    db.refresh(connection)
    assert connection.status == "linked"
    assert db.query(BankAccountLink).count() == 0
    assert "named no account" in connection.last_error
    assert "accounts: 0" in connection.last_error
    assert "AUTHORIZED" in connection.last_error


def test_refreshing_a_connection_records_the_accounts_it_missed(client, db, monkeypatch):
    connection = BankConnection(
        aspsp_name="BoursoBank", aspsp_country="FR", state="state-15",
        status="linked", session_id="session-15", last_error="named no account",
    )
    db.add(connection)
    db.commit()

    monkeypatch.setattr(enable_banking, "fetch_session", lambda session_id: {
        "session_id": session_id,
        "access": {"valid_until": "2026-12-19T00:00:00Z"},
        "accounts": ["uid-15"],
    })
    monkeypatch.setattr(enable_banking, "fetch_account_details", lambda uid: {
        "uid": uid, "name": "Compte Bourso", "currency": "EUR",
        "account_id": {"iban": "FR7630004333"},
    })
    response = client.post(f"/api/bank-sync/connections/{connection.id}/refresh")

    assert response.status_code == 200
    assert response.json()["accounts"][0]["iban"] == "FR7630004333"
    db.refresh(connection)
    assert connection.last_error is None


def test_refreshing_keeps_an_existing_mapping(client, db, linked_connection, monkeypatch):
    mapped_account_id = linked_connection.account_id
    assert mapped_account_id is not None

    monkeypatch.setattr(enable_banking, "fetch_session", lambda session_id: {
        "session_id": session_id,
        "accounts": [{
            "uid": "remote-uid-1", "name": "Compte Courant", "currency": "EUR",
            "account_id": {"iban": "FR7612345678901234567890123"},
        }],
    })
    client.post(f"/api/bank-sync/connections/{linked_connection.connection_id}/refresh")

    assert db.query(BankAccountLink).count() == 1
    db.refresh(linked_connection)
    assert linked_connection.account_id == mapped_account_id


def test_refreshing_a_connection_without_a_session_is_rejected(client, db):
    connection = BankConnection(aspsp_name="CCF", aspsp_country="FR", state="state-16", status="linked")
    db.add(connection)
    db.commit()

    response = client.post(f"/api/bank-sync/connections/{connection.id}/refresh")
    assert response.status_code == 502


def test_refreshing_an_unknown_connection_is_404(client):
    assert client.post("/api/bank-sync/connections/999/refresh").status_code == 404


def test_callback_with_unknown_state_redirects_with_an_error(client):
    response = client.get("/api/bank-sync/callback?code=x&state=nope", follow_redirects=False)
    assert response.status_code == 307
    assert "bank=error" in response.headers["location"]


def test_callback_with_bank_error_marks_the_connection(client, db):
    connection = BankConnection(aspsp_name="CCF", aspsp_country="FR", state="state-8", status="pending")
    db.add(connection)
    db.commit()

    response = client.get("/api/bank-sync/callback?state=state-8&error=access_denied", follow_redirects=False)

    assert "bank=error" in response.headers["location"]
    db.refresh(connection)
    assert connection.status == "error"
    assert connection.last_error == "access_denied"


def test_update_link_maps_an_account_and_defaults_sync_from_today(client, db, sample_account):
    connection = BankConnection(aspsp_name="CCF", aspsp_country="FR", state="s", status="linked")
    db.add(connection)
    db.flush()
    link = BankAccountLink(connection_id=connection.id, remote_account_uid="u")
    db.add(link)
    db.commit()

    response = client.put(f"/api/bank-sync/links/{link.id}", json={"account_id": sample_account.id, "sync_enabled": True})

    assert response.status_code == 200
    data = response.json()
    assert data["account_id"] == sample_account.id
    assert data["sync_from_date"] == datetime.now(timezone.utc).date().isoformat()


def test_update_link_rejects_an_account_already_taken(client, db, linked_connection, sample_account):
    other = BankAccountLink(connection_id=linked_connection.connection_id, remote_account_uid="u2")
    db.add(other)
    db.commit()

    response = client.put(f"/api/bank-sync/links/{other.id}", json={"account_id": sample_account.id})

    assert response.status_code == 422
    assert "already linked" in response.json()["detail"]


def test_update_link_rejects_an_archived_account(client, db, linked_connection):
    archived = Account(name="Old", type="Checking", archived=True)
    db.add(archived)
    db.flush()
    link = BankAccountLink(connection_id=linked_connection.connection_id, remote_account_uid="u3")
    db.add(link)
    db.commit()

    response = client.put(f"/api/bank-sync/links/{link.id}", json={"account_id": archived.id})

    assert response.status_code == 422
    assert "archived" in response.json()["detail"]


def test_sync_now_requires_a_mapped_account(client, db, linked_connection):
    linked_connection.account_id = None
    db.commit()
    assert client.post(f"/api/bank-sync/links/{linked_connection.id}/sync").status_code == 422


def test_sync_now_imports(client, db, linked_connection, global_weights, monkeypatch):
    monkeypatch.setattr(enable_banking, "fetch_transactions", lambda *a, **k: [
        _booked("15.00", "DBIT", "2026-03-04", entry_reference="a"),
    ])
    response = client.post(f"/api/bank-sync/links/{linked_connection.id}/sync")

    assert response.status_code == 200
    assert response.json() == {"ran": True, "synced_links": 1, "created_count": 1, "status": "success", "error": None}


def test_run_due_rejects_a_wrong_scheduler_secret(client):
    assert client.post("/api/bank-sync/run-due").status_code == 403
    assert client.post("/api/bank-sync/run-due", headers={"X-Bank-Sync-Scheduler-Secret": "wrong"}).status_code == 403


def test_run_due_syncs_every_due_link(client, db, linked_connection, global_weights, monkeypatch):
    monkeypatch.setattr(enable_banking, "fetch_transactions", lambda *a, **k: [
        _booked("15.00", "DBIT", "2026-03-04", entry_reference="a"),
    ])
    response = client.post("/api/bank-sync/run-due", headers={"X-Bank-Sync-Scheduler-Secret": "test-scheduler-secret"})

    assert response.status_code == 200
    assert response.json()["synced_links"] == 1
    assert response.json()["created_count"] == 1


def test_run_due_skips_a_link_synced_too_recently(client, db, linked_connection, global_weights, monkeypatch):
    linked_connection.last_synced_at = datetime.now(timezone.utc).replace(tzinfo=None)
    linked_connection.last_sync_status = "success"
    db.commit()
    monkeypatch.setattr(enable_banking, "fetch_transactions", lambda *a, **k: pytest.fail("should not call the bank"))

    response = client.post("/api/bank-sync/run-due", headers={"X-Bank-Sync-Scheduler-Secret": "test-scheduler-secret"})

    assert response.json() == {"ran": False, "synced_links": 0, "created_count": 0, "status": None, "error": None}


def test_delete_connection_revokes_and_keeps_transactions(client, db, linked_connection, global_weights, monkeypatch):
    rows = enable_banking.normalize_transactions([_booked("5.00", "DBIT", "2026-03-04", entry_reference="a")])
    enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))
    revoked: list[str] = []
    monkeypatch.setattr(enable_banking, "delete_session", lambda session_id: revoked.append(session_id))

    response = client.delete(f"/api/bank-sync/connections/{linked_connection.connection_id}")

    assert response.status_code == 204
    assert revoked == ["session-1"]
    assert db.query(BankConnection).count() == 0
    assert db.query(BankAccountLink).count() == 0
    assert db.query(Transaction).count() == 1


def test_delete_connection_succeeds_even_if_revocation_fails(client, db, linked_connection, monkeypatch):
    def _boom(session_id):
        raise enable_banking.EnableBankingError("session already gone")

    monkeypatch.setattr(enable_banking, "delete_session", _boom)
    assert client.delete(f"/api/bank-sync/connections/{linked_connection.connection_id}").status_code == 204
    assert db.query(BankConnection).count() == 0


def test_institutions_are_deduplicated_and_sorted(client, monkeypatch):
    monkeypatch.setattr(enable_banking, "list_aspsps", lambda country: [
        {"name": "CCF", "country": "FR"},
        {"name": "BoursoBank", "country": "FR", "logo": "https://logo"},
        {"name": "CCF", "country": "FR"},
    ])
    response = client.get("/api/bank-sync/institutions?country=FR")

    assert response.status_code == 200
    assert [i["name"] for i in response.json()] == ["BoursoBank", "CCF"]


def test_institutions_surface_an_upstream_failure_as_502(client, monkeypatch):
    def _boom(country):
        raise enable_banking.EnableBankingError("not configured")

    monkeypatch.setattr(enable_banking, "list_aspsps", _boom)
    assert client.get("/api/bank-sync/institutions").status_code == 502


# ── Backup round-trip ─────────────────────────────────────────────────

def test_backup_export_import_preserves_external_id(db, linked_connection, global_weights):
    import backup

    rows = enable_banking.normalize_transactions([_booked("5.00", "DBIT", "2026-03-04", entry_reference="keep-me")])
    enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))

    export = backup.build_export(db)
    assert export.transactions[0].external_id == "keep-me"


# ── Raw, read-only fields ─────────────────────────────────────────────

def test_normalize_captures_the_banks_own_wording():
    rows = enable_banking.normalize_transactions([
        _booked(
            "42.50", "DBIT", "2026-03-04",
            entry_reference="a",
            creditor={"name": "CARREFOUR MARKET"},
            remittance_information=["CB CARREFOUR MARKET 03/03", "PARIS 75"],
            bank_transaction_code={"domain": "PMNT", "family": "CCRD", "sub_family": "POSD"},
            merchant_category_code="5411",
            transaction_date="2026-03-03",
        ),
    ])
    assert rows[0]["raw_source"] == "enable_banking"
    assert rows[0]["raw_label"] == "CB CARREFOUR MARKET 03/03 PARIS 75"
    assert rows[0]["raw_counterparty"] == "CARREFOUR MARKET"
    assert rows[0]["raw_transaction_code"] == "PMNT/CCRD/POSD"
    assert rows[0]["raw_merchant_category_code"] == "5411"
    assert rows[0]["raw_initiated_date"] == date(2026, 3, 3)


def test_normalize_accepts_the_other_bank_transaction_code_shapes():
    rows = enable_banking.normalize_transactions([
        _booked("1.00", "DBIT", "2026-03-04", entry_reference="a",
                bank_transaction_code={"code": "PMNT", "sub_code": "POSD"}),
        _booked("2.00", "DBIT", "2026-03-04", entry_reference="b",
                bank_transaction_code={"description": "Card payment"}),
        _booked("3.00", "DBIT", "2026-03-04", entry_reference="c",
                bank_transaction_code="PMNT-CCRD"),
        _booked("4.00", "DBIT", "2026-03-04", entry_reference="d"),
    ])
    assert [r["raw_transaction_code"] for r in rows] == ["PMNT/POSD", "Card payment", "PMNT-CCRD", None]


def test_raw_counterparty_survives_a_bank_that_names_the_party_as_a_string():
    """The spec says the party is an object, so most banks send one. A bank
    that sends a bare name instead must not take the whole sync down over a
    field nothing computes from — the same reasoning as the three shapes
    _bank_transaction_code() folds together."""
    rows = enable_banking.normalize_transactions([
        _booked("9.00", "DBIT", "2026-03-04", entry_reference="a", creditor="EDF"),
        _booked("9.00", "CRDT", "2026-03-04", entry_reference="b", debtor={"name": "  URSSAF  "}),
        _booked("9.00", "DBIT", "2026-03-04", entry_reference="c", creditor={"name": ""}),
        _booked("9.00", "DBIT", "2026-03-04", entry_reference="d", creditor={"iban": "FR76"}),
    ])
    assert [r["raw_counterparty"] for r in rows] == ["EDF", "URSSAF", None, None]


def test_raw_counterparty_stays_empty_when_the_bank_named_nobody():
    """Unlike payee, which falls back to the remittance and then to a
    placeholder: these columns say what the bank said, or nothing."""
    rows = enable_banking.normalize_transactions([
        _booked("30.00", "DBIT", "2026-03-04", entry_reference="c",
                remittance_information=["VIR SEPA LOYER"]),
    ])
    assert rows[0]["payee"] == "VIR SEPA LOYER"
    assert rows[0]["raw_counterparty"] is None
    assert rows[0]["raw_merchant_category_code"] is None
    assert rows[0]["raw_initiated_date"] is None


def test_import_persists_the_raw_fields(db, linked_connection, global_weights):
    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a",
                creditor={"name": "CARREFOUR MARKET"},
                remittance_information=["CB CARREFOUR MARKET 03/03"],
                bank_transaction_code={"domain": "PMNT", "family": "CCRD"},
                merchant_category_code="5411"),
    ])
    enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))
    transaction = db.query(Transaction).one()
    assert transaction.raw_source == "enable_banking"
    assert transaction.raw_label == "CB CARREFOUR MARKET 03/03"
    assert transaction.raw_counterparty == "CARREFOUR MARKET"
    assert transaction.raw_transaction_code == "PMNT/CCRD"
    assert transaction.raw_merchant_category_code == "5411"
    # Never filled from a bank: only the Linxo export carries a location.
    assert transaction.raw_merchant_location is None


def test_editing_a_synced_transaction_leaves_the_raw_label_alone(client, db, linked_connection, global_weights):
    rows = enable_banking.normalize_transactions([
        _booked("42.50", "DBIT", "2026-03-04", entry_reference="a",
                creditor={"name": "CARREFOUR MARKET"},
                remittance_information=["CB CARREFOUR MARKET 03/03"]),
    ])
    enable_banking.import_transactions(db, linked_connection, rows, date(2026, 3, 1), date(2026, 3, 31))
    transaction_id = db.query(Transaction).one().id

    response = client.put(f"/api/transactions/{transaction_id}", json={
        "payee": "Courses de la semaine",
        "memo": "reecrit",
        # Read-only: the API has no such field, so this must be ignored
        # rather than stored.
        "raw_label": "tentative de reecriture",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["payee"] == "Courses de la semaine"
    assert body["raw_label"] == "CB CARREFOUR MARKET 03/03"
    assert body["raw_counterparty"] == "CARREFOUR MARKET"

    db.expire_all()
    assert db.query(Transaction).one().raw_label == "CB CARREFOUR MARKET 03/03"


def test_manually_created_transactions_have_no_raw_fields(client, sample_account, global_weights):
    response = client.post("/api/transactions", json={
        "date": "2026-03-04",
        "payee": "Saisie manuelle",
        "amount": -10.0,
        "account_id": sample_account.id,
    })
    assert response.status_code == 201
    body = response.json()
    assert body["raw_source"] is None
    assert body["raw_label"] is None
