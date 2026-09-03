"""User CRUD."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import AccountSplitWeight, CategorySplit, GlobalSplitWeight, TransactionSplit, User
from schemas import UserCreate, UserOut, UserUpdate

router = APIRouter()


@router.get("/api/users", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.post("/api/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/api/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.account_associations:
        raise HTTPException(409, "Cannot delete user who owns accounts")
    db.query(CategorySplit).filter(CategorySplit.user_id == user_id).delete()
    db.query(GlobalSplitWeight).filter(GlobalSplitWeight.user_id == user_id).delete()
    db.query(AccountSplitWeight).filter(AccountSplitWeight.user_id == user_id).delete()
    db.query(TransactionSplit).filter(TransactionSplit.user_id == user_id).delete()
    db.delete(user)
    db.commit()
