from datetime import date

from models import Account, AccountUser, Transaction, User, GlobalSplitWeight


def test_balances_empty(client):
    response = client.get("/api/balances")
    assert response.status_code == 200
    assert response.json() == []


def test_balances_reflect_split_vs_ownership(client, db):
    alex = User(name="Alex")
    olivia = User(name="Olivia")
    db.add_all([alex, olivia])
    db.flush()

    joint = Account(name="Joint Checking", type="Checking", balance=0.0)
    db.add(joint)
    db.flush()
    db.add_all([
        AccountUser(account_id=joint.id, user_id=alex.id, ownership_percentage=100.0),
        AccountUser(account_id=joint.id, user_id=olivia.id, ownership_percentage=0.0),
    ])
    db.commit()

    # Alex pays the full $100 (100% ownership of the paying account), but the
    # split is a custom 50/50 weight -> Alex should be owed $50 by Olivia.
    response = client.post(
        "/api/transactions",
        json={
            "account_id": joint.id,
            "category_id": _make_category(db).id,
            "date": "2026-01-15",
            "payee": "Groceries",
            "amount": -100.0,
            "split_weights": [
                {"user_id": alex.id, "weight": 1},
                {"user_id": olivia.id, "weight": 1},
            ],
        },
    )
    assert response.status_code == 201

    response = client.get("/api/balances")
    assert response.status_code == 200
    balances = {b["user_id"]: b["net_position"] for b in response.json()}
    # Alex paid -100 (100% ownership) but is only liable for -50 -> net +50 (owed).
    assert balances[alex.id] == 50.0
    # Olivia paid 0 but is liable for -50 -> net -50 (owes).
    assert balances[olivia.id] == -50.0
    assert all(b["currency"] == "EUR" for b in response.json())


def test_balances_kept_separate_per_currency(client, db):
    alex = User(name="Alex")
    olivia = User(name="Olivia")
    db.add_all([alex, olivia])
    db.flush()

    eur_account = Account(name="EUR Account", type="Checking", balance=0.0, currency="EUR")
    usd_account = Account(name="USD Account", type="Checking", balance=0.0, currency="USD")
    db.add_all([eur_account, usd_account])
    db.flush()
    db.add_all([
        AccountUser(account_id=eur_account.id, user_id=alex.id, ownership_percentage=100.0),
        AccountUser(account_id=eur_account.id, user_id=olivia.id, ownership_percentage=0.0),
        AccountUser(account_id=usd_account.id, user_id=alex.id, ownership_percentage=100.0),
        AccountUser(account_id=usd_account.id, user_id=olivia.id, ownership_percentage=0.0),
    ])
    db.commit()

    category = _make_category(db)
    for account_id, amount in [(eur_account.id, -100.0), (usd_account.id, -60.0)]:
        response = client.post(
            "/api/transactions",
            json={
                "account_id": account_id,
                "category_id": category.id,
                "date": "2026-01-15",
                "payee": "Groceries",
                "amount": amount,
                "split_weights": [
                    {"user_id": alex.id, "weight": 1},
                    {"user_id": olivia.id, "weight": 1},
                ],
            },
        )
        assert response.status_code == 201

    response = client.get("/api/balances")
    assert response.status_code == 200
    balances = {(b["user_id"], b["currency"]): b["net_position"] for b in response.json()}
    assert balances[(alex.id, "EUR")] == 50.0
    assert balances[(olivia.id, "EUR")] == -50.0
    assert balances[(alex.id, "USD")] == 30.0
    assert balances[(olivia.id, "USD")] == -30.0


def _make_category(db):
    from models import Category
    category = Category(name="Balances Test Category", type="Expense")
    db.add(category)
    db.commit()
    db.refresh(category)
    return category
