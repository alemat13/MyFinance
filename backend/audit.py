from datetime import date as date_type

from models import Transaction, TransactionHistory

TRACKED_FIELDS = ("date", "payee", "memo", "amount", "account_id", "category_id")


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
        changes=changes,
    ))
