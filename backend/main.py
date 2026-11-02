import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from database import Base, engine, sync_schema
from routers import (
    accounts,
    backup,
    balances,
    bank_sync,
    categories,
    categorizer,
    charts,
    dashboard,
    email_alerts,
    history,
    imports,
    onedrive,
    saved_filters,
    split_weights,
    tags,
    transaction_links,
    transaction_rules,
    transactions,
    users,
)
from rules import RuleViolation

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Only a local SQLite database is shaped at startup (MYF-19). Production
    # (Postgres) is shaped by Alembic alone, run by the deploy job before the
    # new revision starts, so its schema always matches the migration history;
    # CI's `alembic check` fails while models.py has a change no migration
    # carries.
    if "pytest" not in sys.modules and engine.dialect.name == "sqlite":
        Base.metadata.create_all(bind=engine)
        sync_schema(engine)
    yield


# Swagger UI and the schema live under /api like every route, since that is the
# only prefix the production load balancer sends to this service (behind IAP).
app = FastAPI(
    title="Personal Finance Manager API",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# Any other dev origin (a LAN or Tailscale address) goes in CORS_ALLOWED_ORIGINS,
# not here: the repository is public.
allow_origins = os.environ.get("CORS_ALLOWED_ORIGINS", "http://localhost:5173").split(",")

# CSRF guard (MYF-14). A request that changes data must carry this header,
# which the app's own client always sends. A page on another site cannot set
# it without a CORS preflight, which `allow_origins` refuses, so a cross-site
# form or fetch is turned away here instead of riding the IAP cookie. The two
# Cloud Scheduler endpoints are exempt: they are not called by a browser and
# carry their own shared-secret header instead.
CSRF_HEADER = "X-MyFinance-Client"
CSRF_EXEMPT_PATHS = frozenset(
    {
        "/api/bank-sync/run-due",
        "/api/onedrive/backup/run-due",
    }
)
_SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


@app.middleware("http")
async def _require_csrf_header(request: Request, call_next):
    if (
        request.method not in _SAFE_METHODS
        and request.url.path not in CSRF_EXEMPT_PATHS
        and not request.headers.get(CSRF_HEADER)
    ):
        return JSONResponse(
            status_code=403,
            content={"detail": f"Missing {CSRF_HEADER} header"},
        )
    return await call_next(request)


# Added after the CSRF guard so it wraps it: a refused request still gets its
# CORS headers, and a preflight is answered before the guard sees it.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(IntegrityError)
def _handle_integrity_error(request, exc):
    message = str(exc.orig).upper()
    if "UNIQUE" in message:
        detail = "A record with this value already exists"
    elif "FOREIGN KEY" in message:
        detail = "Data integrity error: referenced record may not exist"
    else:
        detail = "Data integrity error"
    return JSONResponse(status_code=409, content={"detail": detail})


@app.exception_handler(RequestValidationError)
def _handle_validation_error(request, exc):
    parts = []
    for err in exc.errors():
        loc = err.get("loc", ())
        field_loc = loc[1:] if loc and loc[0] in ("body", "query", "path") else loc
        field = ".".join(str(p) for p in field_loc) if field_loc else "value"
        msg = err.get("msg", "Invalid value")
        if msg.startswith("Value error, "):
            msg = msg[len("Value error, ") :]
        parts.append(f"{field}: {msg}")
    detail = "; ".join(parts) if parts else "Invalid request"
    return JSONResponse(status_code=422, content={"detail": detail})


@app.exception_handler(RuleViolation)
def _handle_rule_violation(request, exc: RuleViolation):
    return JSONResponse(status_code=422, content={"detail": exc.detail})


@app.exception_handler(Exception)
def _handle_unexpected_error(request, exc):
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


app.include_router(users.router)
app.include_router(accounts.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(split_weights.router)
app.include_router(balances.router)
app.include_router(imports.router)
app.include_router(backup.router)
app.include_router(onedrive.router)
app.include_router(bank_sync.router)
app.include_router(dashboard.router)
app.include_router(charts.router)
app.include_router(categorizer.router)
app.include_router(transaction_rules.router)
app.include_router(saved_filters.router)
app.include_router(email_alerts.router)
app.include_router(tags.router)
app.include_router(history.router)
app.include_router(transaction_links.router)
