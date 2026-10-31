from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy.orm import Session

import backup as backup_module
from database import get_db
from schemas import ImportSummary
from uploads import read_upload

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


# Ceiling on an uploaded backup archive. Production backups are a few megabytes
# of zip; this leaves ample room while refusing an upload meant to fill memory.
MAX_BACKUP_UPLOAD_BYTES = 200 * 1024 * 1024


# Plain `def`, not `async def`: the restore is seconds of blocking database
# work, which FastAPI runs in its thread pool for a sync route instead of
# freezing every other request on the instance.
@router.post("/import", response_model=ImportSummary)
def import_backup(
    mode: Literal["overwrite", "partial"] = Query("overwrite"),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    contents = read_upload(file, MAX_BACKUP_UPLOAD_BYTES)
    try:
        data = backup_module.parse_zip_bytes(contents)
        return backup_module.import_database(db, data, mode)
    except backup_module.BackupFormatError as exc:
        raise HTTPException(422, str(exc))
