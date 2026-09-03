"""Account CRUD, plus the account tier of split weights.

The `/api/accounts/{id}/split-weights` routes live here rather than with the
global weights so they can't be separated from their siblings by include_router
ordering.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import rules
import serializers
from database import get_db
from models import Account, AccountSplitWeight, AccountUser, User
from schemas import (
    AccountCreate, AccountOut, AccountSplitWeightOut, AccountSplitWeightUpdateItem,
    AccountUpdate, AccountUserCreate,
)

router = APIRouter()


def _sync_account_users(db: Session, account: Account, users: list[AccountUserCreate]):
    db.query(AccountUser).filter(AccountUser.account_id == account.id).delete()
    for u in users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))


def _sync_account_split_weights(db: Session, account: Account, weights: list[AccountSplitWeightUpdateItem]):
    db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account.id).delete()
    for w in weights:
        db.add(AccountSplitWeight(
            account_id=account.id,
            user_id=w.user_id,
            weight=w.weight,
        ))


@router.get("/api/accounts", response_model=list[AccountOut])
def get_accounts(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Account)
    if user_id is not None:
        query = query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = query.all()
    return [serializers.account_out(a) for a in accounts]


@router.post("/api/accounts", response_model=AccountOut, status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    rules.validate_ownership(data.users)
    rules.validate_users_exist(db, data.users)
    account = Account(name=data.name, type=data.type, balance=data.balance, currency=data.currency)
    db.add(account)
    db.flush()
    for u in data.users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))
    db.commit()
    db.refresh(account)
    return serializers.account_out(account)


@router.put("/api/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("users", None)
    if data.users is not None:
        rules.validate_ownership(data.users)
        rules.validate_users_exist(db, data.users)
        _sync_account_users(db, account, data.users)
    for field, value in update_data.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return serializers.account_out(account)


@router.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    if account.transactions:
        raise HTTPException(409, "Cannot delete account with existing transactions")
    db.delete(account)
    db.commit()


@router.get("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def get_account_split_weights(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    weights_by_user = {w.user_id: w.weight for w in db.query(AccountSplitWeight).filter(AccountSplitWeight.account_id == account_id).all()}
    return [
        AccountSplitWeightOut(user_id=u.id, user_name=u.name, weight=weights_by_user.get(u.id, 0))
        for u in db.query(User).all()
    ]


@router.put("/api/accounts/{account_id}/split-weights", response_model=list[AccountSplitWeightOut])
def update_account_split_weights(account_id: int, data: list[AccountSplitWeightUpdateItem], db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    rules.validate_weights(data)
    _sync_account_split_weights(db, account, data)
    db.commit()
    return get_account_split_weights(account_id, db)
