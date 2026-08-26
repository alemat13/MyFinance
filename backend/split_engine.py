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
) -> list[Share]:
    """Resolve the per-user split for a transaction amount.

    Precedence: explicit override > category default > global default weighting.
    If `required` is False and nothing is configured for tiers 2/3, returns []
    rather than raising — automatic split computation is opt-in until a
    household configures category splits or global weights.
    """
    if override is not None:
        total = sum(amount for _, amount in override)
        if abs(total - amount) > 0.01:
            raise HTTPException(422, f"Split amounts must sum to {amount}, got {total}")
        return [Share(user_id, share_amount, "manual") for user_id, share_amount in override]

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

    shares = resolve_split(db, transaction.amount, transaction.category_id, override=override, required=False)

    db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction.id).delete()
    for share in shares:
        db.add(TransactionSplit(
            transaction_id=transaction.id,
            user_id=share.user_id,
            share_amount=share.share_amount,
            source=share.source,
        ))


def compute_balances(db: Session) -> list[tuple[int, str, str, float]]:
    """Net position per user per currency: sum(share_amount) - sum(live paid_amount).

    Positive = this user paid more than they were liable for (a creditor: the
    household owes them). Negative = they owe the household. Sums to ~0 across
    all users within a currency, since per transaction both paid_amount and
    share_amount sum to the transaction's amount. Balances are never summed
    across currencies — each (user, currency) pair is tracked independently,
    since accounts (and therefore transactions) can be in different currencies.
    """
    from models import Account, User

    net: dict[tuple[int, str], float] = {}

    splits = (
        db.query(TransactionSplit, Account.currency)
        .join(Transaction, Transaction.id == TransactionSplit.transaction_id)
        .join(Account, Account.id == Transaction.account_id)
        .all()
    )
    for s, currency in splits:
        key = (s.user_id, currency)
        net[key] = net.get(key, 0.0) + s.share_amount

    # Only transactions that actually have a resolved split contribute a
    # "paid" side — an unsplit transaction carries no liability claim, so it
    # must not skew anyone's balance.
    split_transaction_ids = {s.transaction_id for s, _ in splits}
    if split_transaction_ids:
        ownerships = (
            db.query(Transaction.id, Transaction.amount, Account.currency, AccountUser.user_id, AccountUser.ownership_percentage)
            .join(Account, Account.id == Transaction.account_id)
            .join(AccountUser, AccountUser.account_id == Transaction.account_id)
            .filter(Transaction.id.in_(split_transaction_ids))
            .all()
        )
        for _, amount, currency, user_id, ownership_percentage in ownerships:
            paid = amount * ownership_percentage / 100.0
            key = (user_id, currency)
            net[key] = net.get(key, 0.0) - paid

    users = {u.id: u.name for u in db.query(User).all()}
    return [
        (user_id, users.get(user_id, "Unknown"), currency, round(net_position, 2))
        for (user_id, currency), net_position in net.items()
    ]
