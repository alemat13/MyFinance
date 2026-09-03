"""Unit tests for the domain rules.

These call `rules.*` directly — no TestClient, no request — which is the point of
keeping them free of HTTPException. The API-level tests elsewhere in this suite
cover the RuleViolation -> 422 translation.
"""

from dataclasses import dataclass

import pytest

import rules
from models import Category


@dataclass
class Weight:
    """Stands in for the several schema types that carry a user_id + weight."""
    user_id: int
    weight: int


@dataclass
class Ownership:
    user_id: int
    ownership_percentage: float


# ── validate_ownership ─────────────────────────────────────────────

def test_ownership_summing_to_100_passes():
    rules.validate_ownership([Ownership(1, 60.0), Ownership(2, 40.0)])


def test_empty_ownership_passes():
    rules.validate_ownership([])


def test_ownership_not_summing_to_100_raises():
    with pytest.raises(rules.RuleViolation, match="must sum to 100"):
        rules.validate_ownership([Ownership(1, 60.0), Ownership(2, 30.0)])


def test_ownership_within_tolerance_passes():
    """The backend allows 0.01 of slack for float round-tripping."""
    rules.validate_ownership([Ownership(1, 33.33), Ownership(2, 33.33), Ownership(3, 33.34)])


# ── validate_users_exist ───────────────────────────────────────────

def test_users_exist_passes(db, sample_user):
    rules.validate_users_exist(db, [Ownership(sample_user.id, 100.0)])


def test_unknown_user_raises(db, sample_user):
    with pytest.raises(rules.RuleViolation, match="Unknown user_id"):
        rules.validate_users_exist(db, [Ownership(sample_user.id, 50.0), Ownership(9999, 50.0)])


# ── validate_weights ───────────────────────────────────────────────

def test_valid_weights_pass():
    rules.validate_weights([Weight(1, 1), Weight(2, 3)])


def test_empty_weights_pass():
    """An empty set means 'no split', not an invalid one."""
    rules.validate_weights([])


def test_negative_weight_raises():
    with pytest.raises(rules.RuleViolation, match="must be >= 0"):
        rules.validate_weights([Weight(1, -1), Weight(2, 2)])


def test_all_zero_weights_raise():
    with pytest.raises(rules.RuleViolation, match="greater than 0"):
        rules.validate_weights([Weight(1, 0), Weight(2, 0)])


def test_duplicate_user_raises():
    with pytest.raises(rules.RuleViolation, match="Duplicate user_id"):
        rules.validate_weights([Weight(1, 1), Weight(1, 2)])


# ── validate_category_hierarchy ────────────────────────────────────

@pytest.fixture()
def top_level(db):
    c = Category(name="Housing", type="Expense")
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_no_parent_always_passes(db):
    rules.validate_category_hierarchy(db, None, None, "Expense")


def test_valid_subcategory_passes(db, top_level):
    rules.validate_category_hierarchy(db, None, top_level.id, "Expense")


def test_missing_parent_raises(db):
    with pytest.raises(rules.RuleViolation, match="not found"):
        rules.validate_category_hierarchy(db, None, 9999, "Expense")


def test_type_mismatch_with_parent_raises(db, top_level):
    with pytest.raises(rules.RuleViolation, match="must match its parent"):
        rules.validate_category_hierarchy(db, None, top_level.id, "Income")


def test_three_levels_raise(db, top_level):
    child = Category(name="Rent", type="Expense", parent_id=top_level.id)
    db.add(child)
    db.commit()
    db.refresh(child)
    with pytest.raises(rules.RuleViolation, match="Only 2 levels"):
        rules.validate_category_hierarchy(db, None, child.id, "Expense")


def test_category_cannot_be_its_own_parent(db, top_level):
    with pytest.raises(rules.RuleViolation, match="its own parent"):
        rules.validate_category_hierarchy(db, top_level, top_level.id, "Expense")


def test_parent_with_children_cannot_be_demoted(db, top_level):
    other = Category(name="Utilities", type="Expense")
    db.add(other)
    db.add(Category(name="Rent", type="Expense", parent_id=top_level.id))
    db.commit()
    db.refresh(top_level)
    db.refresh(other)
    with pytest.raises(rules.RuleViolation, match="has its own subcategories"):
        rules.validate_category_hierarchy(db, top_level, other.id, "Expense")


# ── validate_category_update ───────────────────────────────────────

def test_update_without_hierarchy_fields_passes(db, top_level):
    rules.validate_category_update(db, top_level, {"name": "Renamed"})


def test_type_change_with_children_raises(db, top_level):
    db.add(Category(name="Rent", type="Expense", parent_id=top_level.id))
    db.commit()
    db.refresh(top_level)
    with pytest.raises(rules.RuleViolation, match="Cannot change type"):
        rules.validate_category_update(db, top_level, {"type": "Income"})


def test_type_change_on_childless_category_passes(db, top_level):
    rules.validate_category_update(db, top_level, {"type": "Income"})


def test_subcategory_type_must_still_match_parent(db, top_level):
    child = Category(name="Rent", type="Expense", parent_id=top_level.id)
    db.add(child)
    db.commit()
    db.refresh(child)
    with pytest.raises(rules.RuleViolation, match="must match its parent"):
        rules.validate_category_update(db, child, {"type": "Income"})


def test_unset_fields_are_not_validated(db, top_level):
    """`update_data` is an exclude_unset dump: a field the client never sent is
    not checked, even when the stored value would fail the same rule."""
    child = Category(name="Rent", type="Expense", parent_id=top_level.id)
    db.add(child)
    db.commit()
    db.refresh(child)
    rules.validate_category_update(db, child, {"name": "Rent & Fees"})
