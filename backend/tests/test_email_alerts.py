from datetime import date, datetime, timedelta

import pytest

import email_alerts
from models import Account, AccountUser, EmailAlert, Transaction


@pytest.fixture()
def outbox(monkeypatch):
    sent = []
    monkeypatch.setattr(email_alerts, "send_message", lambda message: sent.append(message))
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    return sent


def _tx(db, account, payee, amount, created_at, day=date(2026, 10, 14)):
    t = Transaction(date=day, payee=payee, amount=amount, account_id=account.id, created_at=created_at)
    db.add(t)
    db.commit()
    return t


# ── Scheduling ────────────────────────────────────────────────────────

# 2026-10-16 is a Friday; Paris is UTC+2 until 25 October, UTC+1 after.
# The bank sync runs at 0h/6h/12h/18h Paris.
FRI_0400_UTC = datetime(2026, 10, 16, 4, 0)   # 06:00 in Paris, the morning sync
FRI_0500_UTC = datetime(2026, 10, 16, 5, 0)   # 07:00 in Paris


def test_daily_goes_out_with_the_morning_sync_once_a_day():
    yesterday_morning = datetime(2026, 10, 15, 4, 0)
    midnight_sync = datetime(2026, 10, 15, 22, 0)   # Friday 00:00 in Paris
    assert not email_alerts.is_due("daily", yesterday_morning, midnight_sync)
    assert email_alerts.is_due("daily", yesterday_morning, FRI_0400_UTC)
    for later_sync in (datetime(2026, 10, 16, 10, 0), datetime(2026, 10, 16, 16, 0)):
        assert not email_alerts.is_due("daily", FRI_0400_UTC, later_sync)


def test_a_manual_sync_sends_the_daily_alert_whatever_the_time():
    alert = EmailAlert(user_id=1, email="a@b.fr", daily=True, weekly=True, monthly=True,
                       last_daily_sent_at=FRI_0400_UTC, last_weekly_sent_at=FRI_0400_UTC,
                       last_monthly_sent_at=FRI_0400_UTC)
    noon = datetime(2026, 10, 16, 10, 0)
    assert email_alerts.due_frequencies(alert, noon) == []
    assert email_alerts.due_frequencies(alert, noon, manual=True) == ["daily"]


def test_weekly_goes_out_with_the_sunday_evening_sync():
    tuesday = datetime(2026, 10, 13, 8, 0)
    assert not email_alerts.is_due("weekly", tuesday, datetime(2026, 10, 18, 10, 0))  # Sunday 12:00
    sunday_evening = datetime(2026, 10, 18, 16, 0)                                    # Sunday 18:00
    assert email_alerts.is_due("weekly", tuesday, sunday_evening)
    assert not email_alerts.is_due("weekly", sunday_evening, datetime(2026, 10, 19, 4, 0))
    # Scheduler down on Sunday evening: the week's alert goes out with the next sync.
    assert email_alerts.is_due("weekly", tuesday, datetime(2026, 10, 18, 22, 0))


def test_monthly_goes_out_on_the_last_day_evening():
    early_october = datetime(2026, 10, 2, 8, 0)
    assert not email_alerts.is_due("monthly", early_october, datetime(2026, 10, 31, 11, 0))  # 31st 12:00
    # 31 October 18:00 in Paris is 17:00 UTC (winter time since the 25th).
    assert email_alerts.is_due("monthly", early_october, datetime(2026, 10, 31, 17, 0))
    assert not email_alerts.is_due("monthly", datetime(2026, 10, 31, 17, 0), datetime(2026, 11, 15, 17, 0))
    # February: the last day is the 28th.
    assert email_alerts.is_due("monthly", datetime(2027, 2, 1, 8), datetime(2027, 2, 28, 17, 0))


# ── Settings API ──────────────────────────────────────────────────────

def test_get_defaults_to_the_users_email_and_writes_nothing(client, db, sample_user):
    response = client.get(f"/api/alerts/users/{sample_user.id}")
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "test@example.com"
    assert (body["daily"], body["weekly"], body["monthly"]) == (False, False, False)
    assert body["from_address"] == "myfinance@olivex.fr"
    assert db.query(EmailAlert).count() == 0


def test_sending_configured_reflects_smtp_host(client, sample_user, monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    assert client.get(f"/api/alerts/users/{sample_user.id}").json()["sending_configured"] is False
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    assert client.get(f"/api/alerts/users/{sample_user.id}").json()["sending_configured"] is True


def test_put_saves_and_starts_the_window_now(client, db, sample_user):
    response = client.put(
        f"/api/alerts/users/{sample_user.id}",
        json={"email": " me@olivex.fr ", "daily": True, "weekly": False, "monthly": True},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == "me@olivex.fr"
    assert body["daily"] and body["monthly"] and not body["weekly"]
    assert body["last_daily_sent_at"] is not None
    assert body["last_weekly_sent_at"] is None


def test_put_keeps_the_window_of_a_frequency_already_on(client, db, sample_user):
    db.add(EmailAlert(user_id=sample_user.id, email="a@b.fr", daily=True, last_daily_sent_at=datetime(2026, 1, 1)))
    db.commit()
    client.put(f"/api/alerts/users/{sample_user.id}", json={"email": "a@b.fr", "daily": True})
    db.expire_all()
    assert db.get(EmailAlert, sample_user.id).last_daily_sent_at == datetime(2026, 1, 1)


@pytest.mark.parametrize("email", ["nope", "a@b", "a b@c.fr", "@c.fr"])
def test_put_rejects_an_invalid_address(client, sample_user, email):
    response = client.put(f"/api/alerts/users/{sample_user.id}", json={"email": email, "daily": True})
    assert response.status_code == 422


def test_put_requires_an_address_when_a_frequency_is_on(client, sample_user):
    response = client.put(f"/api/alerts/users/{sample_user.id}", json={"email": "", "weekly": True})
    assert response.status_code == 422
    assert client.put(f"/api/alerts/users/{sample_user.id}", json={"email": ""}).status_code == 200


def test_unknown_user_404s(client):
    assert client.get("/api/alerts/users/999").status_code == 404


def test_deleting_a_user_deletes_their_alert(client, db, sample_user):
    db.add(EmailAlert(user_id=sample_user.id, email="a@b.fr", daily=True))
    db.commit()
    assert client.delete(f"/api/users/{sample_user.id}").status_code == 204
    db.expire_all()
    assert db.query(EmailAlert).count() == 0


# ── Content and sending ───────────────────────────────────────────────

def test_lists_only_new_rows_on_the_users_own_accounts(db, sample_user, sample_user2, sample_account_with_user, outbox):
    other = Account(name="Not mine", type="Checking")
    db.add(other)
    db.flush()
    db.add(AccountUser(account_id=other.id, user_id=sample_user2.id, ownership_percentage=100.0))
    last = datetime(2026, 10, 15, 5, 0)
    _tx(db, sample_account_with_user, "Before the window", -1.0, last - timedelta(minutes=1))
    _tx(db, sample_account_with_user, "Carrefour", -42.5, last + timedelta(hours=3))
    _tx(db, sample_account_with_user, "Salaire", 2000.0, last + timedelta(hours=4))
    _tx(db, other, "Someone else's", -9.0, last + timedelta(hours=4))
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=last))
    db.commit()

    assert email_alerts.run_due_alerts(db, FRI_0500_UTC) == (1, 0)
    assert len(outbox) == 1
    message = outbox[0]
    assert message["To"] == "me@olivex.fr"
    assert message["From"] == "MyFinance <myfinance@olivex.fr>"
    assert message["Subject"] == "MyFinance – 2 new transactions (daily alert)"
    text = message.get_body(("plain",)).get_content()
    assert "Carrefour" in text and "Salaire" in text
    assert "Before the window" not in text and "Someone else" not in text
    assert "In +2 000,00 € · Out -42,50 €" in text
    alert = db.get(EmailAlert, sample_user.id)
    assert alert.last_daily_sent_at == FRI_0500_UTC
    assert alert.last_status == "success"

    # The same day, nothing more goes out.
    assert email_alerts.run_due_alerts(db, FRI_0500_UTC + timedelta(hours=1)) == (0, 0)


def test_an_empty_window_sends_nothing_but_moves_on(db, sample_user, sample_account_with_user, outbox):
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=datetime(2026, 10, 15, 5)))
    db.commit()
    assert email_alerts.run_due_alerts(db, FRI_0500_UTC) == (0, 0)
    assert outbox == []
    assert db.get(EmailAlert, sample_user.id).last_daily_sent_at == FRI_0500_UTC


def test_a_failed_send_keeps_the_window_for_the_next_call(db, sample_user, sample_account_with_user, monkeypatch):
    def boom(message):
        raise OSError("connection refused")
    monkeypatch.setattr(email_alerts, "send_message", boom)
    last = datetime(2026, 10, 15, 5)
    _tx(db, sample_account_with_user, "Carrefour", -1.0, last + timedelta(hours=1))
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=last))
    db.commit()
    assert email_alerts.run_due_alerts(db, FRI_0500_UTC) == (0, 1)
    alert = db.get(EmailAlert, sample_user.id)
    assert alert.last_daily_sent_at == last
    assert alert.last_status == "failed"
    assert "connection refused" in alert.last_error


def test_daily_and_weekly_due_together_send_two_emails(db, sample_user, sample_account_with_user, outbox):
    monday = datetime(2026, 10, 19, 5, 0)
    _tx(db, sample_account_with_user, "Carrefour", -1.0, monday - timedelta(hours=2))
    db.add(EmailAlert(
        user_id=sample_user.id, email="me@olivex.fr", daily=True, weekly=True,
        last_daily_sent_at=monday - timedelta(days=1), last_weekly_sent_at=monday - timedelta(days=7),
    ))
    db.commit()
    assert email_alerts.run_due_alerts(db, monday) == (2, 0)
    assert sorted(m["Subject"] for m in outbox) == [
        "MyFinance – 1 new transaction (daily alert)",
        "MyFinance – 1 new transaction (weekly alert)",
    ]


def test_a_long_list_is_capped(db, sample_user, sample_account_with_user, outbox, monkeypatch):
    monkeypatch.setattr(email_alerts, "MAX_LISTED", 2)
    last = datetime(2026, 10, 15, 5)
    for i in range(5):
        _tx(db, sample_account_with_user, f"Row {i}", -1.0, last + timedelta(minutes=i + 1))
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=last))
    db.commit()
    email_alerts.run_due_alerts(db, FRI_0500_UTC)
    text = outbox[0].get_body(("plain",)).get_content()
    assert "5 new transactions" in text
    assert "… and 3 more." in text


def test_html_body_escapes_payees(db, sample_user, sample_account_with_user, outbox):
    last = datetime(2026, 10, 15, 5)
    _tx(db, sample_account_with_user, "<script>x</script>", -1.0, last + timedelta(hours=1))
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=last))
    db.commit()
    email_alerts.run_due_alerts(db, FRI_0500_UTC)
    body = outbox[0].get_body(("html",)).get_content()
    assert "<script>" not in body and "&lt;script&gt;" in body


def test_test_email_sends_the_last_week_without_moving_windows(client, db, sample_user, sample_account_with_user, outbox):
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=datetime(2026, 1, 1)))
    db.commit()
    _tx(db, sample_account_with_user, "Carrefour", -1.0, datetime.utcnow() - timedelta(days=2))
    response = client.post(f"/api/alerts/users/{sample_user.id}/test")
    assert response.status_code == 200
    assert response.json() == {"sent_to": "me@olivex.fr", "transaction_count": 1}
    assert outbox[0]["Subject"].startswith("[Test] MyFinance")
    db.expire_all()
    assert db.get(EmailAlert, sample_user.id).last_daily_sent_at == datetime(2026, 1, 1)


def test_test_email_needs_smtp(client, db, sample_user, monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr"))
    db.commit()
    assert client.post(f"/api/alerts/users/{sample_user.id}/test").status_code == 503


def test_the_scheduled_bank_sync_sends_due_alerts(client, db, sample_user, sample_account_with_user, outbox, monkeypatch):
    import enable_banking
    monkeypatch.setenv("BANK_SYNC_SCHEDULER_SECRET", "s3cret")
    monkeypatch.setattr(enable_banking, "run_due_syncs", lambda db: (0, 0))
    _tx(db, sample_account_with_user, "Carrefour", -1.0, datetime(2026, 1, 2))
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", daily=True, last_daily_sent_at=datetime(2026, 1, 1)))
    db.commit()
    response = client.post("/api/bank-sync/run-due", headers={"X-Bank-Sync-Scheduler-Secret": "s3cret"})
    assert response.status_code == 200
    assert [m["Subject"] for m in outbox] == ["MyFinance – 1 new transaction (daily alert)"]


def test_a_failing_alert_never_fails_the_sync(client, db, sample_user, monkeypatch):
    import enable_banking
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("BANK_SYNC_SCHEDULER_SECRET", "s3cret")
    monkeypatch.setattr(enable_banking, "run_due_syncs", lambda db: (1, 3))
    def boom(db, now=None, manual=False):
        raise RuntimeError("database gone")
    monkeypatch.setattr(email_alerts, "run_due_alerts", boom)
    response = client.post("/api/bank-sync/run-due", headers={"X-Bank-Sync-Scheduler-Secret": "s3cret"})
    assert response.status_code == 200
    assert response.json()["created_count"] == 3


def test_backup_round_trips_alerts(client, db, sample_user):
    db.add(EmailAlert(user_id=sample_user.id, email="me@olivex.fr", weekly=True))
    db.commit()
    archive = client.get("/api/backup/export").content
    db.query(EmailAlert).delete()
    db.commit()
    response = client.post(
        "/api/backup/import?mode=overwrite",
        files={"file": ("backup.zip", archive, "application/zip")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["email_alerts"] == 1
    db.expire_all()
    alert = db.get(EmailAlert, sample_user.id)
    assert alert.email == "me@olivex.fr" and alert.weekly


def test_send_message_uses_starttls_and_logs_in(monkeypatch):
    calls = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            calls.append(("connect", host, port))
        def __enter__(self):
            return self
        def __exit__(self, *exc):
            return False
        def starttls(self, context):
            calls.append(("starttls",))
        def login(self, username, password):
            calls.append(("login", username, password))
        def send_message(self, message):
            calls.append(("send", message["To"]))

    monkeypatch.setattr(email_alerts.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("SMTP_HOST", "smtp-relay.example.com")
    monkeypatch.setenv("SMTP_USERNAME", "user")
    monkeypatch.setenv("SMTP_PASSWORD", "pass")
    monkeypatch.delenv("SMTP_PORT", raising=False)
    message = email_alerts.EmailMessage()
    message["To"] = "me@olivex.fr"
    email_alerts.send_message(message)
    assert calls == [
        ("connect", "smtp-relay.example.com", 587), ("starttls",), ("login", "user", "pass"), ("send", "me@olivex.fr"),
    ]
