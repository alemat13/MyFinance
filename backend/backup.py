import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Literal

from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

import account_totals
import cache_service
from database import Base
from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight, AccountSplitWeight, TransactionSplit, TransactionHistory,
    BankConnection, BankAccountLink, CategorizerModel, OneDriveBackupSettings, TransactionRule,
    SavedFilter,
)
from schemas import (
    DatabaseExport, ImportSummary,
    UserExport, AccountExport, CategoryExport, AccountUserExport,
    CategorySplitExport, GlobalSplitWeightExport, AccountSplitWeightExport, TransactionExport,
    TransactionSplitExport, TransactionHistoryExport,
    BankConnectionExport, BankAccountLinkExport, TransactionRuleExport,
    SavedFilterExport,
)

SCHEMA_VERSION = 1
ZIP_ENTRY_NAME = "backup.json"

# Tables with a single-column integer PK whose Postgres sequence needs
# resyncing after an import inserts explicit id values.
_SERIAL_PK_TABLES = [
    "users", "accounts", "categories", "transactions", "transaction_history",
    "bank_connections", "bank_account_links", "transaction_rules",
    "saved_filters",
]

# Survive an overwrite restore untouched, and are never in an archive. The
# OneDrive connection is app configuration, not data (its refresh token opens
# the very drive the archives are uploaded to). A trained categorizer model is
# derived data: several megabytes of pickle that retraining rebuilds in
# seconds, so carrying it in every archive would cost more than it saves —
# but dropping it on a restore would silently throw away the active model, so
# it is kept where it is. No FK points at either, so leaving them out of
# the overwrite restore's wipe is safe.
_PRESERVED_ON_OVERWRITE = {OneDriveBackupSettings.__tablename__, CategorizerModel.__tablename__}


class BackupFormatError(ValueError):
    """Raised when an uploaded backup file is malformed or incompatible."""


def _export_accounts(db: Session) -> list[AccountExport]:
    """`accounts.balance` in the archive is the account's balance as displayed
    (offset + transaction total), not the stored offset — so an archive keeps
    meaning the same thing to a reader, and `import_database` can re-derive
    the offset against whatever transactions come back with it."""
    totals = dict(account_totals.compute_transaction_totals(db))
    return [
        AccountExport(
            id=a.id,
            name=a.name,
            type=a.type,
            balance=account_totals.account_balance(a, totals.get(a.id, 0.0)),
            currency=a.currency,
            created_at=a.created_at,
            archived=a.archived,
        )
        for a in db.query(Account).all()
    ]


def build_export(db: Session) -> DatabaseExport:
    return DatabaseExport(
        schema_version=SCHEMA_VERSION,
        exported_at=datetime.now(timezone.utc),
        users=[UserExport.model_validate(u) for u in db.query(User).all()],
        accounts=_export_accounts(db),
        categories=[CategoryExport.model_validate(c) for c in db.query(Category).all()],
        account_users=[AccountUserExport.model_validate(au) for au in db.query(AccountUser).all()],
        category_splits=[CategorySplitExport.model_validate(cs) for cs in db.query(CategorySplit).all()],
        global_split_weights=[GlobalSplitWeightExport.model_validate(w) for w in db.query(GlobalSplitWeight).all()],
        account_split_weights=[AccountSplitWeightExport.model_validate(w) for w in db.query(AccountSplitWeight).all()],
        transactions=[TransactionExport.model_validate(t) for t in db.query(Transaction).all()],
        transaction_splits=[TransactionSplitExport.model_validate(s) for s in db.query(TransactionSplit).all()],
        transaction_history=[TransactionHistoryExport.model_validate(h) for h in db.query(TransactionHistory).all()],
        bank_connections=[BankConnectionExport.model_validate(c) for c in db.query(BankConnection).all()],
        bank_account_links=[BankAccountLinkExport.model_validate(l) for l in db.query(BankAccountLink).all()],
        transaction_rules=[TransactionRuleExport.model_validate(r) for r in db.query(TransactionRule).all()],
        saved_filters=[SavedFilterExport.model_validate(f) for f in db.query(SavedFilter).all()],
    )


def export_to_zip_bytes(db: Session) -> bytes:
    export = build_export(db)
    payload = json.dumps(export.model_dump(mode="json"))
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(ZIP_ENTRY_NAME, payload)
    return buffer.getvalue()


def parse_zip_bytes(content: bytes) -> DatabaseExport:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            raw = zf.read(ZIP_ENTRY_NAME)
    except zipfile.BadZipFile:
        raise BackupFormatError("File is not a valid zip archive")
    except KeyError:
        raise BackupFormatError(f"Zip archive does not contain '{ZIP_ENTRY_NAME}'")

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise BackupFormatError(f"Backup entry is not valid JSON: {exc}")

    try:
        data = DatabaseExport.model_validate(parsed)
    except ValidationError as exc:
        raise BackupFormatError(f"Backup payload does not match the expected format: {exc}")

    if data.schema_version != SCHEMA_VERSION:
        raise BackupFormatError(
            f"Unsupported backup schema version {data.schema_version} (expected {SCHEMA_VERSION})"
        )
    return data


def _validate_referential_integrity(data: DatabaseExport) -> None:
    """Overwrite-mode-only pre-check: reject a payload with dangling FK
    references with a readable 422 before anything is written. The restore
    itself is one transaction, so a reference this misses still rolls back
    rather than leaving the database half-written."""
    user_ids = {u.id for u in data.users}
    account_ids = {a.id for a in data.accounts}
    category_ids = {c.id for c in data.categories}
    transaction_ids = {t.id for t in data.transactions}

    def _check(label: str, value: int, valid: set[int]):
        if value not in valid:
            raise BackupFormatError(f"{label} {value} has no matching row in the backup payload")

    for c in data.categories:
        if c.parent_id is not None:
            _check("categories.parent_id", c.parent_id, category_ids)
    for au in data.account_users:
        _check("account_users.account_id", au.account_id, account_ids)
        _check("account_users.user_id", au.user_id, user_ids)
    for cs in data.category_splits:
        _check("category_splits.category_id", cs.category_id, category_ids)
        _check("category_splits.user_id", cs.user_id, user_ids)
    for w in data.global_split_weights:
        _check("global_split_weights.user_id", w.user_id, user_ids)
    for w in data.account_split_weights:
        _check("account_split_weights.account_id", w.account_id, account_ids)
        _check("account_split_weights.user_id", w.user_id, user_ids)
    for t in data.transactions:
        _check("transactions.account_id", t.account_id, account_ids)
        if t.category_id is not None:
            _check("transactions.category_id", t.category_id, category_ids)
    for s in data.transaction_splits:
        _check("transaction_splits.transaction_id", s.transaction_id, transaction_ids)
        _check("transaction_splits.user_id", s.user_id, user_ids)
    connection_ids = {c.id for c in data.bank_connections or []}
    for link in data.bank_account_links or []:
        _check("bank_account_links.connection_id", link.connection_id, connection_ids)
        if link.account_id is not None:
            _check("bank_account_links.account_id", link.account_id, account_ids)


def _reset_postgres_sequences(bind) -> None:
    with bind.connect() as conn:
        for table in _SERIAL_PK_TABLES:
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
            ))
        conn.commit()


def import_database(db: Session, data: DatabaseExport, mode: Literal["overwrite", "partial"]) -> ImportSummary:
    if mode == "partial":
        return import_partial(db, data)

    bind = db.get_bind()
    _validate_referential_integrity(data)
    # Only creates tables that don't exist yet (a fresh local database); an
    # existing table, and the schema Alembic gave it, is left as it is.
    Base.metadata.create_all(bind=bind)

    # The wipe and the reinsert are one transaction: rows are deleted, not
    # tables dropped, so a failure anywhere below rolls back to the data as it
    # was. Dropping tables first used to commit the wipe on its own, and any
    # insert that then failed left the database empty.
    tables = [t for t in Base.metadata.sorted_tables if t.name not in _PRESERVED_ON_OVERWRITE]
    ImportSession = sessionmaker(bind=bind)
    session = ImportSession()
    try:
        for table in reversed(tables):
            session.execute(table.delete())
        session.add_all(User(**u.model_dump()) for u in data.users)
        archived_totals: dict[int, float] = {}
        for t in data.transactions:
            archived_totals[t.account_id] = archived_totals.get(t.account_id, 0.0) + t.amount
        session.add_all(
            Account(
                **a.model_dump(exclude={"balance"}),
                balance_offset=round(a.balance - archived_totals.get(a.id, 0.0), 2),
            )
            for a in data.accounts
        )
        # Top-level categories before subcategories: parent_id is a
        # self-referential FK checked immediately on insert.
        ordered_categories = sorted(data.categories, key=lambda c: c.parent_id is not None)
        session.add_all(Category(**c.model_dump()) for c in ordered_categories)
        session.flush()

        session.add_all(AccountUser(**au.model_dump()) for au in data.account_users)
        session.add_all(CategorySplit(**cs.model_dump()) for cs in data.category_splits)
        session.add_all(GlobalSplitWeight(**w.model_dump()) for w in data.global_split_weights)
        session.add_all(AccountSplitWeight(**w.model_dump()) for w in data.account_split_weights)
        session.flush()

        # Restoring an already-valid snapshot, not fresh user input, so this
        # bypasses the app-level ownership/split-percentage validators —
        # same as seed.py already does.
        session.add_all(Transaction(**t.model_dump()) for t in data.transactions)
        session.flush()

        session.add_all(TransactionSplit(**s.model_dump()) for s in data.transaction_splits)
        session.add_all(TransactionHistory(**h.model_dump()) for h in data.transaction_history)
        # An archive that predates these sections (None) restores with no
        # bank connected.
        bank_connections = data.bank_connections or []
        bank_account_links = data.bank_account_links or []
        session.add_all(BankConnection(**c.model_dump()) for c in bank_connections)
        session.flush()
        session.add_all(BankAccountLink(**l.model_dump()) for l in bank_account_links)
        transaction_rules = data.transaction_rules or []
        session.add_all(
            TransactionRule(**r.model_dump(exclude_none=True)) for r in transaction_rules
        )
        saved_filters = data.saved_filters or []
        session.add_all(SavedFilter(**f.model_dump(exclude_none=True)) for f in saved_filters)
        # Bulk restore bypasses every per-site invalidation by design. A no-op
        # here in practice (the wipe above already emptied the table), kept so
        # the restore stays correct if that ever changes.
        cache_service.invalidate_all(session)
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()

    if bind.dialect.name == "postgresql":
        _reset_postgres_sequences(bind)

    return ImportSummary(
        mode=mode,
        users=len(data.users),
        accounts=len(data.accounts),
        categories=len(data.categories),
        account_users=len(data.account_users),
        category_splits=len(data.category_splits),
        global_split_weights=len(data.global_split_weights),
        account_split_weights=len(data.account_split_weights),
        transactions=len(data.transactions),
        transaction_splits=len(data.transaction_splits),
        transaction_history=len(data.transaction_history),
        bank_connections=len(bank_connections),
        bank_account_links=len(bank_account_links),
        transaction_rules=len(transaction_rules),
        saved_filters=len(saved_filters),
    )


def import_partial(db: Session, data: DatabaseExport) -> ImportSummary:
    """Admin-mode "partial" restore: appends the archive's accounts, categories
    and transactions next to what is already there, every one under a fresh
    auto-increment id (the archive's own ids are only used to match rows to
    each other). An account or category id referenced by a transaction (or a
    category's parent_id) resolves first to a row of the archive, recreated
    here, otherwise to an existing row with that id; if neither exists the
    whole restore is refused before anything is written.

    Also carried, remapped: each transaction's own split (its users must
    already exist), the ownership and split weights of the recreated accounts
    and categories, and the history of the restored transactions. Users,
    global weights and bank connections are never touched.

    Category names are unique, so an archive category whose name already
    exists here is not recreated: its rows are filed under the existing
    category of that name, whose own split weights are left as they are.
    Without that, restoring any real export (which carries every category)
    would always fail."""
    existing_account_ids = {row[0] for row in db.query(Account.id).all()}
    existing_category_ids = {row[0] for row in db.query(Category.id).all()}
    existing_user_ids = {row[0] for row in db.query(User.id).all()}
    existing_category_by_name = {name: cid for cid, name in db.query(Category.id, Category.name).all()}
    reused_categories = {c.id: existing_category_by_name[c.name] for c in data.categories if c.name in existing_category_by_name}
    archive_account_ids = {a.id for a in data.accounts}
    archive_category_ids = {c.id for c in data.categories}
    archive_transaction_ids = {t.id for t in data.transactions}

    def _resolves(label: str, value: int, archive_ids: set[int], existing_ids: set[int]) -> None:
        if value not in archive_ids and value not in existing_ids:
            raise BackupFormatError(
                f"{label} {value} matches no row in the archive nor in the database; nothing was restored"
            )

    def _user_exists(label: str, value: int) -> None:
        if value not in existing_user_ids:
            raise BackupFormatError(f"{label} {value} is not an existing user; nothing was restored")

    for c in data.categories:
        if c.parent_id is not None:
            _resolves("categories.parent_id", c.parent_id, archive_category_ids, existing_category_ids)
    for t in data.transactions:
        _resolves("transactions.account_id", t.account_id, archive_account_ids, existing_account_ids)
        if t.category_id is not None:
            _resolves("transactions.category_id", t.category_id, archive_category_ids, existing_category_ids)
    for s in data.transaction_splits:
        if s.transaction_id not in archive_transaction_ids:
            raise BackupFormatError(
                f"transaction_splits.transaction_id {s.transaction_id} has no matching transaction in the archive; "
                "nothing was restored"
            )
        _user_exists("transaction_splits.user_id", s.user_id)
    account_users = [au for au in data.account_users if au.account_id in archive_account_ids]
    account_split_weights = [w for w in data.account_split_weights if w.account_id in archive_account_ids]
    category_splits = [
        cs for cs in data.category_splits
        if cs.category_id in archive_category_ids and cs.category_id not in reused_categories
    ]
    for au in account_users:
        _user_exists("account_users.user_id", au.user_id)
    for w in account_split_weights:
        _user_exists("account_split_weights.user_id", w.user_id)
    for cs in category_splits:
        _user_exists("category_splits.user_id", cs.user_id)
    history = [h for h in data.transaction_history if h.transaction_id in archive_transaction_ids]

    # Bank ids keep a later sync from re-importing a row; the unique index on
    # (account_id, external_id) would reject a restored row whose bank id an
    # existing account already holds, so say which up front.
    restored_external = {
        (t.account_id, t.external_id) for t in data.transactions
        if t.external_id is not None and t.account_id not in archive_account_ids
    }
    if restored_external:
        clash_accounts = {account_id for account_id, _ in restored_external}
        existing_external = {
            (account_id, external_id) for account_id, external_id in
            db.query(Transaction.account_id, Transaction.external_id)
            .filter(Transaction.account_id.in_(clash_accounts), Transaction.external_id.isnot(None))
            .all()
        }
        clashes = sorted(restored_external & existing_external)
        if clashes:
            raise BackupFormatError(
                f"{len(clashes)} transaction(s) of the archive are already on their account with the same bank id "
                f"(first: account {clashes[0][0]}, bank id {clashes[0][1]}); nothing was restored"
            )

    archived_totals: dict[int, float] = {}
    for t in data.transactions:
        archived_totals[t.account_id] = archived_totals.get(t.account_id, 0.0) + t.amount

    try:
        account_map: dict[int, int] = {}
        for a in data.accounts:
            account = Account(
                **a.model_dump(exclude={"id", "balance"}),
                balance_offset=round(a.balance - archived_totals.get(a.id, 0.0), 2),
            )
            db.add(account)
            db.flush()
            account_map[a.id] = account.id

        def _account(old_id: int) -> int:
            return account_map.get(old_id, old_id)

        category_map: dict[int, int] = dict(reused_categories)

        def _category(old_id: int | None) -> int | None:
            return None if old_id is None else category_map.get(old_id, old_id)

        # Parents first: a recreated child must point at its parent's new id.
        for c in sorted(data.categories, key=lambda c: c.parent_id in archive_category_ids):
            if c.id in reused_categories:
                continue
            category = Category(**c.model_dump(exclude={"id", "parent_id"}), parent_id=_category(c.parent_id))
            db.add(category)
            db.flush()
            category_map[c.id] = category.id

        db.add_all(
            AccountUser(**au.model_dump(exclude={"account_id"}), account_id=_account(au.account_id))
            for au in account_users
        )
        db.add_all(
            AccountSplitWeight(**w.model_dump(exclude={"account_id"}), account_id=_account(w.account_id))
            for w in account_split_weights
        )
        db.add_all(
            CategorySplit(**cs.model_dump(exclude={"category_id"}), category_id=_category(cs.category_id))
            for cs in category_splits
        )

        # One flush for the lot (ids come back in insertion order), since an
        # archive can carry the whole ledger.
        new_transactions = [
            Transaction(
                **t.model_dump(exclude={"id", "account_id", "category_id", "divide_group_id"}),
                account_id=_account(t.account_id),
                category_id=_category(t.category_id),
            )
            for t in data.transactions
        ]
        db.add_all(new_transactions)
        db.flush()
        transaction_map = {t.id: new.id for t, new in zip(data.transactions, new_transactions)}
        # A divide group is named after its anchor's id; one whose anchor
        # isn't in the archive no longer has anything to point at.
        for t, new in zip(data.transactions, new_transactions):
            if t.divide_group_id is not None:
                new.divide_group_id = transaction_map.get(t.divide_group_id)

        db.add_all(
            TransactionSplit(**s.model_dump(exclude={"transaction_id"}), transaction_id=transaction_map[s.transaction_id])
            for s in data.transaction_splits
        )
        # History snapshots point at the restored rows' new ids; an account or
        # category id the archive doesn't recreate is kept as it was, like the
        # transactions themselves.
        db.add_all(
            TransactionHistory(
                **h.model_dump(exclude={"id", "transaction_id", "account_id", "category_id", "changed_by_user_id"}),
                transaction_id=transaction_map[h.transaction_id],
                account_id=None if h.account_id is None else _account(h.account_id),
                category_id=_category(h.category_id),
                changed_by_user_id=h.changed_by_user_id if h.changed_by_user_id in existing_user_ids else None,
            )
            for h in history
        )
        cache_service.invalidate_all(db)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return ImportSummary(
        mode="partial",
        users=0,
        accounts=len(data.accounts),
        categories=len(data.categories) - len(reused_categories),
        account_users=len(account_users),
        category_splits=len(category_splits),
        global_split_weights=0,
        account_split_weights=len(account_split_weights),
        transactions=len(data.transactions),
        transaction_splits=len(data.transaction_splits),
        transaction_history=len(history),
    )
