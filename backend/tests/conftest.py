from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

from database import Base, get_db
from main import app
from models import Account, Category, Transaction, User, AccountUser


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def sample_account(db):
    account = Account(name="Test Checking", type="Checking", balance=1000.0)
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@pytest.fixture()
def sample_category(db):
    category = Category(name="Test Salary", type="Income")
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@pytest.fixture()
def sample_user(db):
    user = User(name="Test User", email="test@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def sample_user2(db):
    user = User(name="Second User", email="second@example.com")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture()
def sample_account_with_user(db, sample_account, sample_user):
    au = AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0)
    db.add(au)
    db.commit()
    return sample_account


@pytest.fixture()
def sample_transaction(db, sample_account, sample_category):
    transaction = Transaction(
        date=date(2026, 1, 15),
        payee="Test Payee",
        amount=500.0,
        account_id=sample_account.id,
        category_id=sample_category.id,
    )
    db.add(transaction)
    db.commit()
    db.refresh(transaction)
    return transaction
