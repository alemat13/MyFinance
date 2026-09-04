import pytest

from models import Category
from rules import (
    RuleViolation,
    validate_category_hierarchy,
    validate_category_update,
    validate_ownership,
    validate_users_exist,
    validate_weights,
)
from schemas import AccountUserCreate, SplitWeightCreate


# ── RuleViolation ─────────────────────────────────────────────────

def test_rule_violation_exposes_detail():
    exc = RuleViolation("something went wrong")
    assert exc.detail == "something went wrong"
    assert str(exc) == "something went wrong"


# ── validate_ownership ──────────────────────────────────────────────

def test_validate_ownership_empty_list_is_noop():
    validate_ownership([])


def test_validate_ownership_sums_to_exactly_100_passes():
    validate_ownership([
        AccountUserCreate(user_id=1, ownership_percentage=60.0),
        AccountUserCreate(user_id=2, ownership_percentage=40.0),
    ])


def test_validate_ownership_within_tolerance_passes():
    validate_ownership([AccountUserCreate(user_id=1, ownership_percentage=100.005)])


def test_validate_ownership_below_100_raises():
    with pytest.raises(RuleViolation) as exc_info:
        validate_ownership([AccountUserCreate(user_id=1, ownership_percentage=99.98)])
    assert "Ownership percentages must sum to 100, got 99.98" in exc_info.value.detail


def test_validate_ownership_above_100_raises():
    with pytest.raises(RuleViolation):
        validate_ownership([AccountUserCreate(user_id=1, ownership_percentage=105.0)])


# ── validate_users_exist ────────────────────────────────────────────

def test_validate_users_exist_empty_list_is_noop(db):
    validate_users_exist(db, [])


def test_validate_users_exist_all_present_passes(db, sample_user, sample_user2):
    validate_users_exist(db, [
        AccountUserCreate(user_id=sample_user.id, ownership_percentage=50.0),
        AccountUserCreate(user_id=sample_user2.id, ownership_percentage=50.0),
    ])


def test_validate_users_exist_missing_raises(db, sample_user):
    with pytest.raises(RuleViolation) as exc_info:
        validate_users_exist(db, [
            AccountUserCreate(user_id=sample_user.id, ownership_percentage=50.0),
            AccountUserCreate(user_id=999999, ownership_percentage=50.0),
        ])
    assert "999999" in exc_info.value.detail


# ── validate_weights ─────────────────────────────────────────────────

def test_validate_weights_empty_list_is_noop():
    validate_weights([])


def test_validate_weights_negative_raises():
    with pytest.raises(RuleViolation, match="Weights must be >= 0"):
        validate_weights([SplitWeightCreate(user_id=1, weight=-1)])


def test_validate_weights_all_zero_raises():
    with pytest.raises(RuleViolation, match="At least one weight must be greater than 0"):
        validate_weights([SplitWeightCreate(user_id=1, weight=0), SplitWeightCreate(user_id=2, weight=0)])


def test_validate_weights_duplicate_user_id_raises():
    with pytest.raises(RuleViolation, match="Duplicate user_id in weights"):
        validate_weights([SplitWeightCreate(user_id=1, weight=1), SplitWeightCreate(user_id=1, weight=2)])


def test_validate_weights_valid_mixed_passes():
    validate_weights([SplitWeightCreate(user_id=1, weight=0), SplitWeightCreate(user_id=2, weight=3)])


# ── validate_category_hierarchy ──────────────────────────────────────

def test_validate_category_hierarchy_no_parent_is_noop(db):
    validate_category_hierarchy(db, None, None, "Expense")


def test_validate_category_hierarchy_create_with_valid_parent_passes(db):
    parent = Category(name="Housing", type="Expense")
    db.add(parent)
    db.commit()
    db.refresh(parent)
    validate_category_hierarchy(db, None, parent.id, "Expense")


def test_validate_category_hierarchy_self_parent_raises(db):
    category = Category(name="Rent", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    with pytest.raises(RuleViolation, match="cannot be its own parent"):
        validate_category_hierarchy(db, category, category.id, "Expense")


def test_validate_category_hierarchy_reparenting_category_with_children_raises(db):
    parent = Category(name="Housing", type="Expense")
    db.add(parent)
    db.commit()
    db.refresh(parent)
    child = Category(name="Rent", type="Expense", parent_id=parent.id)
    other_parent = Category(name="Utilities", type="Expense")
    db.add_all([child, other_parent])
    db.commit()
    db.refresh(child)
    db.refresh(other_parent)
    # `parent` (has a subcategory `child`) is itself being given a parent.
    with pytest.raises(RuleViolation, match="has its own subcategories"):
        validate_category_hierarchy(db, parent, other_parent.id, "Expense")


def test_validate_category_hierarchy_nonexistent_parent_raises(db):
    with pytest.raises(RuleViolation, match="not found"):
        validate_category_hierarchy(db, None, 999999, "Expense")


def test_validate_category_hierarchy_third_level_raises(db):
    grandparent = Category(name="Housing", type="Expense")
    db.add(grandparent)
    db.commit()
    db.refresh(grandparent)
    parent = Category(name="Rent", type="Expense", parent_id=grandparent.id)
    db.add(parent)
    db.commit()
    db.refresh(parent)
    with pytest.raises(RuleViolation, match="Only 2 levels"):
        validate_category_hierarchy(db, None, parent.id, "Expense")


def test_validate_category_hierarchy_type_mismatch_raises(db):
    parent = Category(name="Salary", type="Income")
    db.add(parent)
    db.commit()
    db.refresh(parent)
    with pytest.raises(RuleViolation, match="type must match"):
        validate_category_hierarchy(db, None, parent.id, "Expense")


# ── validate_category_update ─────────────────────────────────────────

def test_validate_category_update_type_change_with_children_raises_even_with_parent_id(db):
    category = Category(name="Housing", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    child = Category(name="Rent", type="Expense", parent_id=category.id)
    other_parent = Category(name="Other", type="Income")
    db.add_all([child, other_parent])
    db.commit()
    db.refresh(other_parent)
    # "type" changed AND "parent_id" set AND category has children: the
    # unconditional children-check must fire first (before any parent_id
    # branch is even reached), matching the original inline code's order.
    with pytest.raises(RuleViolation, match="Cannot change type of a category with existing subcategories"):
        validate_category_update(db, category, {"type": "Income", "parent_id": other_parent.id})


def test_validate_category_update_type_change_no_children_no_parent_passes(db):
    category = Category(name="Rent", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    validate_category_update(db, category, {"type": "Income"})


def test_validate_category_update_type_change_subcategory_parent_mismatch_raises(db):
    parent = Category(name="Housing", type="Expense")
    db.add(parent)
    db.commit()
    db.refresh(parent)
    child = Category(name="Rent", type="Expense", parent_id=parent.id)
    db.add(child)
    db.commit()
    db.refresh(child)
    with pytest.raises(RuleViolation, match="Subcategory type must match its parent category's type"):
        validate_category_update(db, child, {"type": "Income"})


def test_validate_category_update_parent_id_present_delegates_to_hierarchy_check(db):
    category = Category(name="Rent", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    # This can only fail via validate_category_hierarchy's "not found" check —
    # confirms the parent_id branch actually delegates to it.
    with pytest.raises(RuleViolation, match="not found"):
        validate_category_update(db, category, {"parent_id": 999999})


def test_validate_category_update_parent_id_and_type_uses_new_type_for_hierarchy_check(db):
    income_parent = Category(name="Salary", type="Income")
    db.add(income_parent)
    db.commit()
    db.refresh(income_parent)
    category = Category(name="Rent", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    # effective_type must be the *new* type ("Income"), matching income_parent
    # — so this must pass. If effective_type wrongly used the old type
    # ("Expense"), this would raise a type-mismatch RuleViolation instead.
    validate_category_update(db, category, {"type": "Income", "parent_id": income_parent.id})
