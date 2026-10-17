from datetime import date

from models import Category, Transaction


def _add(db, account, payee, day, category=None, amount=-10.0):
    db.add(Transaction(
        date=date(2026, 9, day), payee=payee, amount=amount, account_id=account.id,
        category_id=category.id if category else None, accounting_month_offset=0,
    ))


def test_most_recent_first_deduplicated_by_payee_and_category(client, db, sample_account):
    food = Category(name="Food", type="Expense")
    fuel = Category(name="Fuel", type="Expense")
    db.add_all([food, fuel])
    db.flush()
    _add(db, sample_account, "Carrefour", 1, food, amount=-11)
    _add(db, sample_account, "Carrefour", 5, food, amount=-55)
    _add(db, sample_account, "CARREFOUR", 3, fuel)
    _add(db, sample_account, "Carrefour Market", 2)
    _add(db, sample_account, "Leclerc", 9, food)
    db.commit()

    res = client.get("/api/transactions/payee-suggestions", params={"q": "carref"})
    assert res.status_code == 200
    body = res.json()
    assert [(s["payee"], s["category_name"]) for s in body] == [
        ("Carrefour", "Food"), ("CARREFOUR", "Fuel"), ("Carrefour Market", None),
    ]
    # The entry carries its most recent transaction.
    assert body[0]["date"] == "2026-09-05"
    assert body[0]["amount"] == -55
    assert body[0]["currency"] == sample_account.currency


def test_limit_and_wildcards_are_literal(client, db, sample_account):
    for day, payee in enumerate(["A 100% bio", "A 100 bio", "Ab_c", "Abxc"], start=1):
        _add(db, sample_account, payee, day)
    db.commit()

    assert [s["payee"] for s in client.get(
        "/api/transactions/payee-suggestions", params={"q": "100%"}).json()] == ["A 100% bio"]
    assert [s["payee"] for s in client.get(
        "/api/transactions/payee-suggestions", params={"q": "b_c"}).json()] == ["Ab_c"]
    assert len(client.get("/api/transactions/payee-suggestions", params={"q": "a", "limit": 2}).json()) == 2
    assert client.get("/api/transactions/payee-suggestions", params={"q": "  "}).json() == []
