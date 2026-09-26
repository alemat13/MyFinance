import csv
import io
import json
import unicodedata
from datetime import date, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from import_qif import QIF_DELIMITER, is_qif, qif_to_csv_text
from models import Account, Category, Transaction
from rules import RuleViolation
from schemas import ImportDetectResponse, ImportPreviewRequest, ImportPreviewRow, ImportPreviewSplitShare
from split_engine import prorate, resolve_default_weights

_ENCODINGS = ["utf-8-sig", "utf-8", "cp1252", "latin-1"]
_DATE_FORMATS = ["%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d"]
_SAMPLE_SIZE = 20
# No leading underscore: also imported by routers/imports.py to cap import_commit's payload.
MAX_IMPORT_ROWS = 5000

_MAPPING_CONFIG_PATH = Path(__file__).parent / "import_mapping_config.json"
_MAPPING_CONFIG: dict[str, list[str]] = json.loads(_MAPPING_CONFIG_PATH.read_text())


def normalize_header(raw: str) -> str:
    stripped = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    return stripped.strip().lower()


def detect_encoding(raw: bytes) -> tuple[str, str]:
    if raw.startswith(b"\xff\xfe") or raw.startswith(b"\xfe\xff"):
        return raw.decode("utf-16"), "utf-16"
    for encoding in _ENCODINGS:
        try:
            return raw.decode(encoding), encoding
        except UnicodeDecodeError:
            continue
    return raw.decode("latin-1"), "latin-1"


def sniff_delimiter(sample: str) -> str:
    try:
        return csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
    except csv.Error:
        return ","


def detect_column_mapping(headers: list[str]) -> dict[str, str | None]:
    normalized_headers = {normalize_header(h): h for h in headers}
    mapping: dict[str, str | None] = {}
    for field, aliases in _MAPPING_CONFIG.items():
        match = None
        for alias in aliases:
            if alias in normalized_headers:
                match = normalized_headers[alias]
                break
        mapping[field] = match
    return mapping


def detect_date_format(samples: list[str]) -> str | None:
    values = [s.strip() for s in samples if s and s.strip()]
    if not values:
        return None
    for fmt in _DATE_FORMATS:
        try:
            for v in values:
                datetime.strptime(v, fmt)
            return fmt
        except ValueError:
            continue
    return None


def detect_decimal_separator(samples: list[str]) -> str:
    for s in samples:
        cleaned = (s or "").strip()
        if "," in cleaned and "." not in cleaned:
            return ","
    return "."


def detect_import_settings(raw: bytes) -> ImportDetectResponse:
    text, encoding = detect_encoding(raw)
    file_format = "qif" if is_qif(text) else "csv"
    if file_format == "qif":
        text = qif_to_csv_text(text)
        delimiter = QIF_DELIMITER
    else:
        sample_text = "\n".join(text.splitlines()[: _SAMPLE_SIZE + 1])
        delimiter = sniff_delimiter(sample_text)

    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    headers = reader.fieldnames or []
    sample_rows: list[dict[str, str]] = []
    for row in reader:
        sample_rows.append({k: (v or "") for k, v in row.items() if k})
        if len(sample_rows) >= _SAMPLE_SIZE:
            break

    mapping = detect_column_mapping(headers)

    date_format = None
    if mapping.get("date"):
        date_format = detect_date_format([r.get(mapping["date"], "") for r in sample_rows])

    decimal_separator = "."
    if mapping.get("amount"):
        decimal_separator = detect_decimal_separator([r.get(mapping["amount"], "") for r in sample_rows])

    return ImportDetectResponse(
        headers=headers,
        encoding=encoding,
        delimiter=delimiter,
        date_format=date_format,
        decimal_separator=decimal_separator,
        column_mapping=mapping,
        sample_rows=sample_rows,
        file_format=file_format,
    )


def _parse_date(raw: str, date_format: str) -> date:
    return datetime.strptime(raw.strip(), date_format).date()


def _parse_amount(raw: str, decimal_separator: str) -> float:
    cleaned = raw.strip().replace(" ", "").replace(" ", "")
    if decimal_separator == ",":
        cleaned = cleaned.replace(".", "").replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    return float(cleaned)


def _resolve_account(raw_row: dict, data: ImportPreviewRequest, accounts_by_name: dict) -> tuple[int, str | None, bool]:
    if data.account_col:
        raw_value = (raw_row.get(data.account_col) or "").strip()
        if raw_value:
            matched = accounts_by_name.get(raw_value.lower())
            if matched:
                return matched.id, raw_value, True
        return data.account_id, (raw_value or None), False
    return data.account_id, None, True


def preview_import(db: Session, raw: bytes, data: ImportPreviewRequest) -> list[ImportPreviewRow]:
    text = raw.decode(data.encoding)
    delimiter = data.delimiter
    if is_qif(text):
        text = qif_to_csv_text(text)
        delimiter = QIF_DELIMITER
    reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
    raw_rows = list(reader)

    if len(raw_rows) > MAX_IMPORT_ROWS:
        raise RuleViolation(
            f"This file has {len(raw_rows)} rows, which is more than the "
            f"{MAX_IMPORT_ROWS}-row import limit. Split it into smaller files and import them separately."
        )

    categories_by_name = {c.name.lower(): c for c in db.query(Category).all()}
    accounts_by_name = {a.name.strip().lower(): a for a in db.query(Account).all()}

    resolved_account_ids = {data.account_id}
    for raw_row in raw_rows:
        resolved_account_ids.add(_resolve_account(raw_row, data, accounts_by_name)[0])

    existing_keys = {
        (t.account_id, t.date, round(t.amount, 2), t.payee)
        for t in db.query(Transaction).filter(Transaction.account_id.in_(resolved_account_ids)).all()
    }

    weights_cache: dict[tuple[int | None, int | None], tuple[str | None, dict[int, int]]] = {}

    rows: list[ImportPreviewRow] = []
    for i, raw_row in enumerate(raw_rows, start=1):
        account_id, account_name, account_matched = _resolve_account(raw_row, data, accounts_by_name)

        try:
            row_date = _parse_date(raw_row[data.date_col], data.date_format)
            payee = raw_row[data.payee_col].strip()
            amount = _parse_amount(raw_row[data.amount_col], data.decimal_separator)
            memo = raw_row[data.memo_col].strip() if data.memo_col and raw_row.get(data.memo_col) else None
        except (KeyError, ValueError) as exc:
            rows.append(ImportPreviewRow(
                row_number=i, account_id=account_id, account_name=account_name, account_matched=account_matched,
                status="error", error_message=str(exc),
            ))
            continue

        category = None
        if data.category_col:
            raw_category = (raw_row.get(data.category_col) or "").strip()
            category = categories_by_name.get(raw_category.lower())
            if category is None and ":" in raw_category:
                # QIF writes a subcategory as "Parent:Child"; MyFinance names are unique on their own.
                category = categories_by_name.get(raw_category.rsplit(":", 1)[1].strip().lower())

        status = "ok"
        if category is None:
            status = "needs_category"
        elif (account_id, row_date, round(amount, 2), payee) in existing_keys:
            status = "possible_duplicate"

        preview_split = []
        if category is not None:
            weights_key = (category.id, account_id)
            if weights_key not in weights_cache:
                weights_cache[weights_key] = resolve_default_weights(db, category.id, account_id)
            source, weights = weights_cache[weights_key]
            shares = prorate(amount, weights) if weights else []
            preview_split = [
                ImportPreviewSplitShare(user_id=s.user_id, weight=s.weight, share_amount=s.share_amount, source=source or "custom")
                for s in shares
            ]

        rows.append(ImportPreviewRow(
            row_number=i,
            transaction_date=row_date,
            payee=payee,
            memo=memo,
            amount=amount,
            account_id=account_id,
            account_name=account_name,
            account_matched=account_matched,
            category_id=category.id if category else None,
            category_name=category.name if category else None,
            status=status,
            preview_split=preview_split,
        ))

    return rows
