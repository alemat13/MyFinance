import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

import enable_banking
from database import get_db
from models import BankAccountLink, BankConnection
from rules import validate_bank_link_account
from schemas import (
    BankAccountLinkOut,
    BankAccountLinkUpdate,
    BankConnectionCreate,
    BankConnectionCreated,
    BankConnectionOut,
    BankInstitutionOut,
    BankSyncRunResult,
)

router = APIRouter(prefix="/api/bank-sync")


def _build_link_out(link: BankAccountLink) -> BankAccountLinkOut:
    return BankAccountLinkOut(
        id=link.id,
        connection_id=link.connection_id,
        iban=link.iban,
        remote_name=link.remote_name,
        currency=link.currency,
        account_id=link.account_id,
        account_name=link.account.name if link.account is not None else None,
        sync_enabled=link.sync_enabled,
        sync_from_date=link.sync_from_date,
        last_synced_at=link.last_synced_at,
        last_sync_status=link.last_sync_status,
        last_sync_error=link.last_sync_error,
        last_imported_count=link.last_imported_count,
    )


def _build_connection_out(connection: BankConnection) -> BankConnectionOut:
    return BankConnectionOut(
        id=connection.id,
        aspsp_name=connection.aspsp_name,
        aspsp_country=connection.aspsp_country,
        status=connection.status,
        access_valid_until=connection.access_valid_until,
        created_at=connection.created_at,
        last_error=connection.last_error,
        accounts=[_build_link_out(link) for link in connection.account_links],
    )


@router.get("/institutions", response_model=list[BankInstitutionOut])
def list_institutions(country: str = Query("FR", min_length=2, max_length=2)):
    try:
        aspsps = enable_banking.list_aspsps(country.upper())
    except enable_banking.EnableBankingError as exc:
        raise HTTPException(502, str(exc))
    seen: set[str] = set()
    institutions = []
    for aspsp in aspsps:
        name = aspsp.get("name")
        # The catalogue lists an ASPSP once per authentication approach; the
        # consent request only ever names the bank, so collapse the repeats.
        if not name or name in seen:
            continue
        seen.add(name)
        institutions.append(BankInstitutionOut(name=name, country=aspsp.get("country", country.upper()), logo=aspsp.get("logo")))
    return sorted(institutions, key=lambda i: i.name.lower())


@router.get("/connections", response_model=list[BankConnectionOut])
def list_connections(db: Session = Depends(get_db)):
    connections = db.query(BankConnection).order_by(BankConnection.id).all()
    # A pending connection is one the user walked away from mid-consent; it
    # has no session and nothing to show, so it isn't listed.
    return [_build_connection_out(c) for c in connections if c.status != "pending"]


@router.post("/connections", response_model=BankConnectionCreated)
def create_connection(data: BankConnectionCreate, db: Session = Depends(get_db)):
    try:
        connection, authorization_url = enable_banking.create_connection(
            db, data.aspsp_name, data.aspsp_country.upper(), data.language,
        )
    except enable_banking.EnableBankingError as exc:
        raise HTTPException(502, str(exc))
    return BankConnectionCreated(connection_id=connection.id, authorization_url=authorization_url)


@router.get("/callback")
def callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    db: Session = Depends(get_db),
):
    """Where the bank sends the user's browser back after consent. Always a
    redirect to the frontend, never JSON — a human is looking at this."""
    frontend_url = os.environ.get("FRONTEND_BASE_URL", "http://localhost:5173")
    connection = (
        db.query(BankConnection).filter(BankConnection.state == state).first()
        if state else None
    )
    if error or not code or connection is None:
        if connection is not None:
            connection.status = "error"
            connection.last_error = error or "The bank did not return an authorization code"
            db.commit()
        return RedirectResponse(f"{frontend_url}/?view=bank-sync&bank=error")
    try:
        enable_banking.complete_connection(db, connection, code)
    except enable_banking.EnableBankingError as exc:
        connection.status = "error"
        connection.last_error = str(exc)[:2000]
        db.commit()
        return RedirectResponse(f"{frontend_url}/?view=bank-sync&bank=error")
    return RedirectResponse(f"{frontend_url}/?view=bank-sync&bank=connected")


@router.delete("/connections/{connection_id}", status_code=204)
def delete_connection(connection_id: int, db: Session = Depends(get_db)):
    connection = db.get(BankConnection, connection_id)
    if connection is None:
        raise HTTPException(404, "Bank connection not found")
    enable_banking.disconnect(db, connection)


@router.put("/links/{link_id}", response_model=BankAccountLinkOut)
def update_link(link_id: int, data: BankAccountLinkUpdate, db: Session = Depends(get_db)):
    link = db.get(BankAccountLink, link_id)
    if link is None:
        raise HTTPException(404, "Bank account link not found")
    validate_bank_link_account(db, link, data.account_id)
    newly_linked = link.account_id is None and data.account_id is not None
    link.account_id = data.account_id
    link.sync_enabled = data.sync_enabled
    if data.sync_from_date is not None:
        link.sync_from_date = data.sync_from_date
    elif newly_linked and link.sync_from_date is None:
        # Default to "from today": the ledger already holds years of history
        # from the CSV/migration path, and re-importing it would land as
        # duplicates the bank's own identifiers can't catch.
        link.sync_from_date = datetime.now(timezone.utc).date()
    db.commit()
    db.refresh(link)
    return _build_link_out(link)


@router.post("/links/{link_id}/sync", response_model=BankSyncRunResult)
def sync_link_now(link_id: int, db: Session = Depends(get_db)):
    link = db.get(BankAccountLink, link_id)
    if link is None:
        raise HTTPException(404, "Bank account link not found")
    if link.account_id is None:
        raise HTTPException(422, "Link this bank account to a MyFinance account first")
    created = enable_banking.sync_link(db, link)
    return BankSyncRunResult(
        ran=True,
        synced_links=1,
        created_count=created,
        status=link.last_sync_status,
        error=link.last_sync_error,
    )


@router.post("/run-due", response_model=BankSyncRunResult)
def run_due(
    db: Session = Depends(get_db),
    x_bank_sync_scheduler_secret: str | None = Header(None, alias="X-Bank-Sync-Scheduler-Secret"),
):
    """Called on a schedule by Cloud Scheduler, not by the app. Cloud Run has
    no long-lived process to run a timer in, and this keeps every bank call
    off the request path a user is waiting on."""
    if not enable_banking.verify_scheduler_secret(x_bank_sync_scheduler_secret):
        raise HTTPException(403, "Invalid scheduler secret")
    synced, created = enable_banking.run_due_syncs(db)
    return BankSyncRunResult(ran=synced > 0, synced_links=synced, created_count=created)
