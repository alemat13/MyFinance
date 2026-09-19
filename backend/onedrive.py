"""OneDrive automatic backup connection: OAuth against the Microsoft
identity platform, uploading a backup.export_to_zip_bytes() archive to a
user-chosen OneDrive folder, and count-based retention — driven by a single
global OneDriveBackupSettings row (see models.py). No restore path here;
restoring from a downloaded archive still goes through backup.py/the
existing Import Backup UI only.
"""
import hmac
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet
from sqlalchemy.orm import Session

import backup as backup_module
from models import OneDriveBackupSettings

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
AUTHORIZE_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
SCOPE = "Files.ReadWrite offline_access User.Read"

# Single global connection, always this row.
SETTINGS_ID = 1

_FREQUENCY_DAYS = {"daily": 1, "weekly": 7, "monthly": 30}


class OneDriveError(Exception):
    """Raised for any failed Microsoft identity/Graph call. Message text is
    safe to persist verbatim to OneDriveBackupSettings.last_backup_error."""


def get_or_create_settings(db: Session) -> OneDriveBackupSettings:
    settings = db.get(OneDriveBackupSettings, SETTINGS_ID)
    if settings is None:
        settings = OneDriveBackupSettings(id=SETTINGS_ID)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def _fernet() -> Fernet:
    key = os.environ.get("ONEDRIVE_TOKEN_ENCRYPTION_KEY")
    if not key:
        raise OneDriveError("ONEDRIVE_TOKEN_ENCRYPTION_KEY is not configured")
    return Fernet(key)


def encrypt_token(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_token(value: str) -> str:
    return _fernet().decrypt(value.encode()).decode()


def _auth_header(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}


def build_authorize_url(state: str) -> str:
    params = {
        "client_id": os.environ.get("ONEDRIVE_CLIENT_ID", ""),
        "redirect_uri": os.environ.get("ONEDRIVE_REDIRECT_URI", ""),
        "response_type": "code",
        "response_mode": "query",
        "scope": SCOPE,
        "state": state,
    }
    return f"{AUTHORIZE_URL}?{urlencode(params)}"


def _token_request(data: dict) -> dict:
    response = httpx.post(TOKEN_URL, data=data, timeout=30.0)
    if response.status_code != 200:
        raise OneDriveError(f"Microsoft token request failed ({response.status_code}): {response.text}")
    return response.json()


def exchange_code_for_tokens(code: str) -> dict:
    return _token_request({
        "client_id": os.environ.get("ONEDRIVE_CLIENT_ID", ""),
        "client_secret": os.environ.get("ONEDRIVE_CLIENT_SECRET", ""),
        "redirect_uri": os.environ.get("ONEDRIVE_REDIRECT_URI", ""),
        "grant_type": "authorization_code",
        "code": code,
        "scope": SCOPE,
    })


def refresh_access_token(refresh_token: str) -> dict:
    return _token_request({
        "client_id": os.environ.get("ONEDRIVE_CLIENT_ID", ""),
        "client_secret": os.environ.get("ONEDRIVE_CLIENT_SECRET", ""),
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "scope": SCOPE,
    })


def _persist_tokens(db: Session, settings: OneDriveBackupSettings, token_data: dict) -> None:
    settings.access_token_encrypted = encrypt_token(token_data["access_token"])
    # Microsoft may rotate the refresh token; only overwrite when one comes back.
    if token_data.get("refresh_token"):
        settings.refresh_token_encrypted = encrypt_token(token_data["refresh_token"])
    settings.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=token_data.get("expires_in", 3600))
    db.commit()


def complete_connection(db: Session, settings: OneDriveBackupSettings, code: str) -> None:
    token_data = exchange_code_for_tokens(code)
    _persist_tokens(db, settings, token_data)
    access_token = decrypt_token(settings.access_token_encrypted)
    settings.account_email = fetch_account_email(access_token)
    settings.connected = True
    db.commit()


def get_valid_access_token(db: Session, settings: OneDriveBackupSettings) -> str:
    if not settings.access_token_encrypted or not settings.refresh_token_encrypted:
        raise OneDriveError("OneDrive is not connected")
    expires_at = settings.token_expires_at
    if expires_at is not None and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at is None or expires_at <= datetime.now(timezone.utc) + timedelta(minutes=2):
        token_data = refresh_access_token(decrypt_token(settings.refresh_token_encrypted))
        _persist_tokens(db, settings, token_data)
    return decrypt_token(settings.access_token_encrypted)


def fetch_account_email(access_token: str) -> str | None:
    response = httpx.get(f"{GRAPH_BASE}/me", headers=_auth_header(access_token), timeout=30.0)
    if response.status_code != 200:
        raise OneDriveError(f"Failed to fetch OneDrive account info ({response.status_code}): {response.text}")
    data = response.json()
    return data.get("mail") or data.get("userPrincipalName")


def ensure_folder(access_token: str, folder_path: str) -> None:
    """Walks the path one segment at a time, creating any that don't exist
    yet — Graph's simple-upload/list endpoints address a folder by path but
    won't auto-create missing intermediate segments."""
    segments = [s for s in folder_path.strip("/").split("/") if s]
    built: list[str] = []
    for segment in segments:
        built.append(segment)
        current_path = "/".join(built)
        check = httpx.get(f"{GRAPH_BASE}/me/drive/root:/{current_path}", headers=_auth_header(access_token), timeout=30.0)
        if check.status_code == 200:
            continue
        if check.status_code != 404:
            raise OneDriveError(f"Failed to check OneDrive folder '{current_path}' ({check.status_code}): {check.text}")
        parent_path = "/".join(built[:-1])
        children_url = (
            f"{GRAPH_BASE}/me/drive/root:/{parent_path}:/children" if parent_path
            else f"{GRAPH_BASE}/me/drive/root/children"
        )
        create = httpx.post(
            children_url,
            headers=_auth_header(access_token),
            json={"name": segment, "folder": {}, "@microsoft.graph.conflictBehavior": "fail"},
            timeout=30.0,
        )
        if create.status_code not in (200, 201, 409):
            raise OneDriveError(f"Failed to create OneDrive folder '{current_path}' ({create.status_code}): {create.text}")


def upload_backup(access_token: str, folder_path: str, filename: str, content: bytes) -> None:
    path = f"{folder_path.strip('/')}/{filename}"
    response = httpx.put(
        f"{GRAPH_BASE}/me/drive/root:/{path}:/content",
        headers={**_auth_header(access_token), "Content-Type": "application/zip"},
        content=content,
        timeout=60.0,
    )
    if response.status_code not in (200, 201):
        raise OneDriveError(f"Failed to upload backup to OneDrive ({response.status_code}): {response.text}")


def apply_retention(access_token: str, folder_path: str, retention_count: int) -> None:
    path = folder_path.strip("/")
    response = httpx.get(
        f"{GRAPH_BASE}/me/drive/root:/{path}:/children",
        headers=_auth_header(access_token),
        params={"$orderby": "createdDateTime desc", "$select": "id,name,createdDateTime"},
        timeout=30.0,
    )
    if response.status_code != 200:
        raise OneDriveError(f"Failed to list OneDrive backup folder ({response.status_code}): {response.text}")
    items = [item for item in response.json().get("value", []) if item.get("name", "").startswith("myfinance-backup-")]
    for item in items[retention_count:]:
        delete = httpx.delete(f"{GRAPH_BASE}/me/drive/items/{item['id']}", headers=_auth_header(access_token), timeout=30.0)
        if delete.status_code not in (200, 204, 404):
            raise OneDriveError(f"Failed to delete old OneDrive backup '{item.get('name')}' ({delete.status_code}): {delete.text}")


def is_backup_due(settings: OneDriveBackupSettings, now: datetime | None = None) -> bool:
    if not settings.connected:
        return False
    now = now or datetime.now(timezone.utc)
    if settings.last_backup_at is None:
        return True
    last = settings.last_backup_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now - last >= timedelta(days=_FREQUENCY_DAYS[settings.frequency])


def run_backup(db: Session, settings: OneDriveBackupSettings) -> None:
    """Runs one upload+retention cycle, recording success/failure on
    `settings` rather than raising — both the manual "Backup Now" and the
    scheduler endpoint call this and always want a clean response. Writes
    last_backup_at *before* doing any Graph work so a concurrent/duplicate
    scheduler call sees the run as already claimed (see is_backup_due)."""
    settings.last_backup_at = datetime.now(timezone.utc)
    db.commit()
    try:
        if not settings.folder_path:
            raise OneDriveError("No OneDrive folder configured")
        access_token = get_valid_access_token(db, settings)
        ensure_folder(access_token, settings.folder_path)
        filename = f"myfinance-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.zip"
        content = backup_module.export_to_zip_bytes(db)
        upload_backup(access_token, settings.folder_path, filename, content)
        apply_retention(access_token, settings.folder_path, settings.retention_count)
        settings.last_backup_status = "success"
        settings.last_backup_error = None
    except Exception as exc:
        settings.last_backup_status = "failed"
        settings.last_backup_error = str(exc)
    db.commit()


def disconnect(db: Session, settings: OneDriveBackupSettings) -> None:
    settings.connected = False
    settings.account_email = None
    settings.access_token_encrypted = None
    settings.refresh_token_encrypted = None
    settings.token_expires_at = None
    db.commit()


def verify_scheduler_secret(provided: str | None) -> bool:
    expected = os.environ.get("ONEDRIVE_SCHEDULER_SECRET")
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)
