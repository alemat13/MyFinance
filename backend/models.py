from datetime import datetime, date

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, ForeignKey, JSON, Boolean, Index, LargeBinary
from sqlalchemy.orm import relationship

from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    # Internal: the displayed balance is this plus the sum of the account's
    # transaction amounts (see account_totals.py). Never exposed by the API —
    # AccountOut.balance is the computed total, not this column.
    balance_offset = Column(Float, default=0.0)
    currency = Column(String(3), nullable=False, default="EUR")
    created_at = Column(DateTime, default=datetime.utcnow)
    archived = Column(Boolean, nullable=False, default=False)

    transactions = relationship("Transaction", back_populates="account")
    user_associations = relationship("AccountUser", back_populates="account", cascade="all, delete-orphan")
    split_weight_associations = relationship("AccountSplitWeight", back_populates="account", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(String(50), nullable=False)
    color = Column(String(7), nullable=True)
    icon = Column(String(50), nullable=True)
    # Self-referential FK for a strict 2-level hierarchy: a category with
    # parent_id set is a subcategory, and its parent must itself have no
    # parent (enforced in rules.py, not at the DB level).
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True, index=True)

    transactions = relationship("Transaction", back_populates="category")
    splits = relationship("CategorySplit", back_populates="category", cascade="all, delete-orphan")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False, index=True)
    payee = Column(String(200), nullable=False)
    memo = Column(Text, nullable=True)
    amount = Column(Float, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"), index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), index=True)
    # Months relative to `date` this transaction should be accounted in, e.g.
    # -1 = the month before date's month. 0 (default) = same month as date.
    accounting_month_offset = Column(Integer, nullable=False, default=0)
    # Manually set by the user once they've reviewed the transaction; never
    # set by create/import — those always default to unreconciled.
    reconciled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    # Groups the transactions produced by "dividing" one transaction into
    # several (by category/date/amount — unrelated to TransactionSplit, which
    # divides a transaction's amount among users). Set to the anchor part's
    # own id on every row in the group, including the anchor itself. A plain
    # Integer, NOT a ForeignKey: unlike TransactionHistory's similar fields,
    # this is about avoiding delete failures when a sibling is deleted while
    # others in the group still reference the anchor's id.
    divide_group_id = Column(Integer, nullable=True, index=True)
    # The group of linked transactions this one belongs to, if any (see
    # TransactionLink): a transfer's two sides, an expense and its refunds.
    # At most one group per transaction.
    link_id = Column(Integer, ForeignKey("transaction_links.id", ondelete="SET NULL"), nullable=True, index=True)
    # The identifier the bank gave this transaction, for rows pulled in by
    # bank sync (see enable_banking.py) — an ASPSP's own entry_reference /
    # transaction_id, or a locally derived "fp:" fingerprint when the bank
    # supplies neither. NULL for everything else (manual entry, CSV import,
    # divide parts, the migrated history), which is why the uniqueness index
    # below is safe: both SQLite and Postgres allow any number of NULLs in a
    # unique index. Scoped per account, not globally: two banks are free to
    # hand out the same reference.
    external_id = Column(String(120), nullable=True)

    # ── Raw, read-only fields as the source reported them ──────────────
    # Never edited through the API (they're absent from TransactionCreate /
    # TransactionUpdate on purpose) and never used in any computation: they
    # exist so the original wording survives whatever the user renames the
    # transaction to, which is what makes categorisation and rename
    # suggestions trainable on real history rather than on already-cleaned
    # labels.
    #
    # Three sources fill the same columns: Enable Banking for newly synced
    # rows (enable_banking.py), CSV import (routers/imports.py, raw_label
    # only: the file's own payee) and the Linxo GDPR export for the migrated
    # history. raw_source says which, because the vocabularies differ —
    # raw_transaction_code is an ISO 20022 code from a bank and a Linxo
    # transaction type from the export, and nothing can tell them apart
    # from the value alone.
    raw_source = Column(String(20), nullable=True)  # 'enable_banking' | 'csv_import' | 'linxo_export'
    raw_label = Column(Text, nullable=True)
    raw_counterparty = Column(String(200), nullable=True)
    raw_transaction_code = Column(String(60), nullable=True)
    raw_merchant_category_code = Column(String(10), nullable=True)
    raw_merchant_location = Column(String(120), nullable=True)
    # When the purchase actually happened, as opposed to when the bank
    # booked it — a card payment is routinely booked several days later.
    raw_initiated_date = Column(Date, nullable=True)
    raw_booking_date = Column(Date, nullable=True)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    splits = relationship("TransactionSplit", back_populates="transaction", cascade="all, delete-orphan")
    # Free labels, several per transaction and shared by many (see Tag).
    tags = relationship("Tag", secondary="transaction_tags", order_by="Tag.name")

    __table_args__ = (
        Index("ix_transactions_account_id_date", "account_id", "date"),
        Index("ix_transactions_account_id_external_id", "account_id", "external_id", unique=True),
    )


class TransactionLink(Base):
    """A group of transactions that belong together although each stays its
    own row: the two sides of a transfer between accounts, a health expense
    and its refunds, a shared expense and what the others paid back. Unlike a
    divide group, nothing is split or created; the members are linked so the
    detail panel can list them with their net. Means nothing to balances,
    charts or splits. Always at least two members: a link left with fewer is
    deleted (transaction_links.prune())."""
    __tablename__ = "transaction_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Tag(Base):
    """A free label on transactions, many-to-many through transaction_tags:
    a transaction carries any number of tags and a tag any number of
    transactions. Unlike a category it means nothing to balances, charts or
    splits; it only groups rows for searching (a trip, a project, a refund
    to chase). Names are unique, compared as typed."""
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class TransactionTag(Base):
    """One tag on one transaction. Written through Transaction.tags; mapped
    as its own class so a backup can read and restore the pairs directly."""
    __tablename__ = "transaction_tags"

    transaction_id = Column(Integer, ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True, index=True)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account_associations = relationship("AccountUser", back_populates="user")


class AccountUser(Base):
    __tablename__ = "account_users"

    account_id = Column(Integer, ForeignKey("accounts.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    ownership_percentage = Column(Float, nullable=False, default=0.0)

    account = relationship("Account", back_populates="user_associations")
    user = relationship("User", back_populates="account_associations")

    __table_args__ = (
        Index("ix_account_users_user_id_ownership_percentage", "user_id", "ownership_percentage"),
    )


class CategorySplit(Base):
    __tablename__ = "category_splits"

    category_id = Column(Integer, ForeignKey("categories.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    # Relative integer weight, not a percentage — no sum-to-100 requirement.
    # Middle-priority tier: used only to prefill a transaction's own weights.
    weight = Column(Integer, nullable=False, default=0)

    category = relationship("Category", back_populates="splits")
    user = relationship("User")


class GlobalSplitWeight(Base):
    __tablename__ = "global_split_weights"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    # Lowest-priority tier: used only to prefill a transaction's own weights.
    weight = Column(Integer, nullable=False, default=0)

    user = relationship("User")


class AccountSplitWeight(Base):
    __tablename__ = "account_split_weights"

    account_id = Column(Integer, ForeignKey("accounts.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    # Highest-priority tier: used only to prefill a transaction's own weights.
    # Entirely separate from AccountUser.ownership_percentage.
    weight = Column(Integer, nullable=False, default=0)

    account = relationship("Account", back_populates="split_weight_associations")
    user = relationship("User")


class TransactionSplit(Base):
    __tablename__ = "transaction_splits"

    transaction_id = Column(Integer, ForeignKey("transactions.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True, index=True)
    # The integer weight this transaction stores for this user — freely
    # typed by the client, or bulk-filled from a tier via a quick-access
    # button. Never re-resolved from current tier config after the fact.
    weight = Column(Integer, nullable=False, default=0)
    # Derived from weight + the transaction's current amount, recomputed and
    # persisted on every create/update. Never directly client-editable.
    share_amount = Column(Float, nullable=False)
    # Which tier/button produced the current weight set.
    source = Column(String(20), nullable=False)  # 'global' | 'account' | 'category' | 'custom'

    transaction = relationship("Transaction", back_populates="splits")
    user = relationship("User")


class AggregateCache(Base):
    """Generic store for precomputed aggregate results (see cache_service.py).

    cache_key encodes both namespace and params ("balances:user_id=3"), so a
    lookup is a single PK read; namespace is duplicated into its own indexed
    column purely so invalidation can target every key in a namespace without
    a LIKE scan.
    """
    __tablename__ = "aggregate_cache"

    cache_key = Column(String, primary_key=True)
    namespace = Column(String, nullable=False, index=True)
    payload = Column(Text, nullable=False)
    computed_at = Column(DateTime, default=datetime.utcnow, nullable=False)


class CategorizerModel(Base):
    """One trained category-suggestion model (see categorizer.py).

    The fitted model lives in `blob` as a gzipped pickle, in the database
    rather than on disk or in process memory for the same reason
    aggregate_cache does: the backend runs several Cloud Run instances, and an
    instance that did not serve the training request still has to answer
    suggestions from the same model. A blob is a few megabytes.

    Several rows are kept so a model that turns out worse than its predecessor
    can be rolled back; at most one is `is_active`, and that is the one
    suggestions use. `status` is "training" while a fit is in flight, which is
    also the lock that keeps two fits from running at once — one fit peaks
    around 360 MB in a 1 GiB instance, so two would risk the whole service.
    `metrics` holds what the fit scored on its test selection, including the
    naive baseline it was compared against, so the numbers behind an
    activation decision stay auditable after the fact.
    """
    __tablename__ = "categorizer_models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    status = Column(String(20), nullable=False, default="ready")  # 'training' | 'ready' | 'failed'
    is_active = Column(Boolean, nullable=False, default=False)
    trained_rows = Column(Integer, nullable=False, default=0)
    tested_rows = Column(Integer, nullable=False, default=0)
    note = Column(String(200), nullable=True)
    params = Column(JSON, nullable=True)
    metrics = Column(JSON, nullable=True)
    error = Column(Text, nullable=True)
    blob = Column(LargeBinary, nullable=True)


class OneDriveBackupSettings(Base):
    """Single global connection (one OneDrive account for the whole
    household DB, not per-user) driving scheduled backup uploads — see
    onedrive.py. Always exactly one row, id=1 (get_or_create'd there).
    Token columns are Fernet-encrypted at rest and never serialized by the
    API (see schemas.OneDriveSettingsOut)."""
    __tablename__ = "onedrive_backup_settings"

    id = Column(Integer, primary_key=True)
    connected = Column(Boolean, nullable=False, default=False)
    account_email = Column(String, nullable=True)
    folder_path = Column(String, nullable=True)
    # Grandfather-father-son retention (see onedrive.select_backups_to_keep):
    # how many days, ISO weeks, months and years keep their newest backup.
    keep_daily = Column(Integer, nullable=False, default=8)
    keep_weekly = Column(Integer, nullable=False, default=5)
    keep_monthly = Column(Integer, nullable=False, default=13)
    keep_yearly = Column(Integer, nullable=False, default=10)
    access_token_encrypted = Column(Text, nullable=True)
    refresh_token_encrypted = Column(Text, nullable=True)
    token_expires_at = Column(DateTime, nullable=True)
    last_backup_at = Column(DateTime, nullable=True)
    last_backup_status = Column(String(20), nullable=True)  # 'success' | 'failed'
    last_backup_error = Column(Text, nullable=True)


class BankConnection(Base):
    """One granted consent with one bank (ASPSP), obtained through Enable
    Banking — see enable_banking.py. A connection is created in 'pending'
    state before the user is redirected to their bank, and only becomes
    'linked' when they come back through the callback with an authorization
    code. Unlike OneDriveBackupSettings there can be several rows at once:
    one per bank, since a consent is granted per bank.

    No access/refresh token is stored: Enable Banking authenticates *us* with
    a JWT signed on the fly from ENABLE_BANKING_PRIVATE_KEY, and session_id
    is only an identifier, useless to anyone without that key.
    """
    __tablename__ = "bank_connections"

    id = Column(Integer, primary_key=True, autoincrement=True)
    aspsp_name = Column(String(100), nullable=False)
    aspsp_country = Column(String(2), nullable=False, default="FR")
    # Random nonce round-tripped through the bank's consent screen, so the
    # callback can tell which pending connection it is completing.
    state = Column(String(64), nullable=False, index=True)
    authorization_id = Column(String(64), nullable=True)
    session_id = Column(String(64), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # 'pending' | 'linked' | 'expired' | 'error'
    # When the bank's consent lapses (90 days for most French ASPSPs).
    # Re-consenting is a fresh authorization, not a token refresh.
    access_valid_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    last_error = Column(Text, nullable=True)

    account_links = relationship("BankAccountLink", back_populates="connection", cascade="all, delete-orphan")


class BankAccountLink(Base):
    """One account exposed by a BankConnection, and the MyFinance account it
    feeds. Kept out of `accounts` on purpose: a remote account exists (and is
    listed in the UI) before anyone decides where it goes, and re-consenting
    to the same bank yields brand-new remote uids for the same real accounts,
    so the mapping has to survive being re-pointed.
    """
    __tablename__ = "bank_account_links"

    id = Column(Integer, primary_key=True, autoincrement=True)
    connection_id = Column(Integer, ForeignKey("bank_connections.id"), nullable=False, index=True)
    remote_account_uid = Column(String(64), nullable=False)
    iban = Column(String(50), nullable=True)
    remote_name = Column(String(200), nullable=True)
    currency = Column(String(3), nullable=True)
    # NULL until the user picks which MyFinance account this feeds; nothing
    # is ever imported while it is NULL or sync_enabled is false.
    account_id = Column(Integer, ForeignKey("accounts.id"), nullable=True, index=True)
    sync_enabled = Column(Boolean, nullable=False, default=True)
    # The first sync never reaches back past this date. Defaults to the day
    # the link is mapped, so connecting a bank doesn't re-import years of
    # history that already came in through the CSV/migration path.
    sync_from_date = Column(Date, nullable=True)
    last_synced_at = Column(DateTime, nullable=True)
    last_sync_status = Column(String(20), nullable=True)  # 'success' | 'failed'
    last_sync_error = Column(Text, nullable=True)
    last_imported_count = Column(Integer, nullable=False, default=0)

    connection = relationship("BankConnection", back_populates="account_links")
    account = relationship("Account")


class TransactionHistory(Base):
    __tablename__ = "transaction_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Deliberately a plain Integer, NOT a ForeignKey: database.py enables
    # PRAGMA foreign_keys=ON, and delete_transaction() hard-deletes the
    # Transaction row. A real FK would either raise IntegrityError on delete
    # (default NO ACTION) or, with ondelete="SET NULL", erase the very
    # linkage this table exists to preserve. Same reasoning applies to
    # changed_by_user_id (DELETE /api/users/{id} is a real hard delete too).
    transaction_id = Column(Integer, nullable=False, index=True)
    action = Column(String(20), nullable=False)  # 'created' | 'updated' | 'deleted'
    # 'manual' | 'csv_import' | 'bank_sync' (created only) | 'divide' (created or updated)
    # | 'admin' (raw fields edited) | 'rule' | 'categorizer' | 'bulk' (bulk edit or delete);
    # NULL on an edit made by hand in the transaction form.
    source = Column(String(20), nullable=True)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    # Shared by every row one action wrote (audit.batch()): a bulk edit, an
    # import, a sync. NULL on a row written alone, and on every row written
    # before batches existed (the History screen groups those by guesswork).
    batch_id = Column(String(32), nullable=True, index=True)
    changed_by_user_id = Column(Integer, nullable=True)

    # Snapshot of the transaction's core fields as of this event
    # (for 'deleted', the state immediately before removal).
    date = Column(Date, nullable=True)
    payee = Column(String(200), nullable=True)
    memo = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    account_id = Column(Integer, nullable=True)
    category_id = Column(Integer, nullable=True)
    accounting_month_offset = Column(Integer, nullable=True)

    # For 'updated' rows only: {field: {"old": ..., "new": ...}} for fields that actually changed.
    changes = Column(JSON, nullable=True)


class TransactionRule(Base):
    """One automatic rule: conditions to match and actions to apply (see
    transaction_rules.py).

    `conditions` is a list of the same condition objects the Transactions
    screen's advanced filter sends (`FilterCondition`), combined by
    `match_mode`, so a rule is expressed in filters the user already knows.
    `actions` is the subset of a bulk edit a rule may carry — never a delete
    or a move to another account, which stay hand-only. Rules run in
    `position` order, every matching one applying in turn, so a later rule
    wins on a field both set. Disabled rules never run on their own but can
    still be picked when applying rules to a selection by hand.
    """
    __tablename__ = "transaction_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    enabled = Column(Boolean, nullable=False, default=True)
    match_mode = Column(String(3), nullable=False, default="all")  # 'all' | 'any'
    conditions = Column(JSON, nullable=False)
    actions = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SavedFilter(Base):
    """A filter of the Transactions screen saved under a name, shown as a
    button next to Simple/Advanced.

    `mode` says which filter it was saved from and `filters` holds that
    filter exactly as the screen keeps it: the simple filter's fields
    (search, dates, account, category, amounts, reconciled), or the advanced
    filter's `match_mode` and condition rows. It is the screen's own state,
    replayed as is, never interpreted by the backend. One list for the whole
    household, like the rules, so a filter saved on the PC shows on the phone.
    """
    __tablename__ = "saved_filters"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    position = Column(Integer, nullable=False, default=0)
    mode = Column(String(10), nullable=False)  # 'simple' | 'advanced'
    filters = Column(JSON, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class EmailAlert(Base):
    """One user's email alert on new transactions (see email_alerts.py): at
    most one row per user, holding the address it goes to and which of the
    three frequencies are on. A transaction is "new" by its `created_at`, the
    moment it reached MyFinance (bank sync, import or by hand), not by its
    `date`, which a bank can report days late.

    `last_*_sent_at` is the end of the window the last alert of that
    frequency covered (naive UTC, like `transactions.created_at`): the next
    one starts there, so no transaction is reported twice or skipped. It only
    moves on a successful send, so a failed one is retried by the next
    scheduler call.
    """
    __tablename__ = "email_alerts"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    email = Column(String(200), nullable=True)
    daily = Column(Boolean, nullable=False, default=False)
    weekly = Column(Boolean, nullable=False, default=False)
    monthly = Column(Boolean, nullable=False, default=False)
    last_daily_sent_at = Column(DateTime, nullable=True)
    last_weekly_sent_at = Column(DateTime, nullable=True)
    last_monthly_sent_at = Column(DateTime, nullable=True)
    last_status = Column(String(20), nullable=True)  # 'success' | 'failed'
    last_error = Column(Text, nullable=True)
