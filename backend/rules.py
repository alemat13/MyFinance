from sqlalchemy.orm import Session

from models import Category, User
from schemas import AccountUserCreate


class RuleViolation(Exception):
    """Raised for cross-field/DB-dependent domain-rule violations (ownership
    percentages, split weights, category hierarchy). Mapped to a 422 response
    by a dedicated handler in main.py. Deliberately not a ValueError subclass:
    filtering.py/import_csv.py already raise/catch bare ValueError in a couple
    of routes, and a RuleViolation silently caught by one of those would turn
    into the wrong status/message."""

    def __init__(self, detail: str):
        self.detail = detail
        super().__init__(detail)


def validate_ownership(users: list[AccountUserCreate]) -> None:
    if users:
        total = sum(u.ownership_percentage for u in users)
        if abs(total - 100.0) > 0.01:
            raise RuleViolation(f"Ownership percentages must sum to 100, got {total}")


def validate_users_exist(db: Session, users: list[AccountUserCreate]) -> None:
    if not users:
        return
    requested_ids = {u.user_id for u in users}
    existing_ids = {uid for (uid,) in db.query(User.id).filter(User.id.in_(requested_ids)).all()}
    missing = sorted(requested_ids - existing_ids)
    if missing:
        raise RuleViolation(f"Unknown user_id(s): {missing}")


def validate_weights(items: list) -> None:
    if any(item.weight < 0 for item in items):
        raise RuleViolation("Weights must be >= 0")
    if items and sum(item.weight for item in items) <= 0:
        raise RuleViolation("At least one weight must be greater than 0")
    user_ids = [item.user_id for item in items]
    if len(user_ids) != len(set(user_ids)):
        raise RuleViolation("Duplicate user_id in weights")


def validate_category_hierarchy(db: Session, category: Category | None, parent_id: int | None, type_: str) -> None:
    """Enforces the 2-level category hierarchy: a category may have a parent,
    but that parent must itself be top-level, and a subcategory's type must
    match its parent's. `category` is the category being updated (None on
    create)."""
    if parent_id is None:
        return
    if category is not None:
        if parent_id == category.id:
            raise RuleViolation("A category cannot be its own parent")
        if category.children:
            raise RuleViolation("Cannot set a parent on a category that has its own subcategories")
    parent = db.query(Category).filter(Category.id == parent_id).first()
    if not parent:
        raise RuleViolation(f"Parent category {parent_id} not found")
    if parent.parent_id is not None:
        raise RuleViolation("Only 2 levels of categories are allowed")
    if parent.type != type_:
        raise RuleViolation("Subcategory type must match its parent category's type")


def validate_category_update(db: Session, category: Category, update_data: dict) -> None:
    """Wraps the update_category-specific checks that aren't covered by
    validate_category_hierarchy alone: a type change is rejected outright if
    the category has subcategories (regardless of whether parent_id is also
    being changed), and a type-only change on an existing subcategory must
    still match its parent's type. Order matters here and must be preserved:
    the "has children" check runs unconditionally first."""
    if "type" in update_data and update_data["type"] != category.type and category.children:
        raise RuleViolation("Cannot change type of a category with existing subcategories")

    if "parent_id" in update_data:
        effective_type = update_data.get("type", category.type)
        validate_category_hierarchy(db, category, update_data["parent_id"], effective_type)
    elif "type" in update_data and category.parent_id is not None:
        if category.parent and category.parent.type != update_data["type"]:
            raise RuleViolation("Subcategory type must match its parent category's type")
