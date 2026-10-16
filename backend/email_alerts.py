"""Email alerts on new transactions.

Each user can ask for a daily, weekly and/or monthly email listing the
transactions that reached MyFinance since the last alert of that frequency,
on the accounts they own (ownership > 0, the same visibility rule as the
user-scoped screens). "New" is `transactions.created_at`, the moment a row
was synced, imported or typed in, not its `date`: a bank reports a card
payment days after it was made, and an alert keyed on `date` would miss it.

Sending is plain SMTP (smtplib, no new dependency), so any transactional
email provider works; `SMTP_HOST`/`SMTP_PORT`/`SMTP_USERNAME`/`SMTP_PASSWORD`
say which, `ALERT_FROM_ADDRESS` is the sender. Like the OneDrive backup and
the bank sync, nothing runs on a timer here (Cloud Run has no long-lived
process): Cloud Scheduler calls `POST /api/alerts/run-due` every hour with
`X-Alerts-Scheduler-Secret`, and `due_frequencies()` decides what is due.
"""
import hmac
import html
import os
import smtplib
import ssl
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from email.utils import formataddr, make_msgid
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session, joinedload

from models import AccountUser, EmailAlert, Transaction, User

FREQUENCIES = ("daily", "weekly", "monthly")
# Alerts follow the household's own clock: a daily alert is "yesterday's
# new transactions, in the morning", in Paris whatever Cloud Run's UTC says.
LOCAL_TZ = ZoneInfo("Europe/Paris")
SEND_HOUR = 7
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


def verify_scheduler_secret(provided: str | None) -> bool:
    expected = os.environ.get("ALERTS_SCHEDULER_SECRET")
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided, expected)


def get_or_create(db: Session, user: User) -> EmailAlert:
    alert = db.get(EmailAlert, user.id)
    if alert is None:
        # Not added to the session: reading the settings of a user who never
        # opened the screen must not write anything.
        alert = EmailAlert(user_id=user.id, email=user.email, daily=False, weekly=False, monthly=False)
    return alert


# ── Scheduling ────────────────────────────────────────────────────────

def _period_key(frequency: str, local: datetime) -> tuple:
    if frequency == "daily":
        return (local.date(),)
    if frequency == "weekly":
        iso = local.isocalendar()
        return (iso.year, iso.week)
    return (local.year, local.month)


def _period_start(frequency: str, local: datetime) -> date:
    if frequency == "daily":
        return local.date()
    if frequency == "weekly":
        return local.date() - timedelta(days=local.weekday())
    return local.date().replace(day=1)


def is_due(frequency: str, last_sent_at: datetime | None, now: datetime) -> bool:
    """Due once per local day / ISO week / month, from SEND_HOUR on the first
    day of it (so a weekly alert goes out on Monday morning, a monthly one on
    the 1st). A call that comes later in the period (the scheduler was down)
    still sends it, once."""
    local_now = now.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ)
    start = datetime.combine(_period_start(frequency, local_now), datetime.min.time(), LOCAL_TZ)
    if local_now < start.replace(hour=SEND_HOUR):
        return False
    if last_sent_at is None:
        return True
    local_last = last_sent_at.replace(tzinfo=timezone.utc).astimezone(LOCAL_TZ)
    return _period_key(frequency, local_last) != _period_key(frequency, local_now)


def due_frequencies(alert: EmailAlert, now: datetime) -> list[str]:
    if not alert.email:
        return []
    return [
        f for f in FREQUENCIES
        if getattr(alert, f) and is_due(f, getattr(alert, f"last_{f}_sent_at"), now)
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
    app_url = os.environ.get("FRONTEND_BASE_URL", "")

    def line(t: Transaction) -> tuple[str, str, str, str, str]:
        currency = t.account.currency if t.account else "EUR"
        return (
            t.date.strftime("%d/%m/%Y"),
            t.account.name if t.account else "",
            t.payee,
            t.category.name if t.category else "Uncategorized",
            _money(t.amount, currency),
        )

    total_lines = [
        f"In {_money(income, cur)} · Out {_money(spent, cur)}" for cur, (income, spent) in sorted(totals.items())
    ]

    text = [f"Hello {user.name},", "", f"{count} new {noun} reached MyFinance on your accounts."]
    text += total_lines + [""]
    text += ["  ".join(cells) for cells in map(line, listed)]
    if hidden:
        text.append(f"… and {hidden} more.")
    if app_url:
        text += ["", f"Open MyFinance: {app_url}"]
    text += ["", "You can change or stop these alerts in MyFinance, More → Email alerts."]

    cell = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb;"'
    body_rows = "".join(
        "<tr>"
        + "".join(
            f'<td {cell[:-1]}{"text-align:right;white-space:nowrap;" if i == 4 else ""}">{html.escape(v)}</td>'
            for i, v in enumerate(cells)
        )
        + "</tr>"
        for cells in map(line, listed)
    )
    heads = "".join(
        f'<th {cell[:-1]}text-align:{"right" if i == 4 else "left"};">{h}</th>'
        for i, h in enumerate(("Date", "Account", "Payee", "Category", "Amount"))
    )
    html_body = f"""<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:14px;color:#111827;">
<p>Hello {html.escape(user.name)},</p>
<p><strong>{count} new {noun}</strong> reached MyFinance on your accounts.<br>{"<br>".join(html.escape(l) for l in total_lines)}</p>
<table style="border-collapse:collapse;font-size:13px;"><thead><tr>{heads}</tr></thead><tbody>{body_rows}</tbody></table>
{f"<p>… and {hidden} more.</p>" if hidden else ""}
{f'<p><a href="{html.escape(app_url)}">Open MyFinance</a></p>' if app_url else ""}
<p style="color:#6b7280;font-size:12px;">You can change or stop these alerts in MyFinance, More → Email alerts.</p>
</body></html>"""

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = formataddr(("MyFinance", from_address()))
    message["To"] = alert.email
    message["Message-ID"] = make_msgid(domain=from_address().rpartition("@")[2] or None)
    message.set_content("\n".join(text))
    message.add_alternative(html_body, subtype="html")
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


def run_due_alerts(db: Session, now: datetime | None = None) -> tuple[int, int]:
    """Sends every alert that's due. Returns (emails sent, alerts failed).
    Each user commits on their own, so one bad address can't stop the
    others; a failure leaves that window where it was, for the next call."""
    now = now or _utcnow()
    sent = 0
    failed = 0
    alerts = db.query(EmailAlert).all()
    for alert in alerts:
        frequencies = due_frequencies(alert, now)
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
