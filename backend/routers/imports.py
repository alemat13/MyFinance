from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

import split_engine
from audit import record_transaction_history, splits_created_changes
from database import get_db
from import_csv import detect_import_settings, preview_import
from models import Transaction
from rules import validate_weights
from schemas import (
    ImportCommitRequest,
    ImportCommitResponse,
    ImportDetectResponse,
    ImportPreviewRequest,
    ImportPreviewRow,
)

router = APIRouter(prefix="/api/import")


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
    db: Session = Depends(get_db),
):
    contents = await file.read()
    data = ImportPreviewRequest(
        account_id=account_id, encoding=encoding, delimiter=delimiter,
        date_format=date_format, decimal_separator=decimal_separator,
        date_col=date_col, payee_col=payee_col, amount_col=amount_col,
        memo_col=memo_col, category_col=category_col,
    )
    try:
        return preview_import(db, contents, data)
    except ValueError as exc:
        raise HTTPException(422, str(exc))


@router.post("/commit", response_model=ImportCommitResponse)
def import_commit(data: ImportCommitRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    for row in data.rows:
        if row.split_weights:
            validate_weights(row.split_weights)

    transaction_ids = []
    for row in data.rows:
        if row.split_weights is not None:
            weights = {w.user_id: w.weight for w in row.split_weights} or None
            source = row.split_source or "custom"
        else:
            source, weights = split_engine.resolve_default_weights(db, row.category_id, row.account_id)
            source = source or "custom"
        transaction = Transaction(
            date=row.date, payee=row.payee, memo=row.memo, amount=row.amount,
            account_id=row.account_id, category_id=row.category_id,
            accounting_month_offset=row.accounting_month_offset,
        )
        db.add(transaction)
        db.flush()
        split_engine.apply_split(db, transaction, weights or None, source)
        record_transaction_history(db, transaction, "created", actor_user_id, source="csv_import",
                                    changes=splits_created_changes(weights, source))
        transaction_ids.append(transaction.id)

    db.commit()
    return ImportCommitResponse(created_count=len(transaction_ids), transaction_ids=transaction_ids)
