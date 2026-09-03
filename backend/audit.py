from datetime import date as date_type

from models import Transaction, TransactionHistory

TRACKED_FIELDS = ("date", "payee", "memo", "amount", "account_id", "category_id", "accounting_month_offset")


def _jsonify(value):
    return value.isoformat() if isinstance(value, date_type) else value


def record_transaction_history(db, transaction: Transaction, action: str,
                                actor_user_id: int | None = None,
                                source: str | None = None,
                                changes: dict | None = None) -> None:
    db.add(TransactionHistory(
        transaction_id=transaction.id,
        action=action,
        source=source,
        changed_by_user_id=actor_user_id,
        date=transaction.date,
        payee=transaction.payee,
        memo=transaction.memo,
        amount=transaction.amount,
        account_id=transaction.account_id,
        category_id=transaction.category_id,
        accounting_month_offset=transaction.accounting_month_offset,
        changes=changes,
    ))


def apply_tracked_changes(transaction: Transaction, fields: dict) -> dict:
    """Assign `fields` onto `transaction`, returning the {field: {old, new}} diff
    for those in TRACKED_FIELDS whose value actually changed.

    Shared by the single and bulk transaction updates, which built the same diff
    independently.
    """
    old_values = {f: getattr(transaction, f) for f in fields if f in TRACKED_FIELDS}
    for field, value in fields.items():
        setattr(transaction, field, value)
    return {
        f: {"old": _jsonify(old), "new": _jsonify(getattr(transaction, f))}
        for f, old in old_values.items() if old != getattr(transaction, f)
    }
