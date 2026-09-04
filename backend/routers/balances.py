from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import split_engine
from database import get_db
from schemas import UserBalanceOut

router = APIRouter(prefix="/api/balances")


@router.get("", response_model=list[UserBalanceOut])
def get_balances(db: Session = Depends(get_db)):
    return [
        UserBalanceOut(user_id=user_id, user_name=user_name, currency=currency, net_position=net_position)
        for user_id, user_name, currency, net_position in split_engine.compute_balances(db)
    ]
