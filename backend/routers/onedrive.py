import os
import secrets

from fastapi import APIRouter, Cookie, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import onedrive as onedrive_module
from database import get_db
from rules import validate_onedrive_folder_path, validate_onedrive_retention
from schemas import OneDriveBackupRunResult, OneDriveSettingsOut, OneDriveSettingsUpdate

router = APIRouter(prefix="/api/onedrive")


# The OAuth `state` and PKCE verifier, held by the browser that started the
# connection. Without it, a crafted link to /auth/callback carrying an
# authorization code someone obtained for their own Microsoft account would
# connect *their* OneDrive, and every scheduled backup would go there.
# SameSite=Lax still sends it on Microsoft's top-level redirect back.
OAUTH_COOKIE = "onedrive_oauth"
OAUTH_COOKIE_PATH = "/api/onedrive/auth"
OAUTH_COOKIE_MAX_AGE = 600


def _error_redirect(frontend_url: str) -> RedirectResponse:
    response = RedirectResponse(f"{frontend_url}/?onedrive=error")
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@router.get("/auth/start")
def start_auth():
    state = secrets.token_urlsafe(24)
    code_verifier = secrets.token_urlsafe(48)
    response = RedirectResponse(onedrive_module.build_authorize_url(state, code_verifier))
    response.set_cookie(
        OAUTH_COOKIE,
        f"{state}.{code_verifier}",
        max_age=OAUTH_COOKIE_MAX_AGE,
        path=OAUTH_COOKIE_PATH,
        httponly=True,
        secure=os.environ.get("ONEDRIVE_REDIRECT_URI", "").startswith("https://"),
        samesite="lax",
    )
    return response


@router.get("/auth/callback")
def auth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    onedrive_oauth: str | None = Cookie(None),
    db: Session = Depends(get_db),
):
    frontend_url = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
    if error or not code or not state or not onedrive_oauth:
        return _error_redirect(frontend_url)
    expected_state, _, code_verifier = onedrive_oauth.partition(".")
    if not code_verifier or not secrets.compare_digest(state, expected_state):
        return _error_redirect(frontend_url)
    settings = onedrive_module.get_or_create_settings(db)
    try:
        onedrive_module.complete_connection(db, settings, code, code_verifier)
    except onedrive_module.OneDriveError:
        return _error_redirect(frontend_url)
    response = RedirectResponse(f"{frontend_url}/?onedrive=connected")
    response.delete_cookie(OAUTH_COOKIE, path=OAUTH_COOKIE_PATH)
    return response


@router.get("/settings", response_model=OneDriveSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return onedrive_module.get_or_create_settings(db)


@router.put("/settings", response_model=OneDriveSettingsOut)
def update_settings(data: OneDriveSettingsUpdate, db: Session = Depends(get_db)):
    validate_onedrive_folder_path(data.folder_path)
    validate_onedrive_retention(data.keep_daily, data.keep_weekly, data.keep_monthly, data.keep_yearly)
    settings = onedrive_module.get_or_create_settings(db)
    settings.folder_path = data.folder_path
    settings.keep_daily = data.keep_daily
    settings.keep_weekly = data.keep_weekly
    settings.keep_monthly = data.keep_monthly
    settings.keep_yearly = data.keep_yearly
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
