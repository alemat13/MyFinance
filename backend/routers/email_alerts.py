from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import email_alerts
from database import get_db
from models import User
from rules import validate_alert_email
from schemas import EmailAlertOut, EmailAlertTestResult, EmailAlertUpdate

router = APIRouter(prefix="/api/alerts")


def _user(db: Session, user_id: int) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(404, "User not found")
    return user


def _out(alert) -> EmailAlertOut:
    out = EmailAlertOut.model_validate(alert)
    out.sending_configured = email_alerts.smtp_configured()
    out.from_address = email_alerts.from_address()
    return out


@router.get("/users/{user_id}", response_model=EmailAlertOut)
def get_alert(user_id: int, db: Session = Depends(get_db)):
    return _out(email_alerts.get_or_create(db, _user(db, user_id)))


@router.put("/users/{user_id}", response_model=EmailAlertOut)
def update_alert(user_id: int, data: EmailAlertUpdate, db: Session = Depends(get_db)):
    user = _user(db, user_id)
    email = (data.email or "").strip() or None
    validate_alert_email(email, data.daily or data.weekly or data.monthly)
    alert = email_alerts.get_or_create(db, user)
    db.add(alert)
    now = email_alerts._utcnow()
    for frequency in email_alerts.FREQUENCIES:
        turned_on = getattr(data, frequency) and not getattr(alert, frequency)
        # A frequency switched on starts counting now: its first email holds
        # what arrives from here on, not the whole history before it.
        if turned_on:
            setattr(alert, f"last_{frequency}_sent_at", now)
        setattr(alert, frequency, getattr(data, frequency))
    alert.email = email
    db.commit()
    db.refresh(alert)
    return _out(alert)


@router.post("/users/{user_id}/test", response_model=EmailAlertTestResult)
def send_test(user_id: int, db: Session = Depends(get_db)):
    user = _user(db, user_id)
    alert = email_alerts.get_or_create(db, user)
    if not alert.email:
        raise HTTPException(422, "Save an email address first")
    if not email_alerts.smtp_configured():
        raise HTTPException(503, "Email sending is not configured on the server")
    try:
        count = email_alerts.send_test(db, user, alert)
    except Exception as exc:
        raise HTTPException(502, f"The email could not be sent: {exc}"[:500])
    return EmailAlertTestResult(sent_to=alert.email, transaction_count=count)
