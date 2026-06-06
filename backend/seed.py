from datetime import date

from database import engine, SessionLocal, Base
from models import Account, Category, Transaction


def seed():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

    session = SessionLocal()

    accounts = [
        Account(name="Joint Checking", type="Checking", balance=5420.00),
        Account(name="Personal Savings", type="Savings", balance=12800.00),
    ]
    session.add_all(accounts)
    session.flush()

    categories = [
        Category(name="Salary", type="Income"),
        Category(name="Freelance", type="Income"),
        Category(name="Rent", type="Expense"),
        Category(name="Groceries", type="Expense"),
        Category(name="Dining Out", type="Expense"),
        Category(name="Utilities", type="Expense"),
        Category(name="Transfer", type="Transfer"),
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
            category_id=5,
        ),
    ]
    session.add_all(transactions)
    session.commit()
    session.close()

    print("Database seeded!")


if __name__ == "__main__":
    seed()
