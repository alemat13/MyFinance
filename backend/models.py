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
    split_weight_associations = relationship("AccountSplitWeight", back_populates="account", cascade="all, delete-orphan")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, unique=True)
    type = Column(String(50), nullable=False)
    color = Column(String(7), nullable=True)
    icon = Column(String(50), nullable=True)
    # Self-referential FK for a strict 2-level hierarchy: a category with
    # parent_id set is a subcategory, and its parent must itself have no
    # parent (enforced in main.py, not at the DB level).
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)

    transactions = relationship("Transaction", back_populates="category")
    splits = relationship("CategorySplit", back_populates="category", cascade="all, delete-orphan")
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    date = Column(Date, nullable=False)
    payee = Column(String(200), nullable=False)
    memo = Column(Text, nullable=True)
    amount = Column(Float, nullable=False)
    account_id = Column(Integer, ForeignKey("accounts.id"))
    category_id = Column(Integer, ForeignKey("categories.id"))
    # Months relative to `date` this transaction should be accounted in, e.g.
    # -1 = the month before date's month. 0 (default) = same month as date.
    accounting_month_offset = Column(Integer, nullable=False, default=0)
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
    # Relative integer weight, not a percentage — no sum-to-100 requirement.
    # Highest-priority tier: used only to prefill a transaction's own weights.
    weight = Column(Integer, nullable=False, default=0)

    category = relationship("Category", back_populates="splits")
    user = relationship("User")


class GlobalSplitWeight(Base):
    __tablename__ = "global_split_weights"

    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    # Lowest-priority tier: used only to prefill a transaction's own weights.
    weight = Column(Integer, nullable=False, default=0)

    user = relationship("User")


class AccountSplitWeight(Base):
    __tablename__ = "account_split_weights"

    account_id = Column(Integer, ForeignKey("accounts.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    # Middle-priority tier: used only to prefill a transaction's own weights.
    # Entirely separate from AccountUser.ownership_percentage.
    weight = Column(Integer, nullable=False, default=0)

    account = relationship("Account", back_populates="split_weight_associations")
    user = relationship("User")


class TransactionSplit(Base):
    __tablename__ = "transaction_splits"

    transaction_id = Column(Integer, ForeignKey("transactions.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    # The integer weight this transaction stores for this user — freely
    # typed by the client, or bulk-filled from a tier via a quick-access
    # button. Never re-resolved from current tier config after the fact.
    weight = Column(Integer, nullable=False, default=0)
    # Derived from weight + the transaction's current amount, recomputed and
    # persisted on every create/update. Never directly client-editable.
    share_amount = Column(Float, nullable=False)
    # Which tier/button produced the current weight set.
    source = Column(String(20), nullable=False)  # 'global' | 'account' | 'category' | 'custom'

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
    accounting_month_offset = Column(Integer, nullable=True)

    # For 'updated' rows only: {field: {"old": ..., "new": ...}} for fields that actually changed.
    changes = Column(JSON, nullable=True)
