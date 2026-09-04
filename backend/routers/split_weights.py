from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Account, AccountSplitWeight, GlobalSplitWeight, User
from rules import validate_weights
from schemas import AccountSplitWeightOut, AccountSplitWeightUpdateItem, GlobalSplitWeightOut, GlobalSplitWeightUpdateItem
from serializers import build_split_weight_rows

router = APIRouter()


def _sync_account_split_weights(db: Session, account: Account, weights: list[AccountSplitWeightUpdateItem]):
    db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account.id).delete()
    for w in weights:
        db.add(AccountSplitWeight(
            account_id=account.id,
            user_id=w.user_id,
            weight=w.weight,
        ))


@router.get("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def get_split_weights(db: Session = Depends(get_db)):
    weights_by_user = {w.user_id: w.weight for w in db.query(GlobalSplitWeight).all()}
    return build_split_weight_rows(weights_by_user, db.query(User).all(), GlobalSplitWeightOut)


@router.put("/api/split-weights", response_model=list[GlobalSplitWeightOut])
def update_split_weights(data: list[GlobalSplitWeightUpdateItem], db: Session = Depends(get_db)):
    validate_weights(data)
    db.query(GlobalSplitWeight).delete()
    for w in data:
        db.add(GlobalSplitWeight(user_id=w.user_id, weight=w.weight))
    db.commit()
    return get_split_weights(db)


@router.get("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def get_account_split_weights(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    weights_by_user = {w.user_id: w.weight for w in db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account_id).all()}
    return build_split_weight_rows(weights_by_user, db.query(User).all(), AccountSplitWeightOut)


@router.put("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def update_account_split_weights(account_id: int, data: list[AccountSplitWeightUpdateItem], db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    validate_weights(data)
    _sync_account_split_weights(db, account, data)
    db.commit()
    return get_account_split_weights(account_id, db)
