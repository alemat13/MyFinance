"""Full database backup archive (export/import)."""

from datetime import datetime
from typing import Literal

from pydantic import ConfigDict, field_validator

from .base import Schema, _DateType
from .entities import normalize_category_type

# ── Full database backup (export/import) ─────────────────────────
# Raw-column schemas: unlike the *Out schemas above, these mirror each
# model's own columns exactly (ids and FK ids included, no joins), so a
# round-trip preserves the database precisely.


class UserExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None = None
    created_at: datetime


class AccountExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    balance: float
    currency: str
    created_at: datetime
    archived: bool = False


class CategoryExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    color: str | None = None
    icon: str | None = None
    parent_id: int | None = None

    @field_validator("type")
    @classmethod
    def _normalize_type(cls, value: str) -> str:
        # An archive written before Alembic 0020 can carry a free-text type.
        return normalize_category_type(value)


class AccountUserExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    user_id: int
    ownership_percentage: float


class CategorySplitExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    category_id: int
    user_id: int
    weight: int


class GlobalSplitWeightExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    weight: int


class AccountSplitWeightExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    account_id: int
    user_id: int
    weight: int


class TransactionExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: _DateType
    payee: str
    memo: str | None = None
    amount: float
    account_id: int
    category_id: int | None
    accounting_month_offset: int = 0
    reconciled: bool = False
    divide_group_id: int | None = None
    link_id: int | None = None
    # A checkpoint's typed value (its amount is stored as derived, so the
    # archive restores the same balances without recomputing anything).
    checkpoint_value: float | None = None
    # Carried through so a restore doesn't strip the bank identifiers that
    # keep a later sync from re-importing the same transactions. Defaulted,
    # so archives written before bank sync existed still validate.
    external_id: str | None = None
    # Same reasoning as external_id: a restore that dropped these would
    # silently undo a backfill nothing else can redo (the Linxo export is a
    # one-off file, not a feed). Defaulted, so older archives still validate.
    raw_source: str | None = None
    raw_label: str | None = None
    raw_counterparty: str | None = None
    raw_transaction_code: str | None = None
    raw_merchant_category_code: str | None = None
    raw_merchant_location: str | None = None
    raw_initiated_date: _DateType | None = None
    raw_booking_date: _DateType | None = None
    created_at: datetime


class TransactionSplitExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    user_id: int
    weight: int
    share_amount: float
    source: str


class TransactionHistoryExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transaction_id: int
    action: str
    source: str | None = None
    changed_at: datetime
    changed_by_user_id: int | None = None
    date: _DateType | None = None
    payee: str | None = None
    memo: str | None = None
    amount: float | None = None
    account_id: int | None = None
    category_id: int | None = None
    accounting_month_offset: int | None = None
    changes: dict | None = None
    batch_id: str | None = None


class BankConnectionExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    aspsp_name: str
    aspsp_country: str = "FR"
    state: str
    authorization_id: str | None = None
    session_id: str | None = None
    status: str = "pending"
    access_valid_until: datetime | None = None
    created_at: datetime | None = None
    last_error: str | None = None


class BankAccountLinkExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    connection_id: int
    remote_account_uid: str
    iban: str | None = None
    remote_name: str | None = None
    currency: str | None = None
    account_id: int | None = None
    sync_enabled: bool = True
    sync_from_date: _DateType | None = None
    last_synced_at: datetime | None = None
    last_sync_status: str | None = None
    last_sync_error: str | None = None
    last_imported_count: int = 0


class TransactionRuleExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int = 0
    enabled: bool = True
    match_mode: str = "all"
    conditions: list[dict]
    actions: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class TagExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None = None
    created_at: datetime | None = None


class TransactionLinkExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str | None = None
    created_at: datetime | None = None


class TransactionTagExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: int
    tag_id: int


class SavedFilterExport(Schema):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    position: int = 0
    mode: str
    filters: dict
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DatabaseExport(Schema):
    schema_version: int
    exported_at: datetime
    users: list[UserExport] = []
    accounts: list[AccountExport] = []
    categories: list[CategoryExport] = []
    account_users: list[AccountUserExport] = []
    category_splits: list[CategorySplitExport] = []
    global_split_weights: list[GlobalSplitWeightExport] = []
    account_split_weights: list[AccountSplitWeightExport] = []
    transactions: list[TransactionExport] = []
    transaction_splits: list[TransactionSplitExport] = []
    transaction_history: list[TransactionHistoryExport] = []
    # Bank sync (Enable Banking): the consent granted at each bank and the
    # mapping of each remote account onto a MyFinance account. `None` (an
    # archive written before these were exported) is not the same as `[]`:
    # see backup.import_database. The OneDrive connection is deliberately
    # never exported — it holds the refresh token of the very drive these
    # archives get uploaded to.
    bank_connections: list[BankConnectionExport] | None = None
    bank_account_links: list[BankAccountLinkExport] | None = None
    # Automatic rules (transaction_rules.py), restored in overwrite mode only:
    # their conditions and actions name account and category ids, which a
    # partial restore renumbers. `None` is an archive from before rules.
    transaction_rules: list[TransactionRuleExport] | None = None
    # Saved filters of the Transactions screen, same overwrite-only contract
    # as the rules (they name account and category ids). `None` is an archive
    # from before saved filters.
    saved_filters: list[SavedFilterExport] | None = None
    # Each user's email alert settings, same overwrite-only contract (a
    # partial restore doesn't recreate users). `None` is an archive from
    # before email alerts.
    email_alerts: list["EmailAlertExport"] | None = None  # noqa: F821 - resolved by model_rebuild()
    # Tags and which transactions carry them. Restored by both modes (a
    # partial restore reuses a tag of the same name). `None` is an archive
    # from before tags.
    tags: list[TagExport] | None = None
    transaction_tags: list[TransactionTagExport] | None = None
    # Groups of linked transactions (transactions.link_id names one).
    # Restored by both modes. `None` is an archive from before links.
    transaction_links: list[TransactionLinkExport] | None = None


class ImportSummary(Schema):
    mode: Literal["overwrite", "partial"]
    users: int
    accounts: int
    categories: int
    account_users: int
    category_splits: int
    global_split_weights: int
    account_split_weights: int
    transactions: int
    transaction_splits: int
    transaction_history: int
    bank_connections: int = 0
    bank_account_links: int = 0
    transaction_rules: int = 0
    saved_filters: int = 0
    email_alerts: int = 0
    tags: int = 0
    transaction_tags: int = 0
    transaction_links: int = 0
