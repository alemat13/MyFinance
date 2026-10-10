"""Endpoints for the category/payee suggestion feature (logic in categorizer.py).

Training runs inside the request rather than in a background job: measured
end to end against a copy of the production database (30 167 transactions,
26 017 of them trainable) a run takes a little under a minute — 36 s of
fitting on one core plus reading the selection, vectorising and scoring —
inside Cloud Run's 120-second request timeout, and a Cloud Run job would mean
another image, another service account and another deploy path for no gain.
That margin is why `categorizer.train()` pins the number of epochs instead of
letting the solver decide when to stop: the time a fit takes stays
proportional to the row count, so the ledger growing cannot quietly turn a
working screen into a timeout. It is also why the row count is worth watching
— at roughly three times today's history this stops fitting in a request and
wants a job.

What a fit also needs is a lock, because it peaks around 360 MB in a 1 GiB
instance serving up to ten concurrent requests — hence the `training` row.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import auto_categorize
import cache_service
import categorizer
from database import get_db
from filtering import apply_transaction_filters
from models import Category, CategorizerModel, Transaction
from schemas import (
    CategorizerApplyRequest,
    CategorizerApplyResponse,
    CategorizerModelOut,
    CategorizerSuggestion,
    CategorizerSuggestRequest,
    CategorizerSuggestResponse,
    CategorizerTrainRequest,
)

router = APIRouter(prefix="/api/categorizer")

# A fit that has been marked "training" for longer than this is taken to have
# died with its instance (Cloud Run can retire one mid-request), so it stops
# blocking the next attempt.
STALE_TRAINING_AFTER = timedelta(minutes=15)
# How many finished models to keep. Each blob is a few megabytes, and the only
# reason to keep more than one is to roll back to the previous one.
KEEP_MODELS = 5


def _select(db: Session, req) -> list[Transaction]:
    query = db.query(Transaction)
    try:
        query = apply_transaction_filters(query, req, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return query.order_by(Transaction.date).all()


def _categories(db: Session) -> dict[int, Category]:
    return {c.id: c for c in db.query(Category).all()}


def _active_model(db: Session) -> tuple[CategorizerModel, "categorizer._Model"]:
    """The active model, or a 409 saying how to get one."""
    loaded = auto_categorize.load_active_model(db)
    if loaded is None:
        raise HTTPException(409, "No active model. Train one first, then activate it.")
    return loaded


def _prune(db: Session) -> None:
    keep = [
        m.id for m in db.query(CategorizerModel)
        .filter(CategorizerModel.status == "ready")
        .order_by(CategorizerModel.created_at.desc())
        .limit(KEEP_MODELS)
        .all()
    ]
    for model in db.query(CategorizerModel).filter(
        CategorizerModel.status == "ready",
        CategorizerModel.is_active.is_(False),
        CategorizerModel.id.notin_(keep),
    ).all():
        db.delete(model)


@router.post("/train", response_model=CategorizerModelOut)
def train_model(req: CategorizerTrainRequest, db: Session = Depends(get_db)):
    in_flight = (
        db.query(CategorizerModel)
        .filter(CategorizerModel.status == "training",
                CategorizerModel.created_at > datetime.utcnow() - STALE_TRAINING_AFTER)
        .first()
    )
    if in_flight is not None:
        raise HTTPException(409, "A training run is already in progress.")

    train_rows = _select(db, req.train)
    test_rows = _select(db, req.test)
    overlap = {t.id for t in train_rows} & {t.id for t in test_rows}
    if overlap:
        raise HTTPException(
            422,
            f"The training and test selections overlap on {len(overlap)} transaction(s). "
            "A model scored on rows it was trained on reports a precision it does not have.",
        )

    learnable = categorizer.trainable(train_rows)
    if len(learnable) < categorizer.MIN_TRAINING_ROWS:
        raise HTTPException(
            422,
            f"Only {len(learnable)} of the {len(train_rows)} selected transactions carry both a "
            f"category and a label to learn it from; at least {categorizer.MIN_TRAINING_ROWS} are needed.",
        )
    if len({t.category_id for t in learnable}) < 2:
        raise HTTPException(422, "The training selection covers a single category; nothing to learn.")
    if not categorizer.trainable(test_rows):
        raise HTTPException(
            422,
            "The test selection holds no categorised transaction, so the model could not be scored. "
            "Pick a period you have already filed.",
        )

    record = CategorizerModel(status="training", note=req.note, trained_rows=len(learnable))
    db.add(record)
    db.commit()

    try:
        model, params = categorizer.train(
            learnable,
            payee_min_occurrences=req.payee_min_occurrences,
            payee_min_stability=req.payee_min_stability,
        )
        categories = _categories(db)
        metrics = categorizer.evaluate(model, categorizer.trainable(test_rows), learnable, categories)
        metrics["payee"] = categorizer.evaluate_payee(model.payee_memory, test_rows)
        record.blob = categorizer.dumps(model)
        record.params = params
        record.metrics = metrics
        record.tested_rows = metrics.get("tested_rows", 0)
        record.status = "ready"
        # Flushed before pruning so the run that just finished counts towards
        # KEEP_MODELS instead of being kept on top of a full set.
        db.flush()
        _prune(db)
        db.commit()
    except Exception as e:  # noqa: BLE001 - the failure is reported, not swallowed
        db.rollback()
        record = db.query(CategorizerModel).filter(CategorizerModel.id == record.id).first()
        if record is not None:
            record.status = "failed"
            record.error = f"{type(e).__name__}: {e}"[:2000]
            db.commit()
        raise HTTPException(500, "Training failed; see the model's error field.")

    db.refresh(record)
    return record


@router.get("/models", response_model=list[CategorizerModelOut])
def list_models(db: Session = Depends(get_db)):
    return (
        db.query(CategorizerModel)
        .order_by(CategorizerModel.created_at.desc())
        .all()
    )


@router.post("/models/{model_id}/activate", response_model=CategorizerModelOut)
def activate_model(model_id: int, db: Session = Depends(get_db)):
    model = db.query(CategorizerModel).filter(CategorizerModel.id == model_id).first()
    if model is None:
        raise HTTPException(404, "Model not found")
    if model.status != "ready" or model.blob is None:
        raise HTTPException(422, "Only a model that finished training can be activated.")
    for other in db.query(CategorizerModel).filter(CategorizerModel.is_active.is_(True)).all():
        other.is_active = False
    model.is_active = True
    db.commit()
    db.refresh(model)
    return model


@router.delete("/models/{model_id}", status_code=204)
def delete_model(model_id: int, db: Session = Depends(get_db)):
    model = db.query(CategorizerModel).filter(CategorizerModel.id == model_id).first()
    if model is None:
        raise HTTPException(404, "Model not found")
    if model.is_active:
        raise HTTPException(409, "Deactivate the model before deleting it.")
    db.delete(model)
    db.commit()


@router.post("/suggest", response_model=CategorizerSuggestResponse)
def suggest(req: CategorizerSuggestRequest, db: Session = Depends(get_db)):
    if req.transaction_ids is None and req.selection is None:
        raise HTTPException(422, "Pass either transaction_ids or selection.")

    if req.transaction_ids is not None:
        if not req.transaction_ids:
            raise HTTPException(422, "transaction_ids must not be empty")
        rows = db.query(Transaction).filter(Transaction.id.in_(req.transaction_ids)).all()
        missing = sorted(set(req.transaction_ids) - {t.id for t in rows})
        if missing:
            raise HTTPException(404, f"Transaction(s) not found: {missing}")
    else:
        rows = _select(db, req.selection)[: req.limit]

    record, model = _active_model(db)
    categories = _categories(db)
    predictions = model.predict(rows)
    threshold = categorizer.DEFAULT_CONFIDENCE_THRESHOLD

    items = []
    for t, (category_id, confidence) in zip(rows, predictions):
        suggested_payee = model.payee_memory.suggest(t) if model.payee_memory else None
        category = categories.get(category_id)
        current = categories.get(t.category_id) if t.category_id else None
        items.append(CategorizerSuggestion(
            transaction_id=t.id,
            date=t.date,
            payee=t.payee,
            raw_label=t.raw_label,
            amount=t.amount,
            current_category_id=t.category_id,
            current_category_name=current.name if current else None,
            suggested_category_id=category_id,
            suggested_category_name=category.name if category else None,
            confidence=confidence,
            high_confidence=confidence >= threshold,
            suggested_payee=suggested_payee,
            category_changed=category_id != t.category_id,
            payee_changed=bool(suggested_payee) and suggested_payee != t.payee,
        ))

    return CategorizerSuggestResponse(
        model_id=record.id,
        threshold=threshold,
        items=items,
        category_changes=sum(1 for i in items if i.category_changed),
        payee_changes=sum(1 for i in items if i.payee_changed),
        high_confidence_changes=sum(1 for i in items if i.category_changed and i.high_confidence),
    )


@router.post("/apply", response_model=CategorizerApplyResponse)
def apply(req: CategorizerApplyRequest, actor_user_id: int | None = Query(None), db: Session = Depends(get_db)):
    """Write one category and/or payee per transaction.

    Deliberately not /api/transactions/bulk-update: that endpoint applies the
    same value to every row it touches, which is the opposite of what a list
    of per-row suggestions needs.

    Every row written is left `reconciled = False`, whatever it was before.
    That is the review queue: a suggestion the model was unsure about is
    applied anyway rather than left blank — an empty category hides, an
    unreconciled row shows — and this is what makes it findable afterwards.
    """
    if not req.items:
        raise HTTPException(422, "items must not be empty")
    if any(i.category_id is None and i.payee is None for i in req.items):
        raise HTTPException(422, "Each item must set a category_id, a payee, or both.")

    ids = [i.transaction_id for i in req.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(422, "The same transaction appears more than once.")

    transactions = {t.id: t for t in db.query(Transaction).filter(Transaction.id.in_(ids)).all()}
    missing = sorted(set(ids) - set(transactions))
    if missing:
        raise HTTPException(404, f"Transaction(s) not found: {missing}")

    category_ids = {i.category_id for i in req.items if i.category_id is not None}
    if category_ids:
        known = {c.id for c in db.query(Category).filter(Category.id.in_(category_ids)).all()}
        unknown = sorted(category_ids - known)
        if unknown:
            raise HTTPException(404, f"Category(ies) not found: {unknown}")

    updated_ids: list[int] = []
    skipped_ids: list[int] = []
    for item in req.items:
        transaction = transactions[item.transaction_id]
        fields: dict[str, object] = {}
        if item.category_id is not None:
            if transaction.category_id is not None and not req.overwrite_category:
                # Only the category is refused; a rename asked for in the same
                # item still goes through, since the two are independent.
                skipped_ids.append(transaction.id)
            else:
                fields["category_id"] = item.category_id
        if item.payee is not None:
            fields["payee"] = item.payee
        if not fields:
            continue

        # Shared with the automatic path a sync takes, so a suggestion ticked
        # here and one applied by a sync leave exactly the same trail.
        if auto_categorize.write_fields(db, transaction, fields, actor_user_id):
            updated_ids.append(transaction.id)

    if updated_ids:
        cache_service.invalidate(db, "balances", "charts", "account_totals")
    db.commit()
    return CategorizerApplyResponse(
        updated_count=len(updated_ids),
        transaction_ids=updated_ids,
        skipped_transaction_ids=skipped_ids,
    )
