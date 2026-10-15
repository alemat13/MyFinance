from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet

import onedrive
from models import OneDriveBackupSettings


@pytest.fixture(autouse=True)
def onedrive_env(monkeypatch):
    monkeypatch.setenv("ONEDRIVE_CLIENT_ID", "test-client-id")
    monkeypatch.setenv("ONEDRIVE_CLIENT_SECRET", "test-client-secret")
    monkeypatch.setenv("ONEDRIVE_REDIRECT_URI", "http://localhost:8000/api/onedrive/auth/callback")
    monkeypatch.setenv("ONEDRIVE_TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode())
    monkeypatch.setenv("ONEDRIVE_SCHEDULER_SECRET", "test-scheduler-secret")


def test_get_settings_defaults(client):
    response = client.get("/api/onedrive/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is False
    assert "frequency" not in data
    assert (data["keep_daily"], data["keep_weekly"], data["keep_monthly"], data["keep_yearly"]) == (8, 5, 13, 10)
    assert data["account_email"] is None


RETENTION = {"keep_daily": 8, "keep_weekly": 5, "keep_monthly": 13, "keep_yearly": 10}


def test_put_settings_updates_folder_and_retention(client):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "/MyFinance Backups",
              "keep_daily": 7, "keep_weekly": 4, "keep_monthly": 12, "keep_yearly": 0},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["folder_path"] == "/MyFinance Backups"
    assert (data["keep_daily"], data["keep_weekly"], data["keep_monthly"], data["keep_yearly"]) == (7, 4, 12, 0)


def test_put_settings_empty_folder_rejected(client):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "   ", **RETENTION},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("override", [
    {"keep_daily": -1},
    {"keep_yearly": 366},
    {"keep_daily": 0, "keep_weekly": 0, "keep_monthly": 0, "keep_yearly": 0},
])
def test_put_settings_retention_out_of_range_rejected(client, override):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "/Backups", **RETENTION, **override},
    )
    assert response.status_code == 422


def test_run_now_rejected_when_not_connected(client):
    response = client.post("/api/onedrive/backup/run-now")
    assert response.status_code == 422


def test_disconnect_clears_connection(client, db):
    settings = onedrive.get_or_create_settings(db)
    settings.connected = True
    settings.account_email = "user@example.com"
    settings.access_token_encrypted = "enc-access"
    settings.refresh_token_encrypted = "enc-refresh"
    db.commit()

    response = client.post("/api/onedrive/disconnect")
    assert response.status_code == 200
    data = response.json()
    assert data["connected"] is False
    assert data["account_email"] is None

    refreshed = onedrive.get_or_create_settings(db)
    assert refreshed.access_token_encrypted is None
    assert refreshed.refresh_token_encrypted is None


def test_run_due_requires_scheduler_secret(client):
    response = client.post("/api/onedrive/backup/run-due")
    assert response.status_code == 403


def test_run_due_rejects_wrong_secret(client):
    response = client.post(
        "/api/onedrive/backup/run-due",
        headers={"X-Backup-Scheduler-Secret": "wrong"},
    )
    assert response.status_code == 403


def test_run_due_not_due_returns_ran_false(client, db):
    settings = onedrive.get_or_create_settings(db)
    settings.connected = True
    settings.folder_path = "/Backups"
    settings.last_backup_at = datetime.now(timezone.utc)
    db.commit()

    response = client.post(
        "/api/onedrive/backup/run-due",
        headers={"X-Backup-Scheduler-Secret": "test-scheduler-secret"},
    )
    assert response.status_code == 200
    assert response.json() == {"ran": False, "status": None, "error": None}


def test_run_due_runs_when_due(client, db, monkeypatch):
    settings = onedrive.get_or_create_settings(db)
    settings.connected = True
    settings.folder_path = "/Backups"
    settings.access_token_encrypted = "enc-access"
    settings.refresh_token_encrypted = "enc-refresh"
    settings.token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    monkeypatch.setattr(onedrive, "get_valid_access_token", lambda db, settings: "token")
    monkeypatch.setattr(onedrive, "ensure_folder", lambda *a, **k: None)
    monkeypatch.setattr(onedrive, "upload_backup", lambda *a, **k: None)
    monkeypatch.setattr(onedrive, "apply_retention", lambda *a, **k: None)

    response = client.post(
        "/api/onedrive/backup/run-due",
        headers={"X-Backup-Scheduler-Secret": "test-scheduler-secret"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["ran"] is True
    assert data["status"] == "success"

    refreshed = onedrive.get_or_create_settings(db)
    assert refreshed.last_backup_status == "success"
    assert refreshed.last_backup_at is not None


def test_run_backup_records_failure_instead_of_raising(db, monkeypatch):
    settings = onedrive.get_or_create_settings(db)
    settings.connected = True
    settings.folder_path = "/Backups"
    settings.access_token_encrypted = "enc-access"
    settings.refresh_token_encrypted = "enc-refresh"
    settings.token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    def _boom(db, settings):
        raise onedrive.OneDriveError("token refresh failed")

    monkeypatch.setattr(onedrive, "get_valid_access_token", _boom)

    onedrive.run_backup(db, settings)

    assert settings.last_backup_status == "failed"
    assert settings.last_backup_error == "token refresh failed"


def test_run_backup_fails_cleanly_with_no_folder_configured(db, monkeypatch):
    settings = onedrive.get_or_create_settings(db)
    settings.connected = True
    settings.access_token_encrypted = "enc-access"
    settings.refresh_token_encrypted = "enc-refresh"
    settings.token_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()

    onedrive.run_backup(db, settings)

    assert settings.last_backup_status == "failed"
    assert "folder" in settings.last_backup_error.lower()


@pytest.mark.parametrize("hours,due", [(0, False), (19, False), (20, True), (24, True), (24 * 7, True)])
def test_is_backup_due_once_a_day(hours, due):
    now = datetime.now(timezone.utc)
    settings = OneDriveBackupSettings(connected=True, last_backup_at=now - timedelta(hours=hours))
    assert onedrive.is_backup_due(settings, now=now) is due


def test_is_backup_due_false_when_not_connected():
    settings = OneDriveBackupSettings(connected=False, last_backup_at=None)
    assert onedrive.is_backup_due(settings) is False


def test_is_backup_due_true_when_never_backed_up():
    settings = OneDriveBackupSettings(connected=True, last_backup_at=None)
    assert onedrive.is_backup_due(settings) is True


class _FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def _ts(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d %H:%M")


def _name(ts: datetime) -> str:
    return f"myfinance-backup-{ts:%Y%m%d-%H%M%S}.zip"


def test_select_backups_keeps_newest_per_bucket():
    # One backup a day at 02:00 for two years, plus a second one on the last day.
    start = datetime(2024, 10, 12, 2, 0)
    stamps = [start + timedelta(days=i) for i in range(731)] + [_ts("2026-10-12 09:30")]
    kept = onedrive.select_backups_to_keep(stamps, keep_daily=8, keep_weekly=5, keep_monthly=13, keep_yearly=10)

    newest = _ts("2026-10-12 09:30")
    assert newest in kept
    assert _ts("2026-10-12 02:00") not in kept  # same day as a newer one
    # Daily: the 8 most recent days.
    for day in range(5, 12):
        assert datetime(2026, 10, day, 2, 0) in kept
    # Weekly: the Sunday closing each previous ISO week.
    for sunday in (datetime(2026, 10, 11, 2), datetime(2026, 10, 4, 2), datetime(2026, 9, 27, 2), datetime(2026, 9, 20, 2)):
        assert sunday in kept
    # Monthly: last day of each of the 12 previous months.
    for month_end in (datetime(2026, 9, 30, 2), datetime(2026, 1, 31, 2), datetime(2025, 10, 31, 2)):
        assert month_end in kept
    assert datetime(2025, 9, 30, 2) not in kept  # 14th month back
    # Yearly: last backup of 2025 and of 2024.
    assert datetime(2025, 12, 31, 2) in kept
    assert datetime(2024, 12, 31, 2) in kept
    assert datetime(2024, 10, 12, 2) not in kept
    # Overlapping tiers share files, so far fewer than 8+5+13+10 are kept.
    assert len(kept) <= 36


def test_select_backups_counts_buckets_that_hold_a_backup():
    # Weekly backups: "8 daily" means the 8 most recent days that had one.
    stamps = [datetime(2026, 1, 4, 2) + timedelta(weeks=i) for i in range(20)]
    kept = onedrive.select_backups_to_keep(stamps, keep_daily=8, keep_weekly=0, keep_monthly=0, keep_yearly=0)
    assert kept == set(sorted(stamps)[-8:])


def test_select_backups_always_keeps_newest():
    stamps = [_ts("2026-10-10 02:00"), _ts("2026-10-11 02:00")]
    kept = onedrive.select_backups_to_keep(stamps, keep_daily=0, keep_weekly=0, keep_monthly=0, keep_yearly=1)
    assert kept == {_ts("2026-10-11 02:00")}


def _settings(**retention):
    values = {"keep_daily": 2, "keep_weekly": 0, "keep_monthly": 0, "keep_yearly": 0, **retention}
    return OneDriveBackupSettings(folder_path="/Backups", **values)


def test_apply_retention_only_deletes_app_backups(monkeypatch):
    deleted = []
    items = [
        {"id": f"item{i}", "name": _name(datetime(2026, 1, i, 2)), "file": {}} for i in range(1, 6)
    ] + [
        {"id": "mine", "name": "myfinance-backup-manual.zip", "file": {}},
        {"id": "notes", "name": "notes.txt", "file": {}},
        {"id": "dir", "name": "myfinance-backup-20200101-000000.zip", "folder": {}},
    ]
    monkeypatch.setattr(onedrive.httpx, "get", lambda *a, **k: _FakeResponse(200, {"value": items}))
    monkeypatch.setattr(onedrive.httpx, "delete", lambda url, **k: deleted.append(url.rsplit("/", 1)[-1]) or _FakeResponse(204))

    onedrive.apply_retention("token", _settings())

    assert sorted(deleted) == ["item1", "item2", "item3"]


def test_apply_retention_follows_paging(monkeypatch):
    deleted = []
    pages = {
        "first": {"value": [{"id": "a", "name": _name(datetime(2026, 1, 1, 2))}], "@odata.nextLink": "https://graph/next"},
        "https://graph/next": {"value": [{"id": "b", "name": _name(datetime(2026, 1, 2, 2))},
                                         {"id": "c", "name": _name(datetime(2026, 1, 3, 2))}]},
    }
    monkeypatch.setattr(onedrive.httpx, "get", lambda url, **k: _FakeResponse(200, pages.get(url, pages["first"])))
    monkeypatch.setattr(onedrive.httpx, "delete", lambda url, **k: deleted.append(url.rsplit("/", 1)[-1]) or _FakeResponse(204))

    onedrive.apply_retention("token", _settings())

    assert deleted == ["a"]


def test_apply_retention_deletes_nothing_when_listing_fails(monkeypatch):
    deleted = []
    calls = iter([
        _FakeResponse(200, {"value": [{"id": "a", "name": _name(datetime(2026, 1, 1, 2))}], "@odata.nextLink": "https://graph/next"}),
        _FakeResponse(503, text="unavailable"),
    ])
    monkeypatch.setattr(onedrive.httpx, "get", lambda *a, **k: next(calls))
    monkeypatch.setattr(onedrive.httpx, "delete", lambda url, **k: deleted.append(url) or _FakeResponse(204))

    with pytest.raises(onedrive.OneDriveError):
        onedrive.apply_retention("token", _settings(keep_daily=0, keep_yearly=1))

    assert deleted == []


def test_encrypt_decrypt_round_trip():
    token = "super-secret-token"
    encrypted = onedrive.encrypt_token(token)
    assert encrypted != token
    assert onedrive.decrypt_token(encrypted) == token


def test_verify_scheduler_secret():
    assert onedrive.verify_scheduler_secret("test-scheduler-secret") is True
    assert onedrive.verify_scheduler_secret("wrong") is False
    assert onedrive.verify_scheduler_secret(None) is False


def _start(client):
    """Runs /auth/start and returns the `state` it sent to Microsoft; the
    test client keeps the cookie it set, like the browser would."""
    response = client.get("/api/onedrive/auth/start", follow_redirects=False)
    assert response.status_code in (302, 307)
    query = parse_qs(urlparse(response.headers["location"]).query)
    return query["state"][0]


def test_auth_start_redirects_to_microsoft_with_state_and_pkce(client):
    response = client.get("/api/onedrive/auth/start", follow_redirects=False)
    assert response.status_code in (302, 307)
    location = response.headers["location"]
    assert "login.microsoftonline.com" in location
    query = parse_qs(urlparse(location).query)
    assert query["code_challenge_method"] == ["S256"]
    state, _, verifier = client.cookies.get("onedrive_oauth").strip('"').partition(".")
    assert query["state"] == [state]
    assert query["code_challenge"] == [onedrive.pkce_challenge(verifier)]


def test_auth_callback_success(client, monkeypatch):
    verifiers = []

    def _exchange(code, code_verifier):
        verifiers.append(code_verifier)
        return {"access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600}

    monkeypatch.setattr(onedrive, "exchange_code_for_tokens", _exchange)
    monkeypatch.setattr(onedrive, "fetch_account_email", lambda token: "user@example.com")

    state = _start(client)
    expected_verifier = client.cookies.get("onedrive_oauth").strip('"').partition(".")[2]
    response = client.get(f"/api/onedrive/auth/callback?code=abc123&state={state}", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=connected" in response.headers["location"]

    settings_response = client.get("/api/onedrive/settings")
    data = settings_response.json()
    assert data["connected"] is True
    assert data["account_email"] == "user@example.com"
    assert verifiers == [expected_verifier]


def test_auth_callback_error_param_redirects_with_error(client):
    response = client.get("/api/onedrive/auth/callback?error=access_denied", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=error" in response.headers["location"]


def test_auth_callback_token_exchange_failure_redirects_with_error(client, monkeypatch):
    def _boom(code, code_verifier):
        raise onedrive.OneDriveError("bad code")

    monkeypatch.setattr(onedrive, "exchange_code_for_tokens", _boom)

    state = _start(client)
    response = client.get(f"/api/onedrive/auth/callback?code=bad&state={state}", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=error" in response.headers["location"]


def _never_exchange(monkeypatch):
    def _fail(code, code_verifier):
        raise AssertionError("must not exchange a code the browser did not ask for")

    monkeypatch.setattr(onedrive, "exchange_code_for_tokens", _fail)


def test_auth_callback_without_started_flow_is_refused(client, monkeypatch):
    """A crafted link carrying someone else's code, opened by a browser that
    never started a connection, must not connect anything."""
    _never_exchange(monkeypatch)
    response = client.get("/api/onedrive/auth/callback?code=attacker&state=whatever", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=error" in response.headers["location"]
    assert client.get("/api/onedrive/settings").json()["connected"] is False


def test_auth_callback_with_mismatched_state_is_refused(client, monkeypatch):
    _never_exchange(monkeypatch)
    _start(client)
    response = client.get("/api/onedrive/auth/callback?code=attacker&state=forged", follow_redirects=False)
    assert "onedrive=error" in response.headers["location"]
    assert client.get("/api/onedrive/settings").json()["connected"] is False


def test_auth_callback_without_state_is_refused(client, monkeypatch):
    _never_exchange(monkeypatch)
    _start(client)
    response = client.get("/api/onedrive/auth/callback?code=attacker", follow_redirects=False)
    assert "onedrive=error" in response.headers["location"]
