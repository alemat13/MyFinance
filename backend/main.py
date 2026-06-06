from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db
from models import Account, Category, Transaction
from schemas import (
    AccountOut, AccountCreate, AccountUpdate,
    CategoryOut, CategoryCreate, CategoryUpdate,
    TransactionOut, TransactionCreate, TransactionUpdate,
    DashboardResponse,
)

app = FastAPI(title="Personal Finance Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Accounts ──────────────────────────────────────────────────────

@app.get("/api/accounts", response_model=list[AccountOut])
def get_accounts(db: Session = Depends(get_db)):
    return db.query(Account).all()


@app.post("/api/accounts", response_model=AccountOut, status_code=201)
def create_account(data: AccountCreate, db: Session = Depends(get_db)):
    account = Account(**data.model_dump())
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@app.put("/api/accounts/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountUpdate, db: Session = Depends(get_db)):
    account = db.query(Account).filter(Account.id == account_id).first()
    if not account:
        raise HTTPException(404, "Account not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    db.commit()
    db.refresh(account)
    return account


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


@app.get("/api/transactions", response_model=list[TransactionOut])
def get_transactions(db: Session = Depends(get_db)):
    results = (
        db.query(Transaction, Account.name, Category.name)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id)
        .order_by(Transaction.date.desc())
        .all()
    )
    return [
        TransactionOut(
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
def get_dashboard(db: Session = Depends(get_db)):
    accounts = db.query(Account).all()

    recent_results = (
        db.query(Transaction, Account.name, Category.name)
        .join(Account, Transaction.account_id == Account.id)
        .join(Category, Transaction.category_id == Category.id)
        .order_by(Transaction.date.desc())
        .limit(10)
        .all()
    )

    recent_transactions = [
        TransactionOut(
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
        for t, account_name, category_name in recent_results
    ]

    return DashboardResponse(accounts=accounts, recent_transactions=recent_transactions)
