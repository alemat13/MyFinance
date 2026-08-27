from dataclasses import dataclass

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import CategorySplit, GlobalSplitWeight, Transaction, TransactionSplit, AccountUser


@dataclass
class Share:
    user_id: int
    share_amount: float
    source: str  # 'manual' | 'category_default' | 'global_default'


def _distribute(amount: float, weights: dict[int, float], source: str) -> list[Share]:
    total = sum(weights.values())
    ordered_ids = sorted(weights)
    shares = []
    running = 0.0
    for user_id in ordered_ids[:-1]:
        share = round(amount * weights[user_id] / total, 2)
        shares.append(Share(user_id, share, source))
        running += share
    last_id = ordered_ids[-1]
    shares.append(Share(last_id, round(amount - running, 2), source))
    return shares


def resolve_split(
    db: Session,
    amount: float,
    category_id: int | None,
    override: list[tuple[int, float]] | None = None,
    required: bool = False,
    account_id: int | None = None,
) -> list[Share]:
    """Resolve the per-user split for a transaction amount.

    Precedence: explicit override > category default > global default weighting.
    If `required` is False and nothing is configured for tiers 2/3, returns []
    rather than raising — automatic split computation is opt-in until a
    household configures category splits or global weights.

    Accounts with a single owner are never auto-split by category/global
    defaults — only joint accounts (more than one owner) get a default split.
    """
    if override is not None:
        total = sum(amount for _, amount in override)
        if abs(total - amount) > 0.01:
            raise HTTPException(422, f"Split amounts must sum to {amount}, got {total}")
        return [Share(user_id, share_amount, "manual") for user_id, share_amount in override]

    if account_id is not None:
        owners = db.query(AccountUser.user_id).filter(
            AccountUser.account_id == account_id, AccountUser.ownership_percentage > 0
        ).all()
        if len(owners) <= 1:
            if required:
                raise HTTPException(422, "Account has a single owner; no default split applies")
            return []

    if category_id is not None:
        cat_splits = db.query(CategorySplit).filter(CategorySplit.category_id == category_id).all()
        if cat_splits:
            weights = {c.user_id: c.split_percentage for c in cat_splits}
            return _distribute(amount, weights, "category_default")

    global_weights = db.query(GlobalSplitWeight).filter(GlobalSplitWeight.weight > 0).all()
    if global_weights:
        weights = {g.user_id: g.weight for g in global_weights}
        return _distribute(amount, weights, "global_default")

    if required:
        raise HTTPException(422, "No split configuration available: no category default and no global split weights configured")
    return []


def apply_split(db: Session, transaction: Transaction, override: list[tuple[int, float]] | None = None, amount_changed: bool = False):
    """(Re)computes and persists TransactionSplit rows for a transaction."""
    existing = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction.id).all()
    existing_is_manual = bool(existing) and all(s.source == "manual" for s in existing)

    if override is None and existing_is_manual:
        if amount_changed:
            raise HTTPException(
                422,
                "Transaction has a manual split; provide split_overrides matching the new amount",
            )
        return  # no-op: leave the existing manual split untouched

    shares = resolve_split(
        db, transaction.amount, transaction.category_id,
        override=override, required=False, account_id=transaction.account_id,
    )

    db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction.id).delete()
    for share in shares:
        db.add(TransactionSplit(
            transaction_id=transaction.id,
            user_id=share.user_id,
            share_amount=share.share_amount,
            source=share.source,
        ))


def compute_balances(db: Session, user_id: int | None = None) -> list[tuple[int, str, str, float]]:
    """Net position per user per currency: sum(share_amount) - sum(live paid_amount).

    Positive = this user paid more than they were liable for (a creditor: the
    household owes them). Negative = they owe the household. Sums to ~0 across
    all users within a currency, since per transaction both paid_amount and
    share_amount sum to the transaction's amount. Balances are never summed
    across currencies — each (user, currency) pair is tracked independently,
    since accounts (and therefore transactions) can be in different currencies.

    Pass user_id to compute only that user's balance: the "received" and
    "paid" queries are filtered to them, though the underlying set of
    split transactions still spans the whole household (an owner's paid-side
    liability applies whenever their account's transaction was split, even
    with a zero share for them).
    """
    from models import Account, User

    net: dict[tuple[int, str], float] = {}

    splits_query = (
        db.query(TransactionSplit, Account.currency)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
    )
    if user_id is not None:
        splits_query = splits_query.filter(TransactionSplit.user_id == user_id)
    for s, currency in splits_query.all():
        key = (s.user_id, currency)
        net[key] = net.get(key, 0.0) + s.share_amount

    # Only transactions that actually have a resolved split contribute a
    # "paid" side — an unsplit transaction carries no liability claim, so it
    # must not skew anyone's balance. This must consider every split
    # transaction in the household, not just user_id's own splits above.
    split_transaction_ids = {
        row[0] for row in db.query(TransactionSplit.transaction_id).distinct().all()
    }
    if split_transaction_ids:
        ownerships_query = (
            db.query(Transaction.id, Transaction.amount, Account.currency, AccountUser.user_id, AccountUser.ownership_percentage)
            .join(Account, Account.id == Transaction.account_id)
            .join(AccountUser, AccountUser.account_id == Transaction.account_id)
            .filter(Transaction.id.in_(split_transaction_ids))
        )
        if user_id is not None:
            ownerships_query = ownerships_query.filter(AccountUser.user_id == user_id)
        for _, amount, currency, uid, ownership_percentage in ownerships_query.all():
            paid = amount * ownership_percentage / 100.0
            key = (uid, currency)
            net[key] = net.get(key, 0.0) - paid

    users_query = db.query(User)
    if user_id is not None:
        users_query = users_query.filter(User.id == user_id)
    users = {u.id: u.name for u in users_query.all()}
    return [
        (uid, users.get(uid, "Unknown"), currency, round(net_position, 2))
        for (uid, currency), net_position in net.items()
    ]
