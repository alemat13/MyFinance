import os
import secrets

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import onedrive as onedrive_module
from database import get_db
from rules import validate_onedrive_folder_path, validate_onedrive_retention_count
from schemas import OneDriveBackupRunResult, OneDriveSettingsOut, OneDriveSettingsUpdate

router = APIRouter(prefix="/api/onedrive")


@router.get("/auth/start")
def start_auth():
    return RedirectResponse(onedrive_module.build_authorize_url(secrets.token_urlsafe(16)))


@router.get("/auth/callback")
def auth_callback(code: str | None = None, error: str | None = None, db: Session = Depends(get_db)):
    frontend_url = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
    if error or not code:
        return RedirectResponse(f"{frontend_url}/?onedrive=error")
    settings = onedrive_module.get_or_create_settings(db)
    try:
        onedrive_module.complete_connection(db, settings, code)
    except onedrive_module.OneDriveError:
        return RedirectResponse(f"{frontend_url}/?onedrive=error")
    return RedirectResponse(f"{frontend_url}/?onedrive=connected")


@router.get("/settings", response_model=OneDriveSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return onedrive_module.get_or_create_settings(db)


@router.put("/settings", response_model=OneDriveSettingsOut)
def update_settings(data: OneDriveSettingsUpdate, db: Session = Depends(get_db)):
    validate_onedrive_folder_path(data.folder_path)
    validate_onedrive_retention_count(data.retention_count)
    settings = onedrive_module.get_or_create_settings(db)
    settings.folder_path = data.folder_path
    settings.frequency = data.frequency
    settings.retention_count = data.retention_count
    db.commit()
    db.refresh(settings)
    return settings


@router.post("/disconnect", response_model=OneDriveSettingsOut)
def disconnect(db: Session = Depends(get_db)):
    settings = onedrive_module.get_or_create_settings(db)
    onedrive_module.disconnect(db, settings)
    return settings


@router.post("/backup/run-now", response_model=OneDriveBackupRunResult)
def run_now(db: Session = Depends(get_db)):
    settings = onedrive_module.get_or_create_settings(db)
    if not settings.connected:
        raise HTTPException(422, "OneDrive is not connected")
    onedrive_module.run_backup(db, settings)
    return OneDriveBackupRunResult(ran=True, status=settings.last_backup_status, error=settings.last_backup_error)


@router.post("/backup/run-due", response_model=OneDriveBackupRunResult)
def run_due(
    db: Session = Depends(get_db),
    x_backup_scheduler_secret: str | None = Header(None, alias="X-Backup-Scheduler-Secret"),
):
    if not onedrive_module.verify_scheduler_secret(x_backup_scheduler_secret):
        raise HTTPException(403, "Invalid scheduler secret")
    settings = onedrive_module.get_or_create_settings(db)
    if not onedrive_module.is_backup_due(settings):
        return OneDriveBackupRunResult(ran=False)
    onedrive_module.run_backup(db, settings)
    return OneDriveBackupRunResult(ran=True, status=settings.last_backup_status, error=settings.last_backup_error)
