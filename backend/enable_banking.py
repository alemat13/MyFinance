"""Bank transaction sync through Enable Banking's PSD2 aggregation API.

Flow, end to end: we authenticate *ourselves* with a short-lived RS256 JWT
signed from ENABLE_BANKING_PRIVATE_KEY (there is no OAuth token exchange and
nothing bank-issued to store) → POST /auth returns a consent URL we redirect
the browser to → the user authenticates at their bank and comes back to our
callback with a code → POST /sessions turns that code into a session plus the
list of accounts the consent covers → GET /accounts/{uid}/transactions pulls
the rows.

Why no webhook: Enable Banking never calls us. The only inbound hop is the
bank redirecting the user's *own browser* back to our callback, which
therefore carries their IAP cookie like any other page load — so none of this
needs a publicly reachable endpoint.

Importing itself deliberately mirrors the CSV import path (routers/imports.py):
same resolve_default_weights() cascade, same audit rows, same cache
invalidation — a synced transaction is an ordinary transaction that happens to
carry an external_id.
"""
import hashlib
import hmac
import json
import os
import re
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from sqlalchemy.orm import Session

import cache_service
import split_engine
from audit import record_transaction_history, splits_created_changes
from models import BankAccountLink, BankConnection, Transaction

API_BASE = "https://api.enablebanking.com"
JWT_ISSUER = "enablebanking.com"
JWT_AUDIENCE = "api.enablebanking.com"
_JWT_TTL_SECONDS = 3600

# What we ask a bank to grant when the ASPSP doesn't publish a shorter cap.
# French ASPSPs top out at 90 days; re-consenting is a fresh authorization,
# never a token refresh.
DEFAULT_CONSENT_DAYS = 90
# How far back the very first sync of a freshly mapped link may reach when no
# sync_from_date was set.
DEFAULT_INITIAL_HISTORY_DAYS = 90
# Every sync re-fetches this much already-seen history, so a transaction the
# bank booked late still gets picked up. Cheap, because external_id makes the
# re-fetched rows no-ops.
SYNC_OVERLAP_DAYS = 7
# Hard cap on how many rows one link may import in a single run. The point is
# not the API's limits but Postgres's: a mass import once held a transaction
# open long enough to take production down, so a run that would exceed this
# stops early and the next run picks up where it left off.
MAX_ROWS_PER_SYNC = 2000
# Banks rate-limit account endpoints down to 4 calls per day, so there is no
# value in syncing more often than this.
MIN_SYNC_INTERVAL_HOURS = 6
# What Transaction.raw_source records for rows this module imports. The other
# writer of those columns is the Linxo GDPR export backfill, which uses its
# own value — the two vocabularies don't overlap.
RAW_SOURCE = "enable_banking"

# Regexes stripped from a synced row's payee (never its memo), first match
# only, in order — e.g. the "CARTE 18/09 " / "CARTE 21/09/26 " prefix and the
# " CB*4325" card-number suffix card payments carry. Edited in the JSON file
# rather than here so a new bank wording needs no code change. A pattern that
# fails to compile fails at import, i.e. at startup, rather than silently on
# the first sync.
_CONFIG_PATH = Path(__file__).parent / "bank_sync_config.json"
_LABEL_CLEANUP_PATTERNS: list[re.Pattern] = [
    re.compile(pattern)
    for pattern in json.loads(_CONFIG_PATH.read_text()).get("label_cleanup_patterns", [])
]


class EnableBankingError(Exception):
    """Any failed Enable Banking call. Message text is safe to persist
    verbatim to BankConnection.last_error / BankAccountLink.last_sync_error."""


# ── Authentication ────────────────────────────────────────────────────

def _application_id() -> str:
    application_id = os.environ.get("ENABLE_BANKING_APPLICATION_ID")
    if not application_id:
        raise EnableBankingError("ENABLE_BANKING_APPLICATION_ID is not configured")
    return application_id


def _private_key() -> str:
    key = os.environ.get("ENABLE_BANKING_PRIVATE_KEY")
    if not key:
        raise EnableBankingError("ENABLE_BANKING_PRIVATE_KEY is not configured")
    # Secret Manager and shell env vars both tend to flatten a PEM's newlines
    # into a literal backslash-n, which the RSA loader won't take.
    return key.replace("\\n", "\n").strip()


def build_jwt(now: int | None = None) -> str:
    """A request-scoped RS256 JWT. Enable Banking has no token endpoint: the
    application id is the `kid`, and the signature over a fresh iat/exp is the
    whole credential, so these are minted per call rather than cached."""
    issued_at = now if now is not None else int(time.time())
    try:
        return jwt.encode(
            {
                "iss": JWT_ISSUER,
                "aud": JWT_AUDIENCE,
                "iat": issued_at,
                "exp": issued_at + _JWT_TTL_SECONDS,
            },
            _private_key(),
            algorithm="RS256",
            headers={"kid": _application_id()},
        )
    except EnableBankingError:
        raise
    except Exception as exc:
        raise EnableBankingError(f"Failed to sign the Enable Banking request: {exc}")


def _request(method: str, path: str, **kwargs) -> dict:
    headers = {"Authorization": f"Bearer {build_jwt()}", "Accept": "application/json"}
    try:
        response = httpx.request(method, f"{API_BASE}{path}", headers=headers, timeout=60.0, **kwargs)
    except httpx.HTTPError as exc:
        raise EnableBankingError(f"Enable Banking is unreachable: {exc}")
    if response.status_code >= 400:
        raise EnableBankingError(f"Enable Banking {method} {path} failed ({response.status_code}): {response.text}")
    if not response.content:
        return {}
    return response.json()


# ── API calls ─────────────────────────────────────────────────────────

def list_aspsps(country: str = "FR") -> list[dict]:
    return _request("GET", "/aspsps", params={"country": country}).get("aspsps", [])


def _consent_valid_until(aspsp_name: str, country: str) -> datetime:
    """The longest consent the bank will actually grant, capped at our own
    default. Asking for more than an ASPSP's maximum_consent_validity is
    rejected outright, so it's read from the catalogue rather than guessed."""
    requested = timedelta(days=DEFAULT_CONSENT_DAYS)
    try:
        for aspsp in list_aspsps(country):
            if aspsp.get("name") == aspsp_name:
                maximum = aspsp.get("maximum_consent_validity")
                if maximum:
                    requested = min(requested, timedelta(seconds=int(maximum)))
                break
    except EnableBankingError:
        # The catalogue is only an optimisation here — if it's unavailable,
        # fall back to the default and let /auth reject it if it must.
        pass
    return datetime.now(timezone.utc) + requested


def start_authorization(aspsp_name: str, country: str, state: str, redirect_url: str, language: str = "fr") -> dict:
    valid_until = _consent_valid_until(aspsp_name, country)
    return _request("POST", "/auth", json={
        "access": {"valid_until": valid_until.replace(microsecond=0).isoformat().replace("+00:00", "Z")},
        "aspsp": {"name": aspsp_name, "country": country},
        "state": state,
        "redirect_url": redirect_url,
        "psu_type": "personal",
        "language": language,
    })


def create_session(code: str) -> dict:
    return _request("POST", "/sessions", json={"code": code})


def fetch_session(session_id: str) -> dict:
    """The same payload POST /sessions returned, re-read for an existing
    consent. Lets a connection whose accounts never landed be repaired
    without a fresh authorization the bank would have to prompt for."""
    return _request("GET", f"/sessions/{session_id}")


def fetch_account_details(account_uid: str) -> dict:
    return _request("GET", f"/accounts/{account_uid}/details")


def delete_session(session_id: str) -> None:
    _request("DELETE", f"/sessions/{session_id}")


def fetch_transactions(account_uid: str, date_from: date, date_to: date) -> list[dict]:
    """Every booked transaction in the window, following continuation_key
    until the bank stops handing one back."""
    params = {
        "date_from": date_from.isoformat(),
        "date_to": date_to.isoformat(),
        "transaction_status": "BOOK",
    }
    collected: list[dict] = []
    continuation_key = None
    while True:
        page_params = dict(params)
        if continuation_key:
            page_params["continuation_key"] = continuation_key
        page = _request("GET", f"/accounts/{account_uid}/transactions", params=page_params)
        collected.extend(page.get("transactions", []))
        continuation_key = page.get("continuation_key")
        if not continuation_key or len(collected) >= MAX_ROWS_PER_SYNC:
            return collected


# ── Normalising a bank transaction into a MyFinance one ───────────────

def _parse_amount(raw: dict, credit_debit_indicator: str) -> float:
    """Enable Banking always reports a positive amount plus a direction;
    MyFinance stores a signed one (expenses negative)."""
    amount = abs(float(raw.get("amount", 0)))
    return amount if credit_debit_indicator == "CRDT" else -amount


# The day the operation happened comes first: that is what the bank's own app
# and Linxo show, and what the migrated history is dated by. booking_date is
# when the bank posted it, which for a transfer made on a Saturday is the
# following Monday.
DISPLAY_DATE_FIELDS = ("transaction_date", "booking_date", "value_date")
# The fingerprint keeps the order it has always had, so rows already imported
# under a fp: id keep matching and a re-sync doesn't re-import them.
FINGERPRINT_DATE_FIELDS = ("booking_date", "transaction_date", "value_date")


def _parse_date(raw: dict, fields: tuple[str, ...] = DISPLAY_DATE_FIELDS) -> date | None:
    for field in fields:
        value = raw.get(field)
        if value:
            try:
                return date.fromisoformat(value[:10])
            except ValueError:
                continue
    return None


def _remittance(raw: dict) -> str | None:
    parts = [p.strip() for p in (raw.get("remittance_information") or []) if p and p.strip()]
    return " ".join(parts) or None


def _counterparty_name(raw: dict, credit_debit_indicator: str) -> str | None:
    """Whoever the bank named on the other side, kept verbatim — unlike
    _payee(), which falls back to the remittance text and finally to a
    placeholder so the NOT NULL column is always filled.

    The party is an object per the spec, but a bank that sends the name as a
    bare string must not take the whole sync down over a field nothing
    computes from, so that shape is read too."""
    counterparty = raw.get("creditor") if credit_debit_indicator == "DBIT" else raw.get("debtor")
    if isinstance(counterparty, dict):
        name = counterparty.get("name")
    else:
        name = counterparty
    if not isinstance(name, str):
        return None
    return name.strip()[:200] or None


def _payee(raw: dict, credit_debit_indicator: str, remittance: str | None) -> str:
    """The counterparty: whoever was paid on a debit, whoever paid on a
    credit. Banks fill these inconsistently, so fall back to the remittance
    text and finally to a placeholder — payee is NOT NULL."""
    return _counterparty_name(raw, credit_debit_indicator) or (remittance or "Unknown")[:200]


def clean_label(label: str | None) -> str | None:
    """A payee with every configured cleanup pattern stripped. A pattern
    that would leave nothing behind is skipped, so a label is never blanked.
    Applied to the payee alone: the memo, raw_label and raw_counterparty
    keep the bank's wording intact."""
    if not label:
        return label
    for pattern in _LABEL_CLEANUP_PATTERNS:
        cleaned = pattern.sub("", label, count=1).strip()
        if cleaned:
            label = cleaned
    return label


def _bank_transaction_code(raw: dict) -> str | None:
    """The bank's own ISO 20022 classification of the transaction, flattened
    to one short string. ASPSPs report it either as a domain/family/sub-family
    triple or as a code/sub-code pair, and a few send only a description, so
    all three shapes are folded into the same column — raw_source is what says
    the vocabulary is ISO 20022 rather than the Linxo export's own."""
    code = raw.get("bank_transaction_code")
    if not isinstance(code, dict):
        return str(code)[:60] if code else None
    parts = [
        code.get("domain") or code.get("code"),
        code.get("family"),
        code.get("sub_family") or code.get("sub_code"),
    ]
    joined = "/".join(str(p) for p in parts if p)
    return (joined or str(code.get("description") or ""))[:60] or None


def _initiated_date(raw: dict) -> date | None:
    """When the purchase happened, when the bank distinguishes it from the
    day it booked the entry."""
    value = raw.get("transaction_date")
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _booking_date(raw: dict) -> date | None:
    """When the bank posted the entry — kept because the transaction's own
    date is now the day it was made, and the two differ over a weekend."""
    value = raw.get("booking_date")
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def _fingerprint(row_date: date, amount: float, payee: str, occurrence: int) -> str:
    """A stable stand-in identifier for banks that return neither
    entry_reference nor transaction_id. `occurrence` distinguishes genuinely
    identical same-day transactions (two identical coffees): re-fetching the
    same day yields the same rows in the same order, so the same indices come
    back out and the dedup still holds."""
    digest = hashlib.sha1(f"{row_date.isoformat()}|{amount:.2f}|{payee}".encode()).hexdigest()[:24]
    return f"fp:{digest}:{occurrence}"


def normalize_transactions(raw_transactions: list[dict]) -> list[dict]:
    """Bank payloads → dicts shaped like a MyFinance transaction, each with the
    external_id its deduplication depends on. Rows without a usable date or
    direction are dropped rather than guessed at."""
    normalized: list[dict] = []
    fingerprint_counts: dict[str, int] = {}
    for raw in raw_transactions:
        indicator = raw.get("credit_debit_indicator")
        row_date = _parse_date(raw)
        if indicator not in ("CRDT", "DBIT") or row_date is None:
            continue
        amount = _parse_amount(raw.get("transaction_amount") or {}, indicator)
        remittance = _remittance(raw)
        payee = _payee(raw, indicator, remittance)

        external_id = raw.get("entry_reference") or raw.get("transaction_id")
        if external_id:
            external_id = str(external_id)[:120]
        else:
            fingerprint_date = _parse_date(raw, FINGERPRINT_DATE_FIELDS)
            base = f"{fingerprint_date.isoformat()}|{amount:.2f}|{payee}"
            occurrence = fingerprint_counts.get(base, 0)
            fingerprint_counts[base] = occurrence + 1
            external_id = _fingerprint(fingerprint_date, amount, payee, occurrence)

        normalized.append({
            "date": row_date,
            # Cleaned only now, after the fingerprint: it is computed from the
            # uncleaned payee so that editing the patterns never changes an
            # already-imported row's external_id, which would re-import it.
            "payee": clean_label(payee),
            "memo": remittance,
            "amount": amount,
            "external_id": external_id,
            # Frozen copies of what the bank said, never edited afterwards.
            # raw_label deliberately duplicates memo at import time: memo is
            # the user's to rewrite, this is not.
            "raw_source": RAW_SOURCE,
            "raw_label": remittance,
            "raw_counterparty": _counterparty_name(raw, indicator),
            "raw_transaction_code": _bank_transaction_code(raw),
            "raw_merchant_category_code": (str(raw["merchant_category_code"])[:10]
                                           if raw.get("merchant_category_code") else None),
            "raw_initiated_date": _initiated_date(raw),
            "raw_booking_date": _booking_date(raw),
        })
    return normalized


# ── Sync ──────────────────────────────────────────────────────────────

def _legacy_duplicate_counts(db: Session, account_id: int, date_from: date, date_to: date) -> dict[tuple[date, float], int]:
    """How many pre-existing rows in the window carry no external_id, per
    (date, amount).

    These are transactions this sync could not have created — hand entry, CSV
    import, the migrated ledger — and the bank will happily hand them back
    again with an identifier we've never seen. Matching on date+amount is
    coarse, so it's deliberately a *count* that gets decremented: two genuine
    same-day, same-amount transactions are not both swallowed by one existing
    row. Repeat syncs don't rely on this at all; external_id already covers
    them.
    """
    counts: dict[tuple[date, float], int] = {}
    rows = (
        db.query(Transaction.date, Transaction.amount)
        .filter(
            Transaction.account_id == account_id,
            Transaction.external_id.is_(None),
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .all()
    )
    for row_date, amount in rows:
        key = (row_date, round(amount, 2))
        counts[key] = counts.get(key, 0) + 1
    return counts


def sync_window(link: BankAccountLink, today: date | None = None) -> tuple[date, date]:
    """The date range one run of this link should ask the bank for."""
    today = today or datetime.now(timezone.utc).date()
    if link.last_synced_at is not None and link.last_sync_status == "success":
        start = link.last_synced_at.date() - timedelta(days=SYNC_OVERLAP_DAYS)
    elif link.sync_from_date is not None:
        start = link.sync_from_date
    else:
        start = today - timedelta(days=DEFAULT_INITIAL_HISTORY_DAYS)
    if link.sync_from_date is not None:
        start = max(start, link.sync_from_date)
    return min(start, today), today


def is_sync_due(link: BankAccountLink, now: datetime | None = None) -> bool:
    if not link.sync_enabled or link.account_id is None:
        return False
    if link.connection is not None and link.connection.status != "linked":
        return False
    if link.last_synced_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    last = link.last_synced_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now - last >= timedelta(hours=MIN_SYNC_INTERVAL_HOURS)


def import_transactions(db: Session, link: BankAccountLink, rows: list[dict], date_from: date, date_to: date) -> int:
    """Insert the rows this account hasn't already got, resolving each one's
    split through the normal cascade. Commits once, at the end — the row cap
    in fetch/normalize is what keeps that single transaction short."""
    existing_external_ids = {
        row[0] for row in
        db.query(Transaction.external_id)
        .filter(Transaction.account_id == link.account_id, Transaction.external_id.isnot(None))
        .all()
    }
    # Widened by the overlap: the window is asked of the bank by booking date,
    # and a row's own date (when it was made) can fall a few days before it.
    legacy_counts = _legacy_duplicate_counts(
        db, link.account_id, date_from - timedelta(days=SYNC_OVERLAP_DAYS), date_to,
    )

    source, weights = split_engine.resolve_default_weights(db, None, link.account_id)
    if not weights:
        raise EnableBankingError(
            "No split weights could be resolved for this account, so imported "
            "transactions would have no split. Configure the global split weights first."
        )

    created = 0
    for row in rows:
        if created >= MAX_ROWS_PER_SYNC:
            break
        if row["external_id"] in existing_external_ids:
            continue
        legacy_key = (row["date"], round(row["amount"], 2))
        if legacy_counts.get(legacy_key):
            legacy_counts[legacy_key] -= 1
            continue

        transaction = Transaction(
            date=row["date"],
            payee=row["payee"],
            memo=row["memo"],
            amount=row["amount"],
            account_id=link.account_id,
            category_id=None,
            external_id=row["external_id"],
            # .get(), unlike the keys above: these are optional metadata a
            # caller may legitimately not carry, not part of what makes a
            # transaction a transaction.
            raw_source=row.get("raw_source"),
            raw_label=row.get("raw_label"),
            raw_counterparty=row.get("raw_counterparty"),
            raw_transaction_code=row.get("raw_transaction_code"),
            raw_merchant_category_code=row.get("raw_merchant_category_code"),
            raw_initiated_date=row.get("raw_initiated_date"),
            raw_booking_date=row.get("raw_booking_date"),
        )
        db.add(transaction)
        db.flush()
        split_engine.apply_split(db, transaction, weights, source or "custom")
        record_transaction_history(db, transaction, "created", None, source="bank_sync",
                                   changes=splits_created_changes(weights, source or "custom"))
        existing_external_ids.add(row["external_id"])
        created += 1

    if created:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return created


def sync_link(db: Session, link: BankAccountLink) -> int:
    """One link's full cycle, recording success/failure on the link rather
    than raising — both the manual button and the scheduler endpoint call this
    and always want a clean response.

    last_synced_at is stamped *before* the bank calls, the way OneDrive's
    backup does, so a duplicate scheduler tick sees the run as already claimed
    (see is_sync_due). It's written on failure too, which is deliberate:
    banks cut account endpoints off at 4 calls a day, so retrying a broken
    link every minute would burn the day's quota for nothing.
    """
    started_at = datetime.now(timezone.utc)
    link.last_synced_at = started_at
    db.commit()
    try:
        if link.account_id is None:
            raise EnableBankingError("This bank account is not linked to a MyFinance account yet")
        date_from, date_to = sync_window(link, started_at.date())
        raw = fetch_transactions(link.remote_account_uid, date_from, date_to)
        created = import_transactions(db, link, normalize_transactions(raw), date_from, date_to)
        link.last_sync_status = "success"
        link.last_sync_error = None
        link.last_imported_count = created
    except Exception as exc:
        db.rollback()
        link.last_synced_at = started_at
        link.last_sync_status = "failed"
        link.last_sync_error = str(exc)[:2000]
        link.last_imported_count = 0
        created = 0
    db.commit()
    return created


def run_due_syncs(db: Session) -> tuple[int, int]:
    """Sync every link that's due. Returns (links synced, transactions
    created). Each link commits on its own, so one bank being down can't
    strand another's work in an open transaction."""
    links = db.query(BankAccountLink).filter(
        BankAccountLink.sync_enabled.is_(True),
        BankAccountLink.account_id.isnot(None),
    ).all()
    synced = 0
    created = 0
    for link in links:
        if not is_sync_due(link):
            continue
        created += sync_link(db, link)
        synced += 1
    return synced, created


# ── Connections ───────────────────────────────────────────────────────

def redirect_url() -> str:
    return os.environ.get("ENABLE_BANKING_REDIRECT_URL", "http://localhost:8000/api/bank-sync/callback")


def create_connection(db: Session, aspsp_name: str, country: str, language: str = "fr") -> tuple[BankConnection, str]:
    """Registers a pending connection and returns the consent URL to send the
    browser to. The row exists before the redirect so the callback has
    something to match its `state` against."""
    connection = BankConnection(
        aspsp_name=aspsp_name,
        aspsp_country=country,
        state=uuid.uuid4().hex,
        status="pending",
    )
    db.add(connection)
    db.commit()
    db.refresh(connection)
    try:
        result = start_authorization(aspsp_name, country, connection.state, redirect_url(), language)
    except EnableBankingError:
        db.delete(connection)
        db.commit()
        raise
    connection.authorization_id = result.get("authorization_id")
    db.commit()
    return connection, result["url"]


def _parse_valid_until(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
    except ValueError:
        return None


def _session_accounts(session: dict) -> list[dict]:
    """The accounts a session covers, keyed by uid, whatever shape the bank
    put them in. Most ASPSPs fill `accounts` with whole account objects, but
    the field is also specified as a list of bare uid strings, and some put
    the uids in `accounts_data` instead — BoursoBank returned an empty
    `accounts` for a consent it had genuinely granted. Both fields are read
    and merged so one shape never hides the other."""
    by_uid: dict[str, dict] = {}
    for entry in list(session.get("accounts") or []) + list(session.get("accounts_data") or []):
        if isinstance(entry, str):
            uid, details = entry, {}
        elif isinstance(entry, dict):
            uid, details = entry.get("uid"), entry
        else:
            continue
        if not isinstance(uid, str) or not uid:
            continue
        by_uid.setdefault(uid, {}).update(details)
    return [{**details, "uid": uid} for uid, details in by_uid.items()]


def _describe_empty_session(session: dict) -> str:
    """What came back when no account did, so the next look starts from
    evidence rather than a guess. Counts and status only — no account data."""
    return (
        "The bank granted the consent but named no account "
        f"(accounts: {len(session.get('accounts') or [])}, "
        f"accounts_data: {len(session.get('accounts_data') or [])}, "
        f"session status: {session.get('status') or 'unknown'}). "
        "A restricted-mode Enable Banking application only ever sees accounts "
        "linked to it in its Control Panel, so check this bank has one there, "
        "then refresh the accounts or reconnect the bank."
    )


def _record_session_accounts(db: Session, connection: BankConnection, session: dict) -> int:
    """Records the accounts a session covers. Re-consenting to a bank hands
    back new remote uids for the same real accounts, so an existing link is
    re-pointed by IBAN where possible — that's what keeps the account mapping
    and sync history across a renewal."""
    connection.session_id = session.get("session_id") or connection.session_id
    valid_until = _parse_valid_until((session.get("access") or {}).get("valid_until"))
    if valid_until:
        connection.access_valid_until = valid_until
    connection.status = "linked"
    connection.last_error = None

    existing_by_iban = {link.iban: link for link in connection.account_links if link.iban}
    existing_by_uid = {link.remote_account_uid: link for link in connection.account_links}
    accounts = _session_accounts(session)
    for account in accounts:
        uid = account["uid"]
        if not account.get("account_id") and not account.get("name"):
            # A session that names only uids carries no IBAN, holder name or
            # currency; those take their own call. A bank that refuses it
            # still leaves a mappable account rather than nothing at all.
            try:
                account = {**fetch_account_details(uid), "uid": uid}
            except EnableBankingError:
                pass
        iban = (account.get("account_id") or {}).get("iban")
        link = existing_by_uid.get(uid) or (existing_by_iban.get(iban) if iban else None)
        if link is None:
            link = BankAccountLink(connection_id=connection.id, remote_account_uid=uid)
            db.add(link)
        link.remote_account_uid = uid
        link.iban = iban or link.iban
        link.remote_name = account.get("name") or account.get("product") or link.remote_name
        link.currency = account.get("currency") or link.currency
    if not accounts:
        connection.last_error = _describe_empty_session(session)
    db.commit()
    return len(accounts)


def complete_connection(db: Session, connection: BankConnection, code: str) -> None:
    """Turns the callback's code into a session and records its accounts."""
    _record_session_accounts(db, connection, create_session(code))


def refresh_connection_accounts(db: Session, connection: BankConnection) -> int:
    """Re-reads an existing consent's accounts. The consent itself is
    untouched, so a connection whose accounts never landed is repaired
    without sending the user back to their bank."""
    if not connection.session_id:
        raise EnableBankingError("This bank connection has no session to refresh")
    return _record_session_accounts(db, connection, fetch_session(connection.session_id))


def disconnect(db: Session, connection: BankConnection) -> None:
    """Revokes the consent at the bank, then drops the connection and its
    links. Already-imported transactions are left alone — they're ordinary
    MyFinance rows."""
    if connection.session_id:
        try:
            delete_session(connection.session_id)
        except EnableBankingError:
            # An expired or already-revoked session still has to disappear
            # from our side, or the UI would be stuck showing a dead bank.
            pass
    db.delete(connection)
    db.commit()


def verify_scheduler_secret(provided: str | None) -> bool:
    expected = os.environ.get("BANK_SYNC_SCHEDULER_SECRET")
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)
