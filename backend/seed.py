from datetime import date

import split_engine
from database import engine, SessionLocal, Base
from models import (
    Account, Category, Transaction, User, AccountUser,
    CategorySplit, GlobalSplitWeight,
)


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()

    users = [
        User(name="Alice", email="alice@example.com"),
        User(name="Bob", email="bob@example.com"),
    ]
    session.add_all(users)
    session.flush()

    accounts = [
        Account(name="Joint Checking", type="Checking", balance=5420.00, currency="EUR"),
        Account(name="Personal Savings", type="Savings", balance=12800.00, currency="USD"),
    ]
    session.add_all(accounts)
    session.flush()

    session.add_all([
        AccountUser(account_id=accounts[0].id, user_id=users[0].id, ownership_percentage=50.0),
        AccountUser(account_id=accounts[0].id, user_id=users[1].id, ownership_percentage=50.0),
        AccountUser(account_id=accounts[1].id, user_id=users[0].id, ownership_percentage=100.0),
    ])

    categories = [
        Category(name="Salary", type="Income", color="#16a34a", icon="Landmark"),
        Category(name="Freelance", type="Income", color="#0891b2", icon="Briefcase"),
        Category(name="Rent", type="Expense", color="#dc2626", icon="Home"),
        Category(name="Groceries", type="Expense", color="#d97706", icon="ShoppingCart"),
        Category(name="Dining Out", type="Expense", color="#ea580c", icon="Utensils"),
        Category(name="Utilities", type="Expense", color="#4f46e5", icon="Tv"),
        Category(name="Transfer", type="Transfer", color="#64748b", icon="ArrowLeftRight"),
    ]
    session.add_all(categories)
    session.flush()

    transactions = [
        Transaction(
            date=date(2026, 1, 3),
            payee="Acme Corp Salary",
            memo="Monthly salary deposit",
            amount=5200.00,
            account_id=1,
            category_id=1,
        ),
        Transaction(
            date=date(2026, 1, 5),
            payee="Sunset Properties",
            memo="January rent",
            amount=-1800.00,
            account_id=1,
            category_id=3,
        ),
        Transaction(
            date=date(2026, 1, 8),
            payee="Whole Foods",
            memo="Weekly groceries",
            amount=-120.50,
            account_id=1,
            category_id=4,
        ),
        Transaction(
            date=date(2026, 1, 12),
            payee="Freelance Project Alpha",
            memo="Web dev contract payment",
            amount=800.00,
            account_id=2,
            category_id=2,
        ),
        Transaction(
            date=date(2026, 1, 15),
            payee="Olive Garden",
            memo="Date night dinner",
            amount=-65.00,
            account_id=1,
            category_id=5,
        ),
        Transaction(
            date=date(2026, 1, 20),
            payee="Electric Co.",
            memo="January electricity bill",
            amount=-95.00,
            account_id=1,
            category_id=6,
        ),
        Transaction(
            date=date(2026, 2, 3),
            payee="Acme Corp Salary",
            memo="Monthly salary deposit",
            amount=5200.00,
            account_id=1,
            category_id=1,
        ),
        Transaction(
            date=date(2026, 2, 5),
            payee="Sunset Properties",
            memo="February rent",
            amount=-1800.00,
            account_id=1,
            category_id=3,
        ),
        Transaction(
            date=date(2026, 2, 10),
            payee="Transfer to Savings",
            memo="Transfer for vacation fund",
            amount=-500.00,
            account_id=1,
            category_id=7,
        ),
        Transaction(
            date=date(2026, 2, 10),
            payee="Transfer from Checking",
            memo="Transfer for vacation fund",
            amount=500.00,
            account_id=2,
            category_id=7,
        ),
        Transaction(
            date=date(2026, 2, 14),
            payee="Costo",
            memo="Monthly groceries bulk",
            amount=-210.30,
            account_id=1,
            category_id=4,
        ),
        Transaction(
            date=date(2026, 3, 3),
            payee="Acme Corp Salary",
            memo="Monthly salary deposit",
            amount=5200.00,
            account_id=1,
            category_id=1,
        ),
        Transaction(
            date=date(2026, 3, 5),
            payee="Sunset Properties",
            memo="March rent",
            amount=-1800.00,
            account_id=1,
            category_id=3,
        ),
        Transaction(
            date=date(2026, 3, 18),
            payee="Gas Co.",
            memo="March gas bill",
            amount=-72.00,
            account_id=1,
            category_id=6,
        ),
        Transaction(
            date=date(2026, 4, 3),
            payee="Acme Corp Salary",
            memo="Monthly salary deposit",
            amount=5450.00,
            account_id=1,
            category_id=1,
        ),
        Transaction(
            date=date(2026, 4, 25),
            payee="Freelance Project Beta",
            memo="Mobile app project payment",
            amount=1500.00,
            account_id=2,
            category_id=2,
        ),
        Transaction(
            date=date(2026, 5, 5),
            payee="Sunset Properties",
            memo="May rent",
            amount=-1800.00,
            account_id=1,
            category_id=3,
        ),
        Transaction(
            date=date(2026, 6, 1),
            payee="Sushi Place",
            memo="Anniversary dinner",
            amount=-120.00,
            account_id=1,
            category_id=None,
        ),
    ]
    session.add_all(transactions)
    session.flush()

    # Global default split weights (tier 3) — income-proportional fallback.
    session.add_all([
        GlobalSplitWeight(user_id=users[0].id, weight=52000.0),
        GlobalSplitWeight(user_id=users[1].id, weight=48000.0),
    ])

    # Category default split (tier 2) — Transfer is always split 50/50.
    transfer_category = categories[6]
    session.add_all([
        CategorySplit(category_id=transfer_category.id, user_id=users[0].id, split_percentage=50.0),
        CategorySplit(category_id=transfer_category.id, user_id=users[1].id, split_percentage=50.0),
    ])
    session.flush()

    # Resolve a split for every seeded transaction, exactly as the API does
    # on create — a manual override (tier 1) on the rent payment, everything
    # else auto-resolved (tier 2 category default or tier 3 global default).
    rent_transaction = transactions[1]
    for transaction in transactions:
        if transaction is rent_transaction:
            split_engine.apply_split(session, transaction, override=[
                (users[0].id, -900.0),
                (users[1].id, -900.0),
            ])
        else:
            split_engine.apply_split(session, transaction)

    session.commit()
    session.close()

    print("Database seeded!")


if __name__ == "__main__":
    seed()
