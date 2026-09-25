from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

import cache_service
import split_engine
from audit import record_transaction_history, splits_created_changes
from database import get_db
from import_csv import MAX_IMPORT_ROWS, detect_import_settings, preview_import
from models import Transaction
from rules import (
    RuleViolation,
    validate_resolved_weights_present,
    validate_transaction_weights_present,
    validate_weights,
)
from schemas import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportDetectResponse,
    ImportPreviewRequest,
    ImportPreviewRow,
)

router = APIRouter(prefix="/api/import")
_IMPORT_FLUSH_BATCH_SIZE = 500
# What Transaction.raw_source records for rows this router imports. The
# preview screen never lets the payee be edited, so the payee a row is
# committed with is the CSV's own label, frozen into raw_label here.
RAW_SOURCE = "csv_import"


@router.post("/detect", response_model=ImportDetectResponse)
async def import_detect(file: UploadFile = File(...)):
    contents = await file.read()
    return detect_import_settings(contents)


@router.post("/preview", response_model=list[ImportPreviewRow])
async def import_preview(
    file: UploadFile = File(...),
    account_id: int = Form(...),
    encoding: str = Form(...),
    delimiter: str = Form(...),
    date_format: str = Form(...),
    decimal_separator: str = Form(...),
    date_col: str = Form(...),
    payee_col: str = Form(...),
    amount_col: str = Form(...),
    memo_col: str | None = Form(None),
    category_col: str | None = Form(None),
    account_col: str | None = Form(None),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    data = ImportPreviewRequest(
        account_id=account_id, encoding=encoding, delimiter=delimiter,
        date_format=date_format, decimal_separator=decimal_separator,
        date_col=date_col, payee_col=payee_col, amount_col=amount_col,
        memo_col=memo_col, category_col=category_col, account_col=account_col,
    )
    try:
        return await run_in_threadpool(preview_import, db, contents, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.post("/commit", response_model=ImportCommitResponse)
def import_commit(data: ImportCommitRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    if len(data.rows) > MAX_IMPORT_ROWS:
        raise RuleViolation(
            f"This import has {len(data.rows)} rows, which is more than the "
            f"{MAX_IMPORT_ROWS}-row import limit. Split it into smaller batches and import them separately."
        )

    for row in data.rows:
        if row.split_weights is not None:
            validate_transaction_weights_present(row.split_weights)
            validate_weights(row.split_weights)

    weights_cache: dict[tuple[int | None, int | None], tuple[str | None, dict[int, int]]] = {}
    transaction_ids: list[int] = []
    pending_batch: list[tuple[Transaction, dict[int, int] | None, str]] = []

    def flush_pending_batch() -> None:
        db.flush()
        for transaction, weights, source in pending_batch:
            split_engine.apply_split(db, transaction, weights or None, source)
            record_transaction_history(db, transaction, "created", actor_user_id, source="csv_import",
                                        changes=splits_created_changes(weights, source))
            transaction_ids.append(transaction.id)
        pending_batch.clear()

    for row in data.rows:
        if row.split_weights is not None:
            weights = {w.user_id: w.weight for w in row.split_weights} or None
            source = row.split_source or "custom"
        else:
            weights_key = (row.category_id, row.account_id)
            if weights_key not in weights_cache:
                weights_cache[weights_key] = split_engine.resolve_default_weights(db, row.category_id, row.account_id)
            source, weights = weights_cache[weights_key]
            validate_resolved_weights_present(weights)
            source = source or "custom"
        transaction = Transaction(
            date=row.date, payee=row.payee, memo=row.memo, amount=row.amount,
            account_id=row.account_id, category_id=row.category_id,
            accounting_month_offset=row.accounting_month_offset,
            raw_source=RAW_SOURCE, raw_label=row.payee,
        )
        db.add(transaction)
        pending_batch.append((transaction, weights, source))
        if len(pending_batch) >= _IMPORT_FLUSH_BATCH_SIZE:
            flush_pending_batch()

    if pending_batch:
        flush_pending_batch()

    cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return ImportCommitResponse(created_count=len(transaction_ids), transaction_ids=transaction_ids)
