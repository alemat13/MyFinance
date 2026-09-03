"""The global split-weight tier, and the derived per-user balances."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import rules
import serializers
import split_engine
from database import get_db
from models import GlobalSplitWeight, User
from schemas import GlobalSplitWeightOut, GlobalSplitWeightUpdateItem, UserBalanceOut

router = APIRouter()


@router.get("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def get_split_weights(db: Session = Depends(get_db)):
    weights_by_user = {w.user_id: w.weight for w in db.query(GlobalSplitWeight).all()}
    return [
        GlobalSplitWeightOut(user_id=u.id, user_name=u.name, weight=weights_by_user.get(u.id, 0.0))
        for u in db.query(User).all()
    ]


@router.put("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def update_split_weights(data: list[GlobalSplitWeightUpdateItem], db: Session = Depends(get_db)):
    rules.validate_weights(data)
    db.query(GlobalSplitWeight).delete()
    for w in data:
        db.add(GlobalSplitWeight(user_id=w.user_id, weight=w.weight))
    db.commit()
    return get_split_weights(db)



@router.get("/api/balances", response_model=list[UserBalanceOut])
def get_balances(db: Session = Depends(get_db)):
    return [
        serializers.user_balance_out(row) for row in split_engine.compute_balances(db)
    ]
