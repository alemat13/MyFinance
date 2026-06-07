from datetime import datetime, date

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, ForeignKey
from sqlalchemy.orm import relationship

from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    balance = Column(Float, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="account")
    user_associations = relationship("AccountUser", back_populates="account")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(String(50), nullable=False)

    transactions = relationship("Transaction", back_populates="category")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    payee = Column(String(200), nullable=False)
    memo = Column(Text, nullable=True)
    amount = Column(Float, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    category_id = Column(Integer, ForeignKey("categories.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(200), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    account_associations = relationship("AccountUser", back_populates="user")


class AccountUser(Base):
    __tablename__ = "account_users"

    account_id = Column(Integer, ForeignKey("accounts.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    ownership_percentage = Column(Float, nullable=False, default=0.0)

    account = relationship("Account", back_populates="user_associations")
    user = relationship("User", back_populates="account_associations")
