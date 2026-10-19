"""Email alerts on new transactions.

Each user can ask for a daily, weekly and/or monthly email listing the
transactions that reached MyFinance since the last alert of that frequency,
on the accounts they own (ownership > 0, the same visibility rule as the
user-scoped screens). "New" is `transactions.created_at`, the moment a row
was synced, imported or typed in, not its `date`: a bank reports a card
payment days after it was made, and an alert keyed on `date` would miss it.

Sending is plain SMTP (smtplib, no new dependency), so any transactional
email provider works; `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`
say which, `ALERT_FROM_ADDRESS` is the sender.

Nothing runs on a timer of its own: alerts ride the bank sync, so an email
never goes out just before the transactions it should have listed arrive.
`POST /api/bank-sync/run-due` (Cloud Scheduler, 0h/6h/12h/18h Paris) calls
`run_quietly(db)` once its links have synced, and `due_frequencies()` decides
what that call sends: the daily alert once a day (the 6h sync), the weekly
one on Sunday evening (the 18h sync), the monthly one on the last day of the
month (the 18h sync). A sync started by hand calls `run_quietly(db,
manual=True)`, which also sends the daily alert of whoever has something new
since their last one, whatever the time.
"""
import base64
import html
import json
import logging
import os
import re
import smtplib
import ssl
import struct
import zlib
from datetime import date, datetime, time, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from models import AccountUser, EmailAlert, Transaction, User

logger = logging.getLogger(__name__)

FREQUENCIES = ("daily", "weekly", "monthly")
# Alerts follow the household's own clock, in Paris whatever Cloud Run's UTC
# says. Each frequency falls due at a boundary: every day at DAILY_AT, every
# Sunday at PERIOD_END_AT, and the last day of every month at PERIOD_END_AT.
# Half an hour ahead of the 6h and 18h syncs that should send them, so a
# scheduler call landing a few seconds early still counts.
LOCAL_TZ = ZoneInfo("Europe/Paris")
DAILY_AT = time(5, 30)
PERIOD_END_AT = time(17, 30)
# Period a first alert covers, when that frequency has never been sent.
FIRST_WINDOW = {"daily": timedelta(days=1), "weekly": timedelta(days=7), "monthly": timedelta(days=31)}
# An email lists at most this many rows (the most recent first) and counts
# the rest: an overwrite restore or a big import can make thousands of rows
# "new" at once, and nobody reads a 30 000-line email.
MAX_LISTED = 100

FREQUENCY_LABELS = {"daily": "Daily", "weekly": "Weekly", "monthly": "Monthly"}


class AlertConfigError(RuntimeError):
    """Raised when sending is attempted without SMTP configured."""


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST"))


def from_address() -> str:
    return os.environ.get("ALERT_FROM_ADDRESS", "myfinance@olivex.fr")


def get_or_create(db: Session, user: User) -> EmailAlert:
    alert = db.get(EmailAlert, user.id)
    if alert is None:
        # Not added to the session: reading the settings of a user who never
        # opened the screen must not write anything.
        alert = EmailAlert(user_id=user.id, email=user.email, daily=False, weekly=False, monthly=False)
    return alert


# ── Scheduling ────────────────────────────────────────────────────────

def _last_day_of_month(day: date) -> date:
    following = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return following - timedelta(days=1)


def last_boundary(frequency: str, now: datetime) -> datetime:
    """The latest moment at or before `now` (naive UTC) at which
    `frequency` fell due, as naive UTC."""
    local_now = now.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ)
    today = local_now.date()

    def at(day: date, hour: time) -> datetime:
        return datetime.combine(day, hour, LOCAL_TZ)

    if frequency == "daily":
        boundary = at(today, DAILY_AT)
        if boundary > local_now:
            boundary = at(today - timedelta(days=1), DAILY_AT)
    elif frequency == "weekly":
        sunday = today - timedelta(days=(today.weekday() + 1) % 7)
        boundary = at(sunday, PERIOD_END_AT)
        if boundary > local_now:
            boundary = at(sunday - timedelta(days=7), PERIOD_END_AT)
    else:
        boundary = at(_last_day_of_month(today), PERIOD_END_AT)
        if boundary > local_now:
            boundary = at(_last_day_of_month(today.replace(day=1) - timedelta(days=1)), PERIOD_END_AT)
    return boundary.astimezone(timezone.utc).replace(tzinfo=None)


def is_due(frequency: str, last_sent_at: datetime | None, now: datetime) -> bool:
    """Due when a boundary has passed since the last alert of that
    frequency. A sync that comes later (the scheduler was down) still sends
    it, once, covering everything since the last one."""
    return last_sent_at is None or last_sent_at < last_boundary(frequency, now)


def due_frequencies(alert: EmailAlert, now: datetime, manual: bool = False) -> list[str]:
    """`manual` (a sync started by hand) makes the daily alert due whatever
    the time: that is when the person wants to hear about what just came
    in. Weekly and monthly keep to their boundaries."""
    if not alert.email:
        return []
    return [
        f for f in FREQUENCIES
        if getattr(alert, f)
        and ((manual and f == "daily") or is_due(f, getattr(alert, f"last_{f}_sent_at"), now))
    ]


# ── Content ───────────────────────────────────────────────────────────

def new_transactions(db: Session, user_id: int, start: datetime, end: datetime) -> list[Transaction]:
    owned = db.query(AccountUser.account_id).filter(
        AccountUser.user_id == user_id, AccountUser.ownership_percentage > 0
    )
    return (
        db.query(Transaction)
        .options(joinedload(Transaction.account), joinedload(Transaction.category))
        .filter(
            Transaction.account_id.in_(owned),
            Transaction.created_at > start,
            Transaction.created_at <= end,
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )


def _money(amount: float, currency: str) -> str:
    sign = "-" if amount < 0 else "+" if amount > 0 else ""
    whole, cents = f"{abs(amount):,.2f}".split(".")
    return f"{sign}{whole.replace(',', ' ')},{cents} {'€' if currency == 'EUR' else currency}"


# Colours of the app (Tailwind): green-600/red-600 for amounts, as in the
# Transactions list; slate for text; utils/categoryColors.ts for categories.
CREDIT_COLOR = "#16a34a"
DEBIT_COLOR = "#dc2626"
UNCATEGORIZED_COLOR = "#94a3b8"
DEFAULT_CATEGORY_COLOR = "#64748b"
_HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
_ICONS: dict | None = None


def _icon_masks() -> dict:
    """Alpha masks of the category icons, rasterised from the app's own
    lucide icons by frontend/scripts/build-email-icons.mjs: email clients
    don't render SVG, so each icon goes out as a small PNG."""
    global _ICONS
    if _ICONS is None:
        with open(Path(__file__).with_name("email_icons.json"), encoding="utf-8") as f:
            _ICONS = json.load(f)
    return _ICONS


def _rgb(color: str) -> tuple[int, int, int]:
    return int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)


def icon_png(icon: str | None, color: str) -> bytes:
    """The category icon drawn in `color` on a transparent background, as a
    PNG (written by hand with zlib: no imaging library in the image)."""
    masks = _icon_masks()
    size = masks["size"]
    alpha = zlib.decompress(base64.b64decode(masks["icons"].get(icon or "") or masks["icons"][masks["default"]]))
    r, g, b = _rgb(color)
    raw = b"".join(
        b"\x00" + b"".join(bytes((r, g, b, a)) for a in alpha[y * size:(y + 1) * size]) for y in range(size)
    )

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def _tint(color: str) -> str:
    """`color` at 15% over white: the background of the app's category
    badge (`${color}26`), flattened since email clients ignore #rrggbbaa."""
    return "#" + "".join(f"{round(c * 0x26 / 255 + 255 * (1 - 0x26 / 255)):02x}" for c in _rgb(color))


def _category_style(t: Transaction) -> tuple[str, str | None, str]:
    """(name, icon, colour) as the app's CategoryBadge shows them."""
    if t.category is None:
        return "Uncategorized", None, UNCATEGORIZED_COLOR
    color = t.category.color if t.category.color and _HEX.match(t.category.color) else DEFAULT_CATEGORY_COLOR
    return t.category.name, t.category.icon, color


def _amount_color(amount: float) -> str:
    return CREDIT_COLOR if amount >= 0 else DEBIT_COLOR


def _by_account(rows: list[Transaction]) -> list[tuple[str, str, list[Transaction]]]:
    """(account name, currency, rows) per account, by account name, each
    keeping the rows' own order (most recent first)."""
    groups: dict[int | None, list[Transaction]] = {}
    for t in rows:
        groups.setdefault(t.account_id, []).append(t)
    out = [
        (g[0].account.name if g[0].account else "", g[0].account.currency if g[0].account else "EUR", g)
        for g in groups.values()
    ]
    return sorted(out, key=lambda item: item[0].lower())


def build_message(user: User, alert: EmailAlert, frequency: str, rows: list[Transaction]) -> EmailMessage:
    count = len(rows)
    label = FREQUENCY_LABELS[frequency]
    noun = "transaction" if count == 1 else "transactions"
    subject = f"MyFinance – {count} new {noun} ({label.lower()} alert)"

    totals: dict[str, tuple[float, float]] = {}
    for t in rows:
        currency = t.account.currency if t.account else "EUR"
        income, spent = totals.get(currency, (0.0, 0.0))
        if t.amount >= 0:
            income += t.amount
        else:
            spent += t.amount
        totals[currency] = (income, spent)

    listed = rows[:MAX_LISTED]
    hidden = count - len(listed)
    groups = _by_account(listed)
    app_url = os.environ.get("FRONTEND_BASE_URL", "")
    esc = html.escape

    # ── Plain text ──
    text = [f"Hello {user.name},", "", f"{count} new {noun} reached MyFinance on your accounts."]
    text += [f"In {_money(i, cur)} · Out {_money(o, cur)}" for cur, (i, o) in sorted(totals.items())]
    for name, currency, group in groups:
        text += ["", f"== {name} =="]
        for t in group:
            category = _category_style(t)[0]
            text.append(f"{t.date.strftime('%d/%m/%Y')}  {t.payee}  {category}  {_money(t.amount, currency)}")
            if t.memo:
                text.append(f"    {t.memo}")
    if hidden:
        text += ["", f"… and {hidden} more."]
    if app_url:
        text += ["", f"Open MyFinance: {app_url}"]
    text += ["", "You can change or stop these alerts in MyFinance, More → Email alerts."]

    # ── HTML: cards like the app's Transactions list on a phone, grouped by
    # account. Tables and inline styles only, which is what email clients
    # (Gmail first) keep. ──
    images: dict[tuple[str | None, str], str] = {}

    def icon_cid(icon: str | None, color: str) -> str:
        key = (icon, color)
        if key not in images:
            images[key] = make_msgid(domain="myfinance")[1:-1]
        return images[key]

    font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;"

    def money_span(amount: float, currency: str, weight: int = 600) -> str:
        return (
            f'<span style="color:{_amount_color(amount)};font-weight:{weight};white-space:nowrap;">'
            f"{esc(_money(amount, currency))}</span>"
        )

    def card(t: Transaction, currency: str) -> str:
        name, icon, color = _category_style(t)
        name_style = "color:#94a3b8;font-style:italic;" if t.category is None else "color:#334155;"
        memo = (
            f'<tr><td colspan="2" style="padding-top:6px;font-size:12px;color:#64748b;">{esc(t.memo)}</td></tr>'
            if t.memo else ""
        )
        return f"""<tr><td style="padding:0 0 8px 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;">
<tr><td style="padding:12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font-size:15px;font-weight:600;color:#0f172a;word-break:break-word;">{esc(t.payee)}</td>
<td align="right" valign="top" style="font-size:15px;padding-left:8px;">{money_span(t.amount, currency)}</td></tr>
<tr><td colspan="2" style="font-size:12px;color:#64748b;padding-top:2px;">{t.date.strftime('%d/%m/%Y')}</td></tr>
<tr><td colspan="2" style="padding-top:8px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td width="20" height="20" align="center" valign="middle" bgcolor="{_tint(color)}" style="width:20px;height:20px;background:{_tint(color)};border-radius:6px;line-height:0;">
<img src="cid:{icon_cid(icon, color)}" width="12" height="12" alt="" style="display:block;border:0;width:12px;height:12px;"></td>
<td style="padding-left:6px;font-size:13px;{name_style}">{esc(name)}</td>
</tr></table></td></tr>{memo}
</table></td></tr></table></td></tr>"""

    def section(name: str, currency: str, group: list[Transaction]) -> str:
        net = sum(t.amount for t in group)
        n = len(group)
        return f"""<tr><td style="padding:16px 4px 8px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:14px;font-weight:700;color:#0f172a;">{esc(name)}
<span style="font-weight:400;color:#64748b;font-size:12px;">&nbsp;· {n} {"transaction" if n == 1 else "transactions"}</span></td>
<td align="right" style="font-size:13px;">{money_span(net, currency, 600)}</td>
</tr></table></td></tr>{"".join(card(t, currency) for t in group)}"""

    summary = "".join(
        f'<div style="margin-top:6px;font-size:14px;">In {money_span(i, cur)}'
        f'<span style="color:#94a3b8;"> &nbsp;·&nbsp; </span>Out {money_span(o, cur)}</div>'
        for cur, (i, o) in sorted(totals.items())
    )
    more = (
        f'<tr><td style="padding:4px;font-size:13px;color:#64748b;">… and {hidden} more.</td></tr>' if hidden else ""
    )
    button = (
        f'<tr><td align="center" style="padding:16px 0 4px 0;"><a href="{esc(app_url)}" '
        f'style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-weight:600;'
        f'font-size:14px;padding:10px 20px;border-radius:8px;">Open MyFinance</a></td></tr>'
        if app_url else ""
    )
    html_body = f"""<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#f1f5f9;{font}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f1f5f9" style="background:#f1f5f9;">
<tr><td align="center" style="padding:16px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;{font}">
<tr><td style="padding:0 4px 12px 4px;font-size:18px;font-weight:700;color:#4f46e5;">MyFinance</td></tr>
<tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:14px 16px;color:#0f172a;font-size:14px;">
Hello {esc(user.name)},<br><strong>{count} new {noun}</strong> reached MyFinance on your accounts.{summary}</td></tr>
{"".join(section(*g) for g in groups)}{more}{button}
<tr><td style="padding:16px 4px 0 4px;color:#94a3b8;font-size:12px;">You can change or stop these alerts in MyFinance, More → Email alerts.</td></tr>
</table></td></tr></table></body></html>"""

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("MyFinance", from_address()))
    message["To"] = alert.email
    message["Message-ID"] = make_msgid(domain=from_address().rpartition("@")[2] or None)
    message.set_content("\n".join(text))
    message.add_alternative(html_body, subtype="html")
    html_part = message.get_payload()[1]
    for (icon, color), cid in images.items():
        html_part.add_related(icon_png(icon, color), "image", "png", cid=f"<{cid}>", filename=f"{icon or 'none'}.png")
    return message


# ── Sending ───────────────────────────────────────────────────────────

def send_message(message: EmailMessage) -> None:
    host = os.environ.get("SMTP_HOST")
    if not host:
        raise AlertConfigError("Email sending is not configured on the server (SMTP_HOST is not set)")
    port = int(os.environ.get("SMTP_PORT", "587"))
    username = os.environ.get("SMTP_USERNAME")
    password = os.environ.get("SMTP_PASSWORD")
    context = ssl.create_default_context()
    # 465 is TLS from the first byte; anything else (587) upgrades with
    # STARTTLS. Cloud Run blocks outbound port 25, so neither uses it.
    if port == 465:
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
    with server:
        if port != 465:
            server.starttls(context=context)
        if username and password:
            server.login(username, password)
        server.send_message(message)


def send_alert(db: Session, user: User, alert: EmailAlert, frequency: str, now: datetime) -> bool:
    """Sends one frequency's alert and moves its window on. Returns whether
    an email went out: a window with nothing new sends nothing but still
    moves on, so the next email doesn't re-cover an empty day."""
    last = getattr(alert, f"last_{frequency}_sent_at")
    start = last or now - FIRST_WINDOW[frequency]
    rows = new_transactions(db, user.id, start, now)
    sent = False
    if rows:
        send_message(build_message(user, alert, frequency, rows))
        sent = True
    setattr(alert, f"last_{frequency}_sent_at", now)
    return sent


def run_due_alerts(db: Session, now: datetime | None = None, manual: bool = False) -> tuple[int, int]:
    """Sends every alert that's due. Returns (emails sent, alerts failed).
    Each user commits on their own, so one bad address can't stop the
    others; a failure leaves that window where it was, for the next call."""
    now = now or _utcnow()
    sent = 0
    failed = 0
    alerts = db.query(EmailAlert).all()
    for alert in alerts:
        frequencies = due_frequencies(alert, now, manual)
        if not frequencies:
            continue
        user = db.get(User, alert.user_id)
        if user is None:
            continue
        for frequency in frequencies:
            try:
                if send_alert(db, user, alert, frequency, now):
                    sent += 1
                alert.last_status = "success"
                alert.last_error = None
            except Exception as exc:
                db.rollback()
                alert = db.get(EmailAlert, user.id)
                alert.last_status = "failed"
                alert.last_error = f"{FREQUENCY_LABELS[frequency]} alert: {exc}"[:2000]
                failed += 1
            db.commit()
    return sent, failed


def run_quietly(db: Session, manual: bool = False) -> None:
    """For the bank sync: an alert that can't go out must never fail the
    sync that triggered it, the same rule as the categorizer and the rules.
    Without SMTP configured there is nothing to try."""
    if not smtp_configured():
        return
    try:
        run_due_alerts(db, manual=manual)
    except Exception:
        db.rollback()
        logger.exception("Email alerts failed after a bank sync")


def send_test(db: Session, user: User, alert: EmailAlert, now: datetime | None = None) -> int:
    """Sends right now what a weekly alert would hold (the last 7 days),
    whether or not that list is empty, without moving any window. Returns
    the number of transactions listed."""
    now = now or _utcnow()
    rows = new_transactions(db, user.id, now - FIRST_WINDOW["weekly"], now)
    message = build_message(user, alert, "weekly", rows)
    message.replace_header("Subject", f"[Test] {message['Subject']}")
    send_message(message)
    return len(rows)
