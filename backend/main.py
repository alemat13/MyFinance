from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from database import get_db
from models import Account, Category, Transaction
from schemas import AccountOut, CategoryOut, TransactionOut, DashboardResponse

app = FastAPI(title="Personal Finance Manager API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/accounts", response_model=list[AccountOut])
def get_accounts(db: Session = Depends(get_db)):
    return db.query(Account).all()


@app.get("/api/categories", response_model=list[CategoryOut])
def get_categories(db: Session = Depends(get_db)):
    return db.query(Category).all()


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
