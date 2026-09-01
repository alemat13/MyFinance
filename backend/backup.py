import io
import json
import zipfile
from datetime import datetime, timezone
from typing import Literal

from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session, sessionmaker

from database import Base
from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight, AccountSplitWeight, TransactionSplit, TransactionHistory,
)
from schemas import (
    DatabaseExport, ImportSummary,
    UserExport, AccountExport, CategoryExport, AccountUserExport,
    CategorySplitExport, GlobalSplitWeightExport, AccountSplitWeightExport, TransactionExport,
    TransactionSplitExport, TransactionHistoryExport,
)

SCHEMA_VERSION = 1
ZIP_ENTRY_NAME = "backup.json"

# Tables with a single-column integer PK whose Postgres sequence needs
# resyncing after an import inserts explicit id values.
_SERIAL_PK_TABLES = ["users", "accounts", "categories", "transactions", "transaction_history"]


class BackupFormatError(ValueError):
    """Raised when an uploaded backup file is malformed or incompatible."""


def build_export(db: Session) -> DatabaseExport:
    return DatabaseExport(
        schema_version=SCHEMA_VERSION,
        exported_at=datetime.now(timezone.utc),
        users=[UserExport.model_validate(u) for u in db.query(User).all()],
        accounts=[AccountExport.model_validate(a) for a in db.query(Account).all()],
        categories=[CategoryExport.model_validate(c) for c in db.query(Category).all()],
        account_users=[AccountUserExport.model_validate(au) for au in db.query(AccountUser).all()],
        category_splits=[CategorySplitExport.model_validate(cs) for cs in db.query(CategorySplit).all()],
        global_split_weights=[GlobalSplitWeightExport.model_validate(w) for w in db.query(GlobalSplitWeight).all()],
        account_split_weights=[AccountSplitWeightExport.model_validate(w) for w in db.query(AccountSplitWeight).all()],
        transactions=[TransactionExport.model_validate(t) for t in db.query(Transaction).all()],
        transaction_splits=[TransactionSplitExport.model_validate(s) for s in db.query(TransactionSplit).all()],
        transaction_history=[TransactionHistoryExport.model_validate(h) for h in db.query(TransactionHistory).all()],
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
    references before drop_all() runs, since DDL can't be rolled back
    together with a subsequent failed insert phase."""
    user_ids = {u.id for u in data.users}
    account_ids = {a.id for a in data.accounts}
    category_ids = {c.id for c in data.categories}
    transaction_ids = {t.id for t in data.transactions}

    def _check(label: str, value: int, valid: set[int]):
        if value not in valid:
            raise BackupFormatError(f"{label} {value} has no matching row in the backup payload")

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
        _check("transactions.category_id", t.category_id, category_ids)
    for s in data.transaction_splits:
        _check("transaction_splits.transaction_id", s.transaction_id, transaction_ids)
        _check("transaction_splits.user_id", s.user_id, user_ids)


def _reset_postgres_sequences(bind) -> None:
    with bind.connect() as conn:
        for table in _SERIAL_PK_TABLES:
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table}), 1))"
            ))
        conn.commit()


def import_database(db: Session, data: DatabaseExport, mode: Literal["overwrite", "append"]) -> ImportSummary:
    bind = db.get_bind()

    if mode == "overwrite":
        _validate_referential_integrity(data)
        Base.metadata.drop_all(bind=bind)
        Base.metadata.create_all(bind=bind)

    ImportSession = sessionmaker(bind=bind)
    session = ImportSession()
    try:
        session.add_all(User(**u.model_dump()) for u in data.users)
        session.add_all(Account(**a.model_dump()) for a in data.accounts)
        session.add_all(Category(**c.model_dump()) for c in data.categories)
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
    )
