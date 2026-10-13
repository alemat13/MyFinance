"""Endpoints for the automatic rules (logic in transaction_rules.py)."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

import transaction_rules
from database import get_db
from filtering import build_condition_expr
from models import Category, Transaction, TransactionRule, User
from rules import RuleViolation, validate_weights
from schemas import (
    RuleApplyRequest,
    RuleApplyResponse,
    RuleCreate,
    RuleOrderRequest,
    RuleOut,
    RulePreviewItem,
    RulePreviewRequest,
    RulePreviewResponse,
    RuleUpdate,
)

router = APIRouter(prefix="/api/rules")

# Rows a single preview/apply may cover: a selection on the Transactions
# screen, not the whole ledger.
MAX_RULE_SELECTION = 2000


def _validate(db: Session, data: RuleCreate | RuleUpdate) -> None:
    if not data.conditions:
        # A rule with no condition would rewrite every transaction it meets.
        raise RuleViolation("A rule needs at least one condition.")
    for condition in data.conditions:
        if condition.value is None or (isinstance(condition.value, str) and not condition.value.strip()):
            raise RuleViolation(f'The condition on "{condition.field}" has no value.')
        if condition.operator == "between" and condition.value2 is None:
            raise RuleViolation(f'The "between" condition on "{condition.field}" needs two values.')
        try:
            build_condition_expr(condition)
        except (TypeError, ValueError) as e:
            raise RuleViolation(f'The condition on "{condition.field}" is not usable: {e}')

    actions = data.actions
    if actions.is_empty():
        raise RuleViolation("A rule needs at least one action.")
    if actions.payee is not None and not actions.payee.strip():
        raise RuleViolation("The new payee cannot be blank.")
    if actions.category_id is not None:
        if db.query(Category.id).filter(Category.id == actions.category_id).first() is None:
            raise HTTPException(404, f"Category {actions.category_id} not found")
    if actions.split_weights is not None:
        if not actions.split_weights:
            raise RuleViolation("A split needs at least one person; leave the split action off instead.")
        validate_weights(actions.split_weights)
        user_ids = {w.user_id for w in actions.split_weights}
        known = {row[0] for row in db.query(User.id).filter(User.id.in_(user_ids)).all()}
        if user_ids - known:
            raise HTTPException(404, f"User(s) not found: {sorted(user_ids - known)}")


def _store(rule: TransactionRule, data: RuleCreate | RuleUpdate) -> None:
    rule.name = data.name.strip()
    rule.enabled = data.enabled
    rule.match_mode = data.match_mode
    rule.conditions = [c.model_dump(mode="json") for c in data.conditions]
    rule.actions = data.actions.model_dump(mode="json", exclude_none=True)


@router.get("", response_model=list[RuleOut])
def list_rules(db: Session = Depends(get_db)):
    return db.query(TransactionRule).order_by(TransactionRule.position, TransactionRule.id).all()


@router.post("", response_model=RuleOut, status_code=201)
def create_rule(data: RuleCreate, db: Session = Depends(get_db)):
    _validate(db, data)
    last = db.query(func.max(TransactionRule.position)).scalar()
    rule = TransactionRule(position=(last if last is not None else -1) + 1)
    _store(rule, data)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


# Registered before /{rule_id} so "order" is never read as an id.
@router.put("/order", response_model=list[RuleOut])
def reorder_rules(data: RuleOrderRequest, db: Session = Depends(get_db)):
    rules = {r.id: r for r in db.query(TransactionRule).all()}
    if sorted(data.rule_ids) != sorted(rules):
        raise RuleViolation("The new order must list every rule exactly once.")
    for position, rule_id in enumerate(data.rule_ids):
        rules[rule_id].position = position
    db.commit()
    return list_rules(db)


def _selection(db: Session, req: RulePreviewRequest) -> tuple[list[Transaction], list[TransactionRule]]:
    if not req.transaction_ids:
        raise HTTPException(422, "transaction_ids must not be empty")
    if len(req.transaction_ids) > MAX_RULE_SELECTION:
        raise RuleViolation(f"At most {MAX_RULE_SELECTION} transactions at a time.")
    rows = (
        db.query(Transaction)
        .filter(Transaction.id.in_(req.transaction_ids))
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .all()
    )
    missing = sorted(set(req.transaction_ids) - {t.id for t in rows})
    if missing:
        raise HTTPException(404, f"Transaction(s) not found: {missing}")
    rules = transaction_rules.load_rules(db, req.rule_ids)
    if req.rule_ids is not None:
        unknown = sorted(set(req.rule_ids) - {r.id for r in rules})
        if unknown:
            raise HTTPException(404, f"Rule(s) not found: {unknown}")
    return rows, rules


@router.post("/preview", response_model=RulePreviewResponse)
def preview_rules(req: RulePreviewRequest, db: Session = Depends(get_db)):
    rows, rules = _selection(db, req)
    outcomes = transaction_rules.evaluate_many(db, rules, rows)
    names = {c.id: c.name for c in db.query(Category).all()}
    items = [
        RulePreviewItem(
            transaction_id=t.id,
            date=t.date,
            payee=t.payee,
            amount=t.amount,
            current_category_id=t.category_id,
            current_category_name=names.get(t.category_id) if t.category_id else None,
            current_accounting_month_offset=t.accounting_month_offset or 0,
            current_reconciled=bool(t.reconciled),
            outcome=transaction_rules.outcome_out(o, names),
        )
        for t, o in zip(rows, outcomes)
    ]
    return RulePreviewResponse(items=items, changed_count=sum(1 for i in items if i.outcome))


@router.post("/apply", response_model=RuleApplyResponse)
def apply_rules(req: RuleApplyRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    rows, rules = _selection(db, req)
    changed = transaction_rules.apply_to(db, rows, rules, actor_user_id=actor_user_id)
    db.commit()
    return RuleApplyResponse(updated_count=len(changed), transaction_ids=changed)


@router.put("/{rule_id}", response_model=RuleOut)
def update_rule(rule_id: int, data: RuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(TransactionRule).filter(TransactionRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(404, "Rule not found")
    _validate(db, data)
    _store(rule, data)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(TransactionRule).filter(TransactionRule.id == rule_id).first()
    if rule is None:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
