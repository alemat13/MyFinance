"""OneDrive automatic backup, email alerts and bank sync."""
import re
from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .base import Schema, _DateType
from .backup import DatabaseExport


# ── OneDrive automatic backup connection ──────────────────────────
# A single global connection (see models.OneDriveBackupSettings); token
# columns are never exposed here.

class OneDriveSettingsOut(Schema):
    connected: bool
    account_email: str | None = None
    folder_path: str | None = None
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    keep_yearly: int
    last_backup_at: datetime | None = None
    last_backup_status: Literal["success", "failed"] | None = None
    last_backup_error: str | None = None
    model_config = ConfigDict(from_attributes=True)


class OneDriveSettingsUpdate(Schema):
    folder_path: str
    keep_daily: int
    keep_weekly: int
    keep_monthly: int
    keep_yearly: int


class OneDriveBackupRunResult(Schema):
    ran: bool
    status: Literal["success", "failed"] | None = None
    error: str | None = None


# ── Email alerts on new transactions ──────────────────────────────
# One row per user (see models.EmailAlert / email_alerts.py).

class EmailAlertOut(Schema):
    user_id: int
    email: str | None = None
    daily: bool
    weekly: bool
    monthly: bool
    last_daily_sent_at: datetime | None = None
    last_weekly_sent_at: datetime | None = None
    last_monthly_sent_at: datetime | None = None
    last_status: Literal["success", "failed"] | None = None
    last_error: str | None = None
    # Whether the server can send at all (SMTP_HOST set), so the screen can
    # say so instead of letting an alert be saved that never goes out.
    sending_configured: bool = False
    from_address: str = ""
    model_config = ConfigDict(from_attributes=True)


class EmailAlertUpdate(Schema):
    email: str | None = None
    daily: bool = False
    weekly: bool = False
    monthly: bool = False


class EmailAlertTestResult(Schema):
    sent_to: str
    transaction_count: int


class EmailAlertExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: str | None = None
    daily: bool = False
    weekly: bool = False
    monthly: bool = False
    last_daily_sent_at: datetime | None = None
    last_weekly_sent_at: datetime | None = None
    last_monthly_sent_at: datetime | None = None


# ── Bank sync (Enable Banking) ────────────────────────────────────────
# See enable_banking.py. Nothing here exposes a session id or any part of
# the signing key — the frontend only ever needs the consent URL.

class BankInstitutionOut(Schema):
    name: str
    country: str
    logo: str | None = None


class BankConnectionCreate(Schema):
    aspsp_name: str
    aspsp_country: str = "FR"
    language: str = "fr"


class BankConnectionCreated(Schema):
    connection_id: int
    authorization_url: str


class BankAccountLinkOut(Schema):
    id: int
    connection_id: int
    iban: str | None = None
    remote_name: str | None = None
    currency: str | None = None
    account_id: int | None = None
    account_name: str | None = None
    sync_enabled: bool
    sync_from_date: _DateType | None = None
    last_synced_at: datetime | None = None
    last_sync_status: Literal["success", "failed"] | None = None
    last_sync_error: str | None = None
    last_imported_count: int


class BankConnectionOut(Schema):
    id: int
    aspsp_name: str
    aspsp_country: str
    status: Literal["pending", "linked", "expired", "error"]
    access_valid_until: datetime | None = None
    created_at: datetime | None = None
    last_error: str | None = None
    accounts: List[BankAccountLinkOut] = []


class BankAccountLinkUpdate(Schema):
    account_id: int | None = None
    sync_enabled: bool = True
    sync_from_date: _DateType | None = None


class BankResyncRequest(Schema):
    date_from: _DateType
    date_to: _DateType


class BankSyncRunResult(Schema):
    ran: bool
    synced_links: int = 0
    created_count: int = 0
    status: Literal["success", "failed"] | None = None
    error: str | None = None


DatabaseExport.model_rebuild()
