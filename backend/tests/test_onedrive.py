from datetime import datetime, timedelta, timezone

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
    assert data["frequency"] == "daily"
    assert data["retention_count"] == 30
    assert data["account_email"] is None


def test_put_settings_updates_folder_frequency_retention(client):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "/MyFinance Backups", "frequency": "weekly", "retention_count": 10},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["folder_path"] == "/MyFinance Backups"
    assert data["frequency"] == "weekly"
    assert data["retention_count"] == 10


def test_put_settings_empty_folder_rejected(client):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "   ", "frequency": "daily", "retention_count": 10},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("retention_count", [0, 366])
def test_put_settings_retention_out_of_range_rejected(client, retention_count):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "/Backups", "frequency": "daily", "retention_count": retention_count},
    )
    assert response.status_code == 422


def test_put_settings_invalid_frequency_rejected(client):
    response = client.put(
        "/api/onedrive/settings",
        json={"folder_path": "/Backups", "frequency": "yearly", "retention_count": 10},
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


@pytest.mark.parametrize("frequency,days,due", [
    ("daily", 0, False),
    ("daily", 1, True),
    ("weekly", 6, False),
    ("weekly", 7, True),
    ("monthly", 29, False),
    ("monthly", 30, True),
])
def test_is_backup_due_frequency_math(frequency, days, due):
    now = datetime.now(timezone.utc)
    settings = OneDriveBackupSettings(connected=True, frequency=frequency, last_backup_at=now - timedelta(days=days))
    assert onedrive.is_backup_due(settings, now=now) is due


def test_is_backup_due_false_when_not_connected():
    settings = OneDriveBackupSettings(connected=False, frequency="daily", last_backup_at=None)
    assert onedrive.is_backup_due(settings) is False


def test_is_backup_due_true_when_never_backed_up():
    settings = OneDriveBackupSettings(connected=True, frequency="daily", last_backup_at=None)
    assert onedrive.is_backup_due(settings) is True


class _FakeResponse:
    def __init__(self, status_code, payload=None, text=""):
        self.status_code = status_code
        self._payload = payload or {}
        self.text = text

    def json(self):
        return self._payload


def test_apply_retention_deletes_beyond_count(monkeypatch):
    deleted = []
    items = [
        {"id": f"item{i}", "name": f"myfinance-backup-2026010{i}-000000.zip", "createdDateTime": f"2026-01-0{i}"}
        for i in range(1, 6)
    ]

    monkeypatch.setattr(onedrive.httpx, "get", lambda *a, **k: _FakeResponse(200, {"value": items}))
    monkeypatch.setattr(onedrive.httpx, "delete", lambda url, **k: deleted.append(url) or _FakeResponse(204))

    onedrive.apply_retention("token", "/Backups", retention_count=2)

    assert len(deleted) == 3


def test_apply_retention_keeps_all_when_under_limit(monkeypatch):
    deleted = []
    items = [{"id": "item1", "name": "myfinance-backup-20260101-000000.zip", "createdDateTime": "2026-01-01"}]

    monkeypatch.setattr(onedrive.httpx, "get", lambda *a, **k: _FakeResponse(200, {"value": items}))
    monkeypatch.setattr(onedrive.httpx, "delete", lambda url, **k: deleted.append(url) or _FakeResponse(204))

    onedrive.apply_retention("token", "/Backups", retention_count=30)

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


def test_auth_start_redirects_to_microsoft(client):
    response = client.get("/api/onedrive/auth/start", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "login.microsoftonline.com" in response.headers["location"]


def test_auth_callback_success(client, monkeypatch):
    monkeypatch.setattr(onedrive, "exchange_code_for_tokens", lambda code: {
        "access_token": "access-1", "refresh_token": "refresh-1", "expires_in": 3600,
    })
    monkeypatch.setattr(onedrive, "fetch_account_email", lambda token: "user@example.com")

    response = client.get("/api/onedrive/auth/callback?code=abc123", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=connected" in response.headers["location"]

    settings_response = client.get("/api/onedrive/settings")
    data = settings_response.json()
    assert data["connected"] is True
    assert data["account_email"] == "user@example.com"


def test_auth_callback_error_param_redirects_with_error(client):
    response = client.get("/api/onedrive/auth/callback?error=access_denied", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=error" in response.headers["location"]


def test_auth_callback_token_exchange_failure_redirects_with_error(client, monkeypatch):
    def _boom(code):
        raise onedrive.OneDriveError("bad code")

    monkeypatch.setattr(onedrive, "exchange_code_for_tokens", _boom)

    response = client.get("/api/onedrive/auth/callback?code=bad", follow_redirects=False)
    assert response.status_code in (302, 307)
    assert "onedrive=error" in response.headers["location"]
