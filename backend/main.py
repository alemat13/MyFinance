from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import join

from database import get_db
from models import Account, Category, Transaction, User, AccountUser
from schemas import (
    AccountOut, AccountCreate, AccountUpdate,
    CategoryOut, CategoryCreate, CategoryUpdate,
    TransactionOut, TransactionCreate, TransactionUpdate,
    DashboardResponse,
    UserOut, UserCreate, UserUpdate,
    AccountUserOut, AccountUserCreate,
)

app = FastAPI(title="Personal Finance Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Helpers ────────────────────────────────────────────────────────

def _account_out(account: Account) -> AccountOut:
    return AccountOut(
        id=account.id,
        name=account.name,
        type=account.type,
        balance=account.balance,
        created_at=account.created_at,
        users=[
            AccountUserOut(
                user_id=au.user_id,
                user_name=au.user.name,
                ownership_percentage=au.ownership_percentage,
            )
            for au in account.user_associations
        ],
    )


def _transaction_out(db: Session, transaction_id: int) -> TransactionOut:
    t, account_name, category_name = (
        db.query(Transaction, Account.name, Category.name)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id)
        .filter(Transaction.id == transaction_id)
        .first()
    )
    return TransactionOut(
        id=t.id,
        date=t.date,
        payee=t.payee,
        memo=t.memo,
        amount=t.amount,
        account_id=t.account_id,
        account_name=account_name,
        category_id=t.category_id,
        category_name=category_name,
    )


def _sync_account_users(db: Session, account: Account, users: list[AccountUserCreate]):
    db.query(AccountUser).filter(AccountUser.account_id == account.id).delete()
    for u in users:
        db.add(AccountUser(
            account_id=account.id,
            user_id=u.user_id,
            ownership_percentage=u.ownership_percentage,
        ))


def _validate_ownership(users: list[AccountUserCreate]):
    if users:
        total = sum(u.ownership_percentage for u in users)
        if abs(total - 100.0) > 0.01:
            raise HTTPException(422, f"Ownership percentages must sum to 100, got {total}")


# ── Users ──────────────────────────────────────────────────────────

@app.get("/api/users", response_model=list[UserOut])
def get_users(db: Session = Depends(get_db)):
    return db.query(User).all()


@app.post("/api/users", response_model=UserOut, status_code=201)
def create_user(data: UserCreate, db: Session = Depends(get_db)):
    user = User(**data.model_dump())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.put("/api/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, data: UserUpdate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return user


@app.delete("/api/users/{user_id}", status_code=204)
def delete_user(user_id: int, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.account_associations:
        raise HTTPException(409, "Cannot delete user who owns accounts")
    db.delete(user)
    db.commit()


# ── Accounts ──────────────────────────────────────────────────────

@app.get("/api/accounts", response_model=list[AccountOut])
def get_accounts(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = db.query(Account)
    if user_id is not None:
        query = query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = query.all()
    return [_account_out(a) for a in accounts]


@app.post("/api/accounts", response_model=AccountOut, status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    _validate_ownership(data.users)
    account = Account(name=data.name, type=data.type, balance=data.balance)
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
    return _account_out(account)


@app.put("/api/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    update_data = data.model_dump(exclude_unset=True)
    users_data = update_data.pop("users", None)
    if users_data is not None:
        _validate_ownership(users_data)
        _sync_account_users(db, account, users_data)
    for field, value in update_data.items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return _account_out(account)


@app.delete("/api/accounts/{account_id}", status_code=204)
def delete_account(account_id: int, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    if account.transactions:
        raise HTTPException(409, "Cannot delete account with existing transactions")
    db.delete(account)
    db.commit()


# ── Categories ────────────────────────────────────────────────────

@app.get("/api/categories", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()


@app.post("/api/categories", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryCreate, db: Session = Depends(get_db)):
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@app.put("/api/categories/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryUpdate, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@app.delete("/api/categories/{category_id}", status_code=204)
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(404, "Category not found")
    if category.transactions:
        raise HTTPException(409, "Cannot delete category with existing transactions")
    db.delete(category)
    db.commit()


# ── Transactions ──────────────────────────────────────────────────

@app.get("/api/transactions", response_model=list[TransactionOut])
def get_transactions(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    query = (
        db.query(Transaction, Account.name, Category.name)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id)
    )
    if user_id is not None:
        query = query.join(AccountUser, Account.id == AccountUser.account_id).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    results = query.order_by(Transaction.date.desc()).all()
    return [
        TransactionOut(
            id=t.id, date=t.date, payee=t.payee, memo=t.memo,
            amount=t.amount, account_id=t.account_id,
            account_name=account_name, category_id=t.category_id,
            category_name=category_name,
        )
        for t, account_name, category_name in results
    ]


@app.post("/api/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionCreate, db: Session = Depends(get_db)):
    transaction = Transaction(**data.model_dump())
    db.add(transaction)
    db.commit()
    return _transaction_out(db, transaction.id)


@app.put("/api/transactions/{transaction_id}", response_model=TransactionOut)
def update_transaction(transaction_id: int, data: TransactionUpdate, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(transaction, field, value)
    db.commit()
    return _transaction_out(db, transaction.id)


@app.delete("/api/transactions/{transaction_id}", status_code=204)
def delete_transaction(transaction_id: int, db: Session = Depends(get_db)):
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(404, "Transaction not found")
    db.delete(transaction)
    db.commit()


# ── Dashboard ─────────────────────────────────────────────────────

@app.get("/api/dashboard", response_model=DashboardResponse)
def get_dashboard(user_id: int | None = Query(None), db: Session = Depends(get_db)):
    accounts_query = db.query(Account)
    if user_id is not None:
        accounts_query = accounts_query.join(AccountUser).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    accounts = accounts_query.all()

    tx_query = (
        db.query(Transaction, Account.name, Category.name)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id)
    )
    if user_id is not None:
        tx_query = tx_query.join(AccountUser, Account.id == AccountUser.account_id).filter(
            AccountUser.user_id == user_id,
            AccountUser.ownership_percentage > 0,
        ).distinct()
    recent_results = tx_query.order_by(Transaction.date.desc()).limit(10).all()

    recent_transactions = [
        TransactionOut(
            id=t.id, date=t.date, payee=t.payee, memo=t.memo,
            amount=t.amount, account_id=t.account_id,
            account_name=account_name, category_id=t.category_id,
            category_name=category_name,
        )
        for t, account_name, category_name in recent_results
    ]

    return DashboardResponse(
        accounts=[_account_out(a) for a in accounts],
        recent_transactions=recent_transactions,
    )
