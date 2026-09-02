from dataclasses import dataclass

from sqlalchemy.orm import Session

from models import AccountSplitWeight, AccountUser, CategorySplit, GlobalSplitWeight, Transaction, TransactionSplit


@dataclass
class Share:
    user_id: int
    share_amount: float
    weight: int


def prorate(amount: float, weights: dict[int, int]) -> list[Share]:
    """Prorate `amount` across `weights` (a plain {user_id: weight} dict).

    Each user except the last (sorted ascending by user_id) gets
    round(amount * weight / total_weight, 2); the last user absorbs the
    exact remainder so shares always sum to `amount` to the cent.

    If every weight is 0 (but the dict is non-empty — e.g. the user
    explicitly typed 0 for everyone), each user still gets an explicit
    Share of 0.0 rather than being dropped.
    """
    if not weights:
        return []

    total = sum(weights.values())
    ordered_ids = sorted(weights)

    if total <= 0:
        return [Share(user_id, 0.0, weights[user_id]) for user_id in ordered_ids]

    shares = []
    running = 0.0
    for user_id in ordered_ids[:-1]:
        share = round(amount * weights[user_id] / total, 2)
        shares.append(Share(user_id, share, weights[user_id]))
        running += share
    last_id = ordered_ids[-1]
    shares.append(Share(last_id, round(amount - running, 2), weights[last_id]))
    return shares


def resolve_default_weights(
    db: Session, category_id: int | None, account_id: int | None,
) -> tuple[str | None, dict[int, int]]:
    """Resolve default weights to prefill a transaction's split with.

    Priority, ascending: global < account < category (category wins if
    configured). This never inspects AccountUser/ownership — a tier applies
    whenever it's configured, regardless of how many owners an account has.
    Used only to suggest defaults (CSV import, or client-side prefill for
    the interactive form) — never to live-resolve an existing transaction's
    split, which is always driven by its own stored weights.
    """
    if category_id is not None:
        cat_splits = db.query(CategorySplit).filter(CategorySplit.category_id == category_id).all()
        if cat_splits:
            return "category", {c.user_id: c.weight for c in cat_splits}

    if account_id is not None:
        acct_weights = db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account_id).all()
        if acct_weights:
            return "account", {w.user_id: w.weight for w in acct_weights}

    global_weights = db.query(GlobalSplitWeight).filter(GlobalSplitWeight.weight > 0).all()
    if global_weights:
        return "global", {g.user_id: g.weight for g in global_weights}

    return None, {}


def apply_split(
    db: Session, transaction: Transaction, weights: dict[int, int] | None, source: str = "custom",
) -> None:
    """(Re)computes and persists TransactionSplit rows for a transaction.

    Always deletes any existing rows first. If `weights` is falsy, the
    transaction ends up with no split rows (opt-in, same as today). Every
    call recomputes share_amount from the transaction's *current* amount —
    there is no freeze/protection against recomputation.
    """
    db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction.id).delete()
    if not weights:
        return

    shares = prorate(transaction.amount, weights)
    for share in shares:
        db.add(TransactionSplit(
            transaction_id=transaction.id,
            user_id=share.user_id,
            weight=share.weight,
            share_amount=share.share_amount,
            source=source,
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

    Driven entirely by TransactionSplit.share_amount and
    AccountUser.ownership_percentage — unaffected by the split-weight
    refactor (weight/source never factor into balance math).
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
