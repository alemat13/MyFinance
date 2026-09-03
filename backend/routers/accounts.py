from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from database import get_db
from models import Account, AccountSplitWeight, AccountUser
from rules import validate_ownership, validate_users_exist
from schemas import AccountCreate, AccountOut, AccountUpdate, AccountUserCreate
from serializers import build_account_out

router = APIRouter(prefix="/api/accounts")


def _sync_account_users(db: Session, account: Account, users: list[AccountUserCreate]):
    db.query(AccountUser).filter(AccountUser.account_id == account.id).delete()
    for u in users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))


@router.get("", response_model=list[AccountOut])
def get_accounts(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Account).options(
        selectinload(Account.user_associations).joinedload(AccountUser.user),
        selectinload(Account.split_weight_associations).joinedload(AccountSplitWeight.user),
    )
    if user_id is not None:
        query = query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = query.all()
    return [build_account_out(a) for a in accounts]


@router.post("", response_model=AccountOut, status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    validate_ownership(data.users)
    validate_users_exist(db, data.users)
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
    return build_account_out(account)


@router.put("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    update_data = data.model_dump(exclude_unset=True)
    update_data.pop("users", None)
    if data.users is not None:
        validate_ownership(data.users)
        validate_users_exist(db, data.users)
        _sync_account_users(db, account, data.users)
    for field, value in update_data.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return build_account_out(account)


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    if account.transactions:
        raise HTTPException(409, "Cannot delete account with existing transactions")
    db.delete(account)
    db.commit()
