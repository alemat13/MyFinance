"""Endpoints for the order of account type groups (account_types.py)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import account_types
from database import get_db
from schemas import AccountTypeOrderRequest

router = APIRouter(prefix="/api/account-types")


@router.get("/order", response_model=list[str])
def get_account_type_order(db: Session = Depends(get_db)):
    """The positioned type keys, first to last."""
    return account_types.ordered_keys(db)


@router.put("/order", response_model=list[str])
def set_account_type_order(data: AccountTypeOrderRequest, db: Session = Depends(get_db)):
    account_types.set_order(db, data.types)
    return account_types.ordered_keys(db)
