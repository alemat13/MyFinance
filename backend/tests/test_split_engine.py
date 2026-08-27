import pytest

from models import AccountUser, CategorySplit, GlobalSplitWeight
from split_engine import resolve_split


def test_resolve_split_no_config_not_required_returns_empty(db, sample_category):
    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False)
    assert shares == []


def test_resolve_split_no_config_required_raises_422(db, sample_category):
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        resolve_split(db, 100.0, sample_category.id, override=None, required=True)
    assert exc_info.value.status_code == 422


def test_resolve_split_global_default_weighting(db, sample_category, sample_user):
    other_user_id = sample_user.id + 1000  # doesn't need to exist for this unit-level test
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=60.0),
        GlobalSplitWeight(user_id=other_user_id, weight=40.0),
    ])
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False)
    by_user = {s.user_id: s for s in shares}
    assert by_user[sample_user.id].share_amount == 60.0
    assert by_user[other_user_id].share_amount == 40.0
    assert all(s.source == "global_default" for s in shares)
    # Shares sum exactly to the amount.
    assert round(sum(s.share_amount for s in shares), 2) == 100.0


def test_resolve_split_rounding_remainder_absorbed_by_last_user(db, sample_category):
    db.add_all([
        GlobalSplitWeight(user_id=1, weight=1.0),
        GlobalSplitWeight(user_id=2, weight=1.0),
        GlobalSplitWeight(user_id=3, weight=1.0),
    ])
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False)
    assert round(sum(s.share_amount for s in shares), 2) == 100.0
    # 100/3 = 33.33 repeating; two users get 33.33, the last absorbs the remainder (33.34).
    amounts = sorted(s.share_amount for s in shares)
    assert amounts[0] == 33.33
    assert amounts[1] == 33.33
    assert amounts[2] == 33.34


def test_resolve_split_category_default_takes_precedence_over_global(db, sample_category, sample_user):
    other_user_id = sample_user.id + 1000
    db.add_all([
        GlobalSplitWeight(user_id=sample_user.id, weight=90.0),
        GlobalSplitWeight(user_id=other_user_id, weight=10.0),
        CategorySplit(category_id=sample_category.id, user_id=sample_user.id, split_percentage=50.0),
        CategorySplit(category_id=sample_category.id, user_id=other_user_id, split_percentage=50.0),
    ])
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False)
    by_user = {s.user_id: s for s in shares}
    assert by_user[sample_user.id].share_amount == 50.0
    assert by_user[other_user_id].share_amount == 50.0
    assert all(s.source == "category_default" for s in shares)


def test_resolve_split_manual_override_takes_precedence(db, sample_category, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=100.0))
    db.commit()

    override = [(sample_user.id, 30.0), (sample_user.id + 1000, 70.0)]
    shares = resolve_split(db, 100.0, sample_category.id, override=override, required=False)
    assert all(s.source == "manual" for s in shares)
    assert {s.user_id: s.share_amount for s in shares} == {sample_user.id: 30.0, sample_user.id + 1000: 70.0}


def test_resolve_split_manual_override_sum_mismatch_raises_422(db, sample_category):
    from fastapi import HTTPException
    override = [(1, 30.0), (2, 60.0)]  # doesn't sum to 100
    with pytest.raises(HTTPException) as exc_info:
        resolve_split(db, 100.0, sample_category.id, override=override, required=False)
    assert exc_info.value.status_code == 422


def test_resolve_split_single_owner_account_skips_default(db, sample_account, sample_category, sample_user):
    db.add_all([
        AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0),
        GlobalSplitWeight(user_id=sample_user.id, weight=100.0),
    ])
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False, account_id=sample_account.id)
    assert shares == []


def test_resolve_split_no_owners_account_skips_default(db, sample_account, sample_category, sample_user):
    db.add(GlobalSplitWeight(user_id=sample_user.id, weight=100.0))
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False, account_id=sample_account.id)
    assert shares == []


def test_resolve_split_single_owner_account_required_raises_422(db, sample_account, sample_category, sample_user):
    from fastapi import HTTPException
    db.add_all([
        AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0),
        GlobalSplitWeight(user_id=sample_user.id, weight=100.0),
    ])
    db.commit()

    with pytest.raises(HTTPException) as exc_info:
        resolve_split(db, 100.0, sample_category.id, override=None, required=True, account_id=sample_account.id)
    assert exc_info.value.status_code == 422


def test_resolve_split_joint_account_applies_default(db, sample_account, sample_category, sample_user):
    other_user_id = sample_user.id + 1000
    db.add_all([
        AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=60.0),
        AccountUser(account_id=sample_account.id, user_id=other_user_id, ownership_percentage=40.0),
        GlobalSplitWeight(user_id=sample_user.id, weight=60.0),
        GlobalSplitWeight(user_id=other_user_id, weight=40.0),
    ])
    db.commit()

    shares = resolve_split(db, 100.0, sample_category.id, override=None, required=False, account_id=sample_account.id)
    by_user = {s.user_id: s for s in shares}
    assert by_user[sample_user.id].share_amount == 60.0
    assert by_user[other_user_id].share_amount == 40.0


def test_resolve_split_single_owner_account_manual_override_still_applies(db, sample_account, sample_category, sample_user):
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    db.commit()

    override = [(sample_user.id, 100.0)]
    shares = resolve_split(db, 100.0, sample_category.id, override=override, required=False, account_id=sample_account.id)
    assert shares == [s for s in shares if s.source == "manual"]
    assert {s.user_id: s.share_amount for s in shares} == {sample_user.id: 100.0}
