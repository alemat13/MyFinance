"""Automatic rules: conditions to match a transaction, actions to apply to it.

Business logic only; the endpoints live in routers/transaction_rules.py. (Not
to be confused with `rules.py`, which holds input validation.)

A rule is the Transactions screen's advanced filter plus a bulk edit, run on
its own, the way a mail client's rules are. **Conditions** are
`FilterCondition`s — the very objects the advanced filter sends — combined by
the rule's `match_mode`. **Actions** (`RuleActions`) are the bulk edit's
fields plus a payee rename; moving to another account and deleting are left
out on purpose, since nothing should do either unseen.

**Applied in three places**, like the categorisation model: bank sync,
silently and systematically on the rows it just created (after the model, so
a rule wins over it); the CSV/QIF import preview, which shows what the rules
would change and applies it unless switched off; and a selection on the
Transactions screen, with a before/after per row.

How several rules combine: every enabled rule runs, in `position` order, and
each one's conditions are read against the row *as the earlier rules left
it*, so a later rule wins on a field both set and one rule can build on
another's rename. A row a rule changed is left `reconciled = False` — the
review queue, same as the model's — unless a rule itself sets `reconciled`.

Conditions have to be evaluated in Python rather than in SQL, since the
import preview runs them on rows that exist only in a CSV. `_matches` mirrors
`filtering.build_condition_expr` operator for operator, including SQL's
treatment of NULL: a condition on an empty field never matches, not even
"not equals".
"""

import logging
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy.orm import Session

import cache_service
import split_engine
from audit import TRACKED_FIELDS, _jsonify, diff_splits, record_transaction_history
from models import Category, Transaction, TransactionRule, TransactionSplit, User
from schemas import DATE_FIELDS, TEXT_FIELDS, FilterCondition, RuleActions, RuleOutcomeOut

logger = logging.getLogger(__name__)

# What the history rows written here record as their source.
HISTORY_SOURCE = "rule"

# The row attributes a condition can read or an action can write.
_STATE_FIELDS = (
    "payee", "memo", "raw_label", "amount", "date", "account_id", "category_id",
    "accounting_month_offset", "reconciled",
)


@dataclass
class Outcome:
    """What the rules would do to one row: the fields that end up different,
    the split a rule set (if any), and which rules matched."""
    fields: dict = field(default_factory=dict)
    split_weights: dict[int, int] | None = None
    split_source: str | None = None
    rule_ids: list[int] = field(default_factory=list)
    rule_names: list[str] = field(default_factory=list)

    @property
    def changes_anything(self) -> bool:
        return bool(self.fields) or self.split_weights is not None


def load_rules(db: Session, rule_ids: list[int] | None = None) -> list[TransactionRule]:
    """The rules to run, in their order: every enabled one, or exactly the
    given ones (enabled or not) when a person picked them by hand."""
    query = db.query(TransactionRule)
    if rule_ids is None:
        query = query.filter(TransactionRule.enabled.is_(True))
    else:
        query = query.filter(TransactionRule.id.in_(rule_ids))
    return query.order_by(TransactionRule.position, TransactionRule.id).all()


def _coerce_date(value) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value))


def _matches(condition: FilterCondition, state: dict) -> bool:
    current = state.get(condition.field)
    if current is None:
        return False
    op = condition.operator
    if condition.field in TEXT_FIELDS:
        text, value = str(current).lower(), str(condition.value).lower()
        return {
            "contains": value in text,
            "equals": text == value,
            "not_equals": text != value,
            "starts_with": text.startswith(value),
            "ends_with": text.endswith(value),
        }[op]
    if condition.field in DATE_FIELDS:
        current = _coerce_date(current)
        value = _coerce_date(condition.value)
        if op == "between":
            low, high = sorted((value, _coerce_date(condition.value2)))
            return low <= current <= high
        return {"on": current == value, "before": current < value, "after": current > value}[op]
    current, value = float(current), float(condition.value)
    if op == "between":
        low, high = sorted((value, float(condition.value2)))
        return low <= current <= high
    return {
        "eq": current == value, "ne": current != value,
        "gt": current > value, "gte": current >= value,
        "lt": current < value, "lte": current <= value,
    }[op]


def rule_matches(rule: TransactionRule, state: dict) -> bool:
    conditions = [FilterCondition.model_validate(c) for c in rule.conditions or []]
    if not conditions:
        # Refused on save; an archive could still carry one. A rule with no
        # condition would rewrite every transaction, so it matches nothing.
        return False
    results = (_matches(c, state) for c in conditions)
    return all(results) if rule.match_mode == "all" else any(results)


def evaluate(rules: list[TransactionRule], row, *, known_categories: set[int],
             known_users: set[int]) -> Outcome:
    """Run the rules over one row (a Transaction or anything carrying the same
    attributes) without touching it.

    An action naming a category or user that has since been deleted is
    skipped rather than written, so a stale rule cannot break a sync.
    """
    original = {f: getattr(row, f, None) for f in _STATE_FIELDS}
    state = dict(original)
    outcome = Outcome()
    for rule in rules:
        if not rule_matches(rule, state):
            continue
        actions = RuleActions.model_validate(rule.actions or {})
        if actions.payee is not None:
            state["payee"] = actions.payee
        if actions.category_id is not None and actions.category_id in known_categories:
            state["category_id"] = actions.category_id
        if actions.accounting_month_offset is not None:
            state["accounting_month_offset"] = actions.accounting_month_offset
        if actions.reconciled is not None:
            state["reconciled"] = actions.reconciled
        if actions.split_weights:
            weights = {w.user_id: w.weight for w in actions.split_weights if w.user_id in known_users}
            if weights and sum(weights.values()) > 0:
                outcome.split_weights = weights
                outcome.split_source = actions.split_source or "custom"
        outcome.rule_ids.append(rule.id)
        outcome.rule_names.append(rule.name)

    outcome.fields = {
        f: state[f] for f in ("payee", "category_id", "accounting_month_offset", "reconciled")
        if state[f] != original[f]
    }
    return outcome


def evaluate_many(db: Session, rules: list[TransactionRule], rows: list) -> list[Outcome]:
    known_categories = {row[0] for row in db.query(Category.id).all()}
    known_users = {row[0] for row in db.query(User.id).all()}
    return [evaluate(rules, row, known_categories=known_categories, known_users=known_users) for row in rows]


def outcome_out(outcome: Outcome, category_names: dict[int, str]) -> RuleOutcomeOut | None:
    """An outcome as the API reports it, or None when it changes nothing."""
    if not outcome.changes_anything:
        return None
    category_id = outcome.fields.get("category_id")
    return RuleOutcomeOut(
        rule_ids=outcome.rule_ids,
        rule_names=outcome.rule_names,
        payee=outcome.fields.get("payee"),
        category_id=category_id,
        category_name=category_names.get(category_id) if category_id is not None else None,
        accounting_month_offset=outcome.fields.get("accounting_month_offset"),
        reconciled=outcome.fields.get("reconciled"),
        split_weights=(
            [{"user_id": uid, "weight": w} for uid, w in sorted(outcome.split_weights.items())]
            if outcome.split_weights is not None else None
        ),
        split_source=outcome.split_source,
    )


def write(db: Session, transaction: Transaction, outcome: Outcome, actor_user_id: int | None,
          *, fresh: bool = False) -> bool:
    """Apply one outcome to a transaction, unreconcile it unless a rule set
    `reconciled`, and record a history row. Returns whether anything changed.

    `fresh` marks a row the caller has just created with a split resolved
    before any category was known (the bank sync): when a rule files it under
    a category without setting a split itself, the split is resolved again
    through the usual cascade, which is what a row created with that category
    would have had.
    """
    if not outcome.changes_anything:
        return False
    fields = dict(outcome.fields)
    if "reconciled" not in fields:
        fields["reconciled"] = False

    before = {f: getattr(transaction, f) for f in fields if f in TRACKED_FIELDS}
    for name, value in fields.items():
        setattr(transaction, name, value)
    changes = {
        f: {"old": _jsonify(old), "new": _jsonify(getattr(transaction, f))}
        for f, old in before.items() if old != getattr(transaction, f)
    }

    weights, source = outcome.split_weights, outcome.split_source
    if weights is None and fresh and "category_id" in outcome.fields:
        resolved_source, resolved = split_engine.resolve_default_weights(
            db, transaction.category_id, transaction.account_id)
        if resolved:
            weights, source = resolved, resolved_source or "custom"
    if weights is not None:
        # Read from the table rather than the relationship, which a caller
        # that has just written the row's first split may hold stale — and
        # flushed first, since that split may not even be in the table yet.
        db.flush()
        existing = {
            s.user_id: (s.weight, s.source) for s in
            db.query(TransactionSplit).filter(TransactionSplit.transaction_id == transaction.id).all()
        }
        splits_diff = diff_splits(existing, {uid: (w, source) for uid, w in weights.items()})
        if splits_diff:
            changes["splits"] = splits_diff
            split_engine.apply_split(db, transaction, weights, source)

    if not changes:
        return False
    record_transaction_history(db, transaction, "updated", actor_user_id,
                               source=HISTORY_SOURCE, changes=changes)
    return True


def apply_to(db: Session, transactions: list[Transaction], rules: list[TransactionRule], *,
             actor_user_id: int | None = None, fresh: bool = False) -> list[int]:
    """Run the rules over the given transactions and write what they change.
    Returns the ids changed. Does not commit; invalidates the aggregate cache
    when something changed, so it lands with the caller's commit."""
    if not rules or not transactions:
        return []
    changed = []
    for transaction, outcome in zip(transactions, evaluate_many(db, rules, transactions)):
        if write(db, transaction, outcome, actor_user_id, fresh=fresh):
            changed.append(transaction.id)
    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
    return changed


def apply_quietly(db: Session, transactions: list[Transaction], *, fresh: bool = False) -> int:
    """`apply_to` with every enabled rule, for a feed that must not fail
    because of a rule (the bank sync): the rows are already imported, and an
    unfiled row beats a sync reported as failed.

    Everything that can realistically fail (reading the rules, evaluating
    them) happens before anything is written, so a failure leaves nothing
    half-applied.
    """
    try:
        rules = load_rules(db)
        if not rules or not transactions:
            return 0
        outcomes = evaluate_many(db, rules, transactions)
    except Exception:  # noqa: BLE001 - logged, and the import itself still stands
        logger.exception("Automatic rules failed; rows were imported without them")
        return 0
    changed = 0
    for transaction, outcome in zip(transactions, outcomes):
        if write(db, transaction, outcome, None, fresh=fresh):
            changed += 1
    if changed:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
    return changed
