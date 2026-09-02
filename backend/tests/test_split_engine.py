from models import AccountSplitWeight, AccountUser, CategorySplit, GlobalSplitWeight, TransactionSplit
from split_engine import apply_split, prorate, resolve_default_weights


# ── prorate() ──────────────────────────────────────────────────────

def test_prorate_empty_weights_returns_empty():
    assert prorate(100.0, {}) == []


def test_prorate_all_zero_weights_returns_zero_shares_not_dropped():
    shares = prorate(100.0, {1: 0, 2: 0})
    by_user = {s.user_id: s for s in shares}
    assert set(by_user) == {1, 2}
    assert by_user[1].share_amount == 0.0
    assert by_user[2].share_amount == 0.0
    assert by_user[1].weight == 0
    assert by_user[2].weight == 0


def test_prorate_normal_weighted_split():
    shares = prorate(100.0, {1: 60, 2: 40})
    by_user = {s.user_id: s for s in shares}
    assert by_user[1].share_amount == 60.0
    assert by_user[2].share_amount == 40.0
    assert round(sum(s.share_amount for s in shares), 2) == 100.0


def test_prorate_rounding_remainder_absorbed_by_last_user_id():
    shares = prorate(100.0, {1: 1, 2: 1, 3: 1})
    assert round(sum(s.share_amount for s in shares), 2) == 100.0
    by_user = {s.user_id: s for s in shares}
    # 100/3 = 33.33 repeating; the highest user_id absorbs the remainder.
    assert by_user[1].share_amount == 33.33
    assert by_user[2].share_amount == 33.33
    assert by_user[3].share_amount == 33.34


# ── resolve_default_weights() ─────────────────────────────────────

def test_resolve_default_weights_nothing_configured(db, sample_category):
    source, weights = resolve_default_weights(db, sample_category.id, None)
    assert source is None
    assert weights == {}


def test_resolve_default_weights_global_only(db, sample_category, sample_user):
    other_user_id = sample_user.id + 1000
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=60),
        GlobalSplitWeight(user_id=other_user_id, weight=40),
    ])
    db.commit()

    source, weights = resolve_default_weights(db, sample_category.id, None)
    assert source == "global"
    assert weights == {sample_user.id: 60, other_user_id: 40}


def test_resolve_default_weights_account_takes_precedence_over_global(db, sample_account, sample_category, sample_user):
    other_user_id = sample_user.id + 1000
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=90),
        GlobalSplitWeight(user_id=other_user_id, weight=10),
        AccountSplitWeight(account_id=sample_account.id, user_id=sample_user.id, weight=70),
        AccountSplitWeight(account_id=sample_account.id, user_id=other_user_id, weight=30),
    ])
    db.commit()

    source, weights = resolve_default_weights(db, sample_category.id, sample_account.id)
    assert source == "account"
    assert weights == {sample_user.id: 70, other_user_id: 30}


def test_resolve_default_weights_category_takes_precedence_over_account_and_global(db, sample_account, sample_category, sample_user):
    other_user_id = sample_user.id + 1000
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=90),
        AccountSplitWeight(account_id=sample_account.id, user_id=sample_user.id, weight=70),
        CategorySplit(category_id=sample_category.id, user_id=sample_user.id, weight=50),
        CategorySplit(category_id=sample_category.id, user_id=other_user_id, weight=50),
    ])
    db.commit()

    source, weights = resolve_default_weights(db, sample_category.id, sample_account.id)
    assert source == "category"
    assert weights == {sample_user.id: 50, other_user_id: 50}


def test_resolve_default_weights_single_owner_account_still_applies(db, sample_account, sample_category, sample_user):
    """The old single-owner skip no longer exists: resolve_default_weights
    never even looks at AccountUser/ownership."""
    other_user_id = sample_user.id + 1000
    db.add_all([
        AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0),
        AccountSplitWeight(account_id=sample_account.id, user_id=sample_user.id, weight=50),
        AccountSplitWeight(account_id=sample_account.id, user_id=other_user_id, weight=50),
    ])
    db.commit()

    source, weights = resolve_default_weights(db, sample_category.id, sample_account.id)
    assert source == "account"
    assert weights == {sample_user.id: 50, other_user_id: 50}


# ── apply_split() ──────────────────────────────────────────────────

def test_apply_split_with_weights_persists_rows(db, sample_transaction, sample_user):
    other_user_id = sample_user.id + 1000
    apply_split(db, sample_transaction, {sample_user.id: 3, other_user_id: 1}, source="custom")
    db.commit()

    rows = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == sample_transaction.id).all()
    by_user = {r.user_id: r for r in rows}
    assert by_user[sample_user.id].weight == 3
    assert by_user[sample_user.id].share_amount == 375.0  # 500 * 3/4
    assert by_user[sample_user.id].source == "custom"
    assert by_user[other_user_id].share_amount == 125.0


def test_apply_split_falsy_weights_leaves_no_rows(db, sample_transaction):
    apply_split(db, sample_transaction, None)
    db.commit()
    rows = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == sample_transaction.id).all()
    assert rows == []

    apply_split(db, sample_transaction, {})
    db.commit()
    rows = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == sample_transaction.id).all()
    assert rows == []


def test_apply_split_recomputes_share_amount_when_amount_changes(db, sample_transaction, sample_user):
    """Regression test for the removed manual-freeze protection: changing
    the transaction's amount and calling apply_split again with the SAME
    weights must recompute share_amount with no exception."""
    apply_split(db, sample_transaction, {sample_user.id: 1}, source="custom")
    db.commit()

    sample_transaction.amount = 1000.0
    db.add(sample_transaction)
    apply_split(db, sample_transaction, {sample_user.id: 1}, source="custom")
    db.commit()

    row = db.query(TransactionSplit).filter(TransactionSplit.transaction_id == sample_transaction.id).first()
    assert row.share_amount == 1000.0


def test_apply_split_arbitrary_custom_weights_not_matching_any_tier(db, sample_transaction, sample_user):
    other_user_id = sample_user.id + 1000
    apply_split(db, sample_transaction, {sample_user.id: 7, other_user_id: 3}, source="custom")
    db.commit()

    rows = {r.user_id: r for r in db.query(TransactionSplit).filter(TransactionSplit.transaction_id == sample_transaction.id).all()}
    assert rows[sample_user.id].weight == 7
    assert rows[sample_user.id].source == "custom"
