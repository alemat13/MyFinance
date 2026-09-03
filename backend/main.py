import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from database import engine, Base, sync_schema
from rules import RuleViolation
from routers import (
    accounts,
    balances,
    backup,
    categories,
    charts,
    dashboard,
    imports,
    split_weights,
    transactions,
    users,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if "pytest" not in sys.modules:
        Base.metadata.create_all(bind=engine)
        sync_schema(engine)
    yield


app = FastAPI(title="Personal Finance Manager API", lifespan=lifespan)

_default_cors_origins = (
    "http://localhost:5173,"
    "http://100.127.164.124:5173,"
    "http://surfacealex.tail047989.ts.net:5173"
)
allow_origins = os.environ.get("CORS_ALLOWED_ORIGINS", _default_cors_origins).split(",")

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
            msg = msg[len("Value error, "):]
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
app.include_router(dashboard.router)
app.include_router(charts.router)
