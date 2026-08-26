import csv
import io
from datetime import datetime

from sqlalchemy.orm import Session

from models import Category, Transaction
from schemas import ImportPreviewRequest, ImportPreviewRow, SplitPreviewShare
from split_engine import resolve_split


def _parse_date(raw: str, date_format: str | None):
    fmt = date_format or "%Y-%m-%d"
    return datetime.strptime(raw.strip(), fmt).date()


def _parse_amount(raw: str) -> float:
    cleaned = raw.strip().replace(" ", "").replace(" ", "")
    if "," in cleaned and "." not in cleaned:
        cleaned = cleaned.replace(",", ".")
    else:
        cleaned = cleaned.replace(",", "")
    return float(cleaned)


def preview_import(db: Session, data: ImportPreviewRequest) -> list[ImportPreviewRow]:
    reader = csv.DictReader(io.StringIO(data.csv_text)) if data.has_header else None
    if reader is None:
        raise ValueError("has_header=false is not supported yet; CSV must include a header row")

    categories_by_name = {c.name.lower(): c for c in db.query(Category).all()}
    existing_keys = {
        (t.account_id, t.date, round(t.amount, 2), t.payee)
        for t in db.query(Transaction).filter(Transaction.account_id == data.account_id).all()
    }

    rows: list[ImportPreviewRow] = []
    for i, raw_row in enumerate(reader, start=1):
        try:
            row_date = _parse_date(raw_row[data.date_col], data.date_format)
            payee = raw_row[data.payee_col].strip()
            amount = _parse_amount(raw_row[data.amount_col])
            memo = raw_row[data.memo_col].strip() if data.memo_col and raw_row.get(data.memo_col) else None
        except (KeyError, ValueError) as exc:
            rows.append(ImportPreviewRow(
                row_number=i, account_id=data.account_id,
                status="error", error_message=str(exc),
            ))
            continue

        category = None
        if data.category_col:
            raw_category = (raw_row.get(data.category_col) or "").strip()
            category = categories_by_name.get(raw_category.lower())

        status = "ok"
        if category is None:
            status = "needs_category"
        elif (data.account_id, row_date, round(amount, 2), payee) in existing_keys:
            status = "possible_duplicate"

        preview_split = []
        if category is not None:
            shares = resolve_split(db, amount, category.id, override=None, required=False)
            preview_split = [SplitPreviewShare(user_id=s.user_id, share_amount=s.share_amount, source=s.source) for s in shares]

        rows.append(ImportPreviewRow(
            row_number=i,
            transaction_date=row_date,
            payee=payee,
            memo=memo,
            amount=amount,
            account_id=data.account_id,
            category_id=category.id if category else None,
            category_name=category.name if category else None,
            status=status,
            preview_split=preview_split,
        ))

    return rows
