from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

import split_engine
from database import get_db
from models import AccountSplitWeight, CategorySplit, GlobalSplitWeight, Transaction, TransactionSplit, User
from schemas import UserCreate, UserOut, UserUpdate

router = APIRouter(prefix="/api/users")


@router.get("", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    db.flush()
    # Every user gets a positive global split weight out of the box, so the
    # global tier can never be empty and every transaction always has a
    # fallback to resolve its split from.
    db.add(GlobalSplitWeight(user_id=user.id, weight=1))
    db.commit()
    db.refresh(user)
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.account_associations:
        raise HTTPException(409, "Cannot delete user who owns accounts")

    # Transactions where this user is currently the split's sole
    # participant: just deleting their TransactionSplit row would leave the
    # transaction with zero splits, violating the mandatory-split invariant.
    user_split_transaction_ids = [
        tx_id for (tx_id,) in db.query(TransactionSplit.transaction_id)
        .filter(TransactionSplit.user_id == user_id).all()
    ]
    solely_split_transaction_ids = []
    if user_split_transaction_ids:
        counts = db.query(TransactionSplit.transaction_id, func.count(TransactionSplit.user_id)).filter(
            TransactionSplit.transaction_id.in_(user_split_transaction_ids)
        ).group_by(TransactionSplit.transaction_id).all()
        solely_split_transaction_ids = [tx_id for tx_id, count in counts if count == 1]

    db.query(CategorySplit).filter(CategorySplit.user_id == user_id).delete()
    db.query(GlobalSplitWeight).filter(GlobalSplitWeight.user_id == user_id).delete()
    db.query(AccountSplitWeight).filter(AccountSplitWeight.user_id == user_id).delete()
    db.query(TransactionSplit).filter(TransactionSplit.user_id == user_id).delete()

    if solely_split_transaction_ids:
        # Re-resolve those transactions' splits via the category > account >
        # global cascade now that this user's own tier rows are gone, rather
        # than leaving them permanently unsplit. If even that comes up empty
        # (no other user has a usable weight anywhere), refuse the deletion
        # instead — nothing has been committed yet, so the deletes above are
        # rolled back along with it.
        transactions = db.query(Transaction).filter(Transaction.id.in_(solely_split_transaction_ids)).all()
        for transaction in transactions:
            source, weights = split_engine.resolve_default_weights(db, transaction.category_id, transaction.account_id)
            if not weights:
                raise HTTPException(
                    409,
                    f"Cannot delete user: transaction {transaction.id} would be left without a split, "
                    "and no other user has a split weight to fall back to",
                )
            split_engine.apply_split(db, transaction, weights, source=source or "global")

    db.delete(user)
    db.commit()
