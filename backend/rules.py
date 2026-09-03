"""Domain rules, expressed without reference to HTTP.

These are the invariants the app enforces beyond what Pydantic can express on a
single payload — they need the database, or they span several fields. They raise
`RuleViolation`; `main.py` registers the one handler that turns that into a 422,
so the rules stay callable (and unit-testable) without a request in flight.

Deliberately NOT `ValueError`: `backup.BackupFormatError` subclasses `ValueError`,
and `filtering.py` / `import_csv.py` raise plain `ValueError`s that the routes
convert themselves. A handler registered on `ValueError` would swallow all of
those and silently turn every unrelated `ValueError` into a 422 instead of a 500.
"""

from sqlalchemy.orm import Session

from models import Category, User


class RuleViolation(Exception):
    """A domain rule was violated. Translated to HTTP 422 in `main.py`."""


# ── Account ownership ──────────────────────────────────────────────

def validate_ownership(users: list) -> None:
    """Ownership percentages on an account must sum to exactly 100."""
    if users:
        total = sum(u.ownership_percentage for u in users)
        if abs(total - 100.0) > 0.01:
            raise RuleViolation(f"Ownership percentages must sum to 100, got {total}")


def validate_users_exist(db: Session, users: list) -> None:
    if not users:
        return
    requested_ids = {u.user_id for u in users}
    existing_ids = {uid for (uid,) in db.query(User.id).filter(User.id.in_(requested_ids)).all()}
    missing = sorted(requested_ids - existing_ids)
    if missing:
        raise RuleViolation(f"Unknown user_id(s): {missing}")


# ── Split weights ──────────────────────────────────────────────────

def validate_weights(items: list) -> None:
    """A weight set must be non-negative, not all-zero, and one row per user."""
    if any(item.weight < 0 for item in items):
        raise RuleViolation("Weights must be >= 0")
    if items and sum(item.weight for item in items) <= 0:
        raise RuleViolation("At least one weight must be greater than 0")
    user_ids = [item.user_id for item in items]
    if len(user_ids) != len(set(user_ids)):
        raise RuleViolation("Duplicate user_id in weights")


# ── Category hierarchy (capped at exactly 2 levels) ────────────────

def validate_category_hierarchy(db: Session, category: Category | None,
                                parent_id: int | None, type_: str) -> None:
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
    """The hierarchy rules that apply to an edit of an existing category.

    `update_data` is the `model_dump(exclude_unset=True)` of the request, minus
    `splits` — membership matters, so a field the client never sent is not
    validated even when its stored value would fail.
    """
    if "type" in update_data and update_data["type"] != category.type and category.children:
        raise RuleViolation("Cannot change type of a category with existing subcategories")

    if "parent_id" in update_data:
        effective_type = update_data.get("type", category.type)
        validate_category_hierarchy(db, category, update_data["parent_id"], effective_type)
    elif "type" in update_data and category.parent_id is not None:
        if category.parent and category.parent.type != update_data["type"]:
            raise RuleViolation("Subcategory type must match its parent category's type")
