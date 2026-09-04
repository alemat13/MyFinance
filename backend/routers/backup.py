from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

import backup as backup_module
from database import get_db
from schemas import ImportSummary

router = APIRouter(prefix="/api/backup")


@router.get("/export")
def export_backup(db: Session = Depends(get_db)):
    zip_bytes = backup_module.export_to_zip_bytes(db)
    filename = f"myfinance-backup-{datetime.now(timezone.utc):%Y%m%d-%H%M%S}.zip"
    return Response(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/import", response_model=ImportSummary)
async def import_backup(
    mode: Literal["overwrite", "append"] = Query("overwrite"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    contents = await file.read()
    try:
        data = backup_module.parse_zip_bytes(contents)
        return backup_module.import_database(db, data, mode)
    except backup_module.BackupFormatError as exc:
        raise HTTPException(422, str(exc))
