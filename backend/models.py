from datetime import datetime, date

from sqlalchemy import Column, Integer, String, Float, DateTime, Date, Text, ForeignKey, JSON
from sqlalchemy.orm import relationship

from database import Base


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    type = Column(String(50), nullable=False)
    balance = Column(Float, default=0.0)
    currency = Column(String(3), nullable=False, default="EUR")
    created_at = Column(DateTime, default=datetime.utcnow)

    transactions = relationship("Transaction", back_populates="account")
    user_associations = relationship("AccountUser", back_populates="account", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(String(50), nullable=False)

    transactions = relationship("Transaction", back_populates="category")
    splits = relationship("CategorySplit", back_populates="category", cascade="all, delete-orphan")


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
    splits = relationship("TransactionSplit", back_populates="transaction", cascade="all, delete-orphan")


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


class CategorySplit(Base):
    __tablename__ = "category_splits"

    category_id = Column(Integer, ForeignKey("categories.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    split_percentage = Column(Float, nullable=False, default=0.0)

    category = relationship("Category", back_populates="splits")
    user = relationship("User")


class GlobalSplitWeight(Base):
    __tablename__ = "global_split_weights"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    weight = Column(Float, nullable=False, default=0.0)

    user = relationship("User")


class TransactionSplit(Base):
    __tablename__ = "transaction_splits"

    transaction_id = Column(Integer, ForeignKey("transactions.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    share_amount = Column(Float, nullable=False)
    source = Column(String(20), nullable=False)  # 'manual' | 'category_default' | 'global_default'

    transaction = relationship("Transaction", back_populates="splits")
    user = relationship("User")


class TransactionHistory(Base):
    __tablename__ = "transaction_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Deliberately a plain Integer, NOT a ForeignKey: database.py enables
    # PRAGMA foreign_keys=ON, and delete_transaction() hard-deletes the
    # Transaction row. A real FK would either raise IntegrityError on delete
    # (default NO ACTION) or, with ondelete="SET NULL", erase the very
    # linkage this table exists to preserve. Same reasoning applies to
    # changed_by_user_id (DELETE /api/users/{id} is a real hard delete too).
    transaction_id = Column(Integer, nullable=False, index=True)
    action = Column(String(20), nullable=False)  # 'created' | 'updated' | 'deleted'
    source = Column(String(20), nullable=True)  # 'manual' | 'csv_import' (created only)
    changed_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    changed_by_user_id = Column(Integer, nullable=True)

    # Snapshot of the transaction's core fields as of this event
    # (for 'deleted', the state immediately before removal).
    date = Column(Date, nullable=True)
    payee = Column(String(200), nullable=True)
    memo = Column(Text, nullable=True)
    amount = Column(Float, nullable=True)
    account_id = Column(Integer, nullable=True)
    category_id = Column(Integer, nullable=True)

    # For 'updated' rows only: {field: {"old": ..., "new": ...}} for fields that actually changed.
    changes = Column(JSON, nullable=True)
