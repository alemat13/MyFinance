"""Turning a bank transaction (Enable Banking's JSON) into a MyFinance one.

Pure functions, no database and no HTTP: enable_banking.py fetches the rows and
imports what normalize_transactions() returns. Kept apart so the field mapping,
the payee clean-up and the deduplication fingerprint can be read (and tested)
on their own. enable_banking re-exports clean_label, normalize_transactions and
RAW_SOURCE, so existing callers are unchanged.
"""

import hashlib
import json
import re
from datetime import date
from pathlib import Path

RAW_SOURCE = "enable_banking"

# Regexes stripped from a synced row's payee (never its memo), first match
# only, in order — card, transfer and direct-debit prefixes, card-number and
# date suffixes. Edited in the JSON file rather than here so a new bank
# wording needs no code change, and an entry may be a bare pattern or an
# object carrying a `note` explaining what it matches, since eleven bare
# regexes are not reviewable. A pattern that fails to compile fails at import,
# i.e. at startup, rather than silently on the first sync.
#
# Measured against the production ledger: over the rows whose displayed payee
# is an extract of the bank's wording, the two patterns this list started with
# rebuilt 70.1% of them exactly and these eleven rebuild 97.0%. The remaining
# 3% are renames that carry outside knowledge, which no pattern can reach.
_CONFIG_PATH = Path(__file__).parent / "bank_sync_config.json"
_LABEL_CLEANUP_PATTERNS: list[re.Pattern] = [
    re.compile(entry["pattern"] if isinstance(entry, dict) else entry)
    for entry in json.loads(_CONFIG_PATH.read_text(encoding="utf-8")).get(
        "label_cleanup_patterns", []
    )
]


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

        normalized.append(
            {
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
                "raw_merchant_category_code": (
                    str(raw["merchant_category_code"])[:10]
                    if raw.get("merchant_category_code")
                    else None
                ),
                "raw_initiated_date": _initiated_date(raw),
                "raw_booking_date": _booking_date(raw),
            }
        )
    return normalized
