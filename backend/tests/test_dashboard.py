def test_dashboard_empty(client):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["accounts"] == []
    assert data["recent_transactions"] == []


def test_dashboard_with_data(client, sample_transaction):
    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert len(data["accounts"]) == 1
    assert len(data["recent_transactions"]) == 1


def test_dashboard_filtered_by_user(client, sample_account_with_user, sample_user, sample_category, db):
    from datetime import date
    from models import Transaction
    t = Transaction(
        date=date(2026, 2, 1),
        payee="User Specific",
        amount=200.0,
        account_id=sample_account_with_user.id,
        category_id=sample_category.id,
    )
    db.add(t)
    db.commit()

    response = client.get(f"/api/dashboard?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert len(data["accounts"]) == 1
    assert len(data["recent_transactions"]) == 1
    assert data["recent_transactions"][0]["payee"] == "User Specific"


def test_dashboard_filtered_by_user_no_match(client, sample_user):
    response = client.get(f"/api/dashboard?user_id={sample_user.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["accounts"] == []
    assert data["recent_transactions"] == []


def test_dashboard_visible_via_split_without_ownership(client, sample_account, sample_category, sample_user, sample_user2, db):
    from datetime import date
    from models import AccountUser, Transaction, TransactionSplit
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    t = Transaction(
        date=date(2026, 2, 1), payee="Shared Bill", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(t)
    db.flush()
    db.add(TransactionSplit(transaction_id=t.id, user_id=sample_user2.id, share_amount=40.0, source="manual"))
    db.commit()

    response = client.get(f"/api/dashboard?user_id={sample_user2.id}")
    assert response.status_code == 200
    data = response.json()
    assert data["accounts"] == []
    assert len(data["recent_transactions"]) == 1
    assert data["recent_transactions"][0]["payee"] == "Shared Bill"


def test_dashboard_balances_filtered_to_selected_user(client, sample_account, sample_category, sample_user, sample_user2, db):
    from datetime import date
    from models import AccountUser, Transaction, TransactionSplit
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    t = Transaction(
        date=date(2026, 2, 1), payee="Split Bill", amount=100.0,
        account_id=sample_account.id, category_id=sample_category.id,
    )
    db.add(t)
    db.flush()
    db.add_all([
        TransactionSplit(transaction_id=t.id, user_id=sample_user.id, share_amount=60.0, source="manual"),
        TransactionSplit(transaction_id=t.id, user_id=sample_user2.id, share_amount=40.0, source="manual"),
    ])
    db.commit()

    response = client.get(f"/api/dashboard?user_id={sample_user2.id}")
    assert response.status_code == 200
    balances = response.json()["balances"]
    assert len(balances) == 1
    assert balances[0]["user_id"] == sample_user2.id

    response_all = client.get("/api/dashboard")
    assert len(response_all.json()["balances"]) == 2


def test_dashboard_balances_reflect_new_transaction_after_cache_warm(client, sample_account, sample_category, sample_user, db):
    """Regression test for the balances cache: a GET that primes the cache
    with an empty/stale result must not keep serving it after a mutation."""
    from models import AccountUser
    db.add(AccountUser(account_id=sample_account.id, user_id=sample_user.id, ownership_percentage=100.0))
    db.commit()

    warm = client.get("/api/dashboard")
    assert warm.json()["balances"] == []

    response = client.post(
        "/api/transactions",
        json={
            "account_id": sample_account.id,
            "category_id": sample_category.id,
            "date": "2026-01-15",
            "payee": "Groceries",
            "amount": -100.0,
            "split_weights": [{"user_id": sample_user.id, "weight": 1}],
        },
    )
    assert response.status_code == 201

    after = client.get("/api/dashboard")
    balances = {b["user_id"]: b["net_position"] for b in after.json()["balances"]}
    assert balances[sample_user.id] == 0.0


def test_dashboard_excludes_archived_accounts(client, sample_transaction, db):
    from models import Account
    db.query(Account).filter(Account.id == sample_transaction.account_id).update({"archived": True})
    db.commit()

    response = client.get("/api/dashboard")
    assert response.status_code == 200
    data = response.json()
    assert data["accounts"] == []
    # Historical data on the archived account is unaffected.
    assert len(data["recent_transactions"]) == 1


def test_dashboard_reports_last_transaction_date_per_account(client, sample_account, sample_category, db):
    from datetime import date
    from models import Account, Transaction
    empty = Account(name="Empty", type="Savings", currency="EUR")
    db.add(empty)
    for d in (date(2026, 3, 1), date(2026, 9, 23), date(1970, 1, 1)):
        db.add(Transaction(date=d, payee="P", amount=1.0, account_id=sample_account.id, category_id=sample_category.id))
    db.commit()

    accounts = {a["name"]: a for a in client.get("/api/dashboard").json()["accounts"]}
    assert accounts[sample_account.name]["last_transaction_date"] == "2026-09-23"
    assert accounts["Empty"]["last_transaction_date"] is None


def test_dashboard_last_transaction_date_follows_new_transaction_after_cache_warm(client, sample_account, sample_category, sample_user):
    split = [{"user_id": sample_user.id, "weight": 1}]
    response = client.post("/api/transactions", json={
        "date": "2026-01-10", "payee": "Old", "amount": -5.0,
        "account_id": sample_account.id, "category_id": sample_category.id, "split_weights": split,
    })
    assert response.status_code == 201, response.text
    assert client.get("/api/dashboard").json()["accounts"][0]["last_transaction_date"] == "2026-01-10"

    response = client.post("/api/transactions", json={
        "date": "2026-02-20", "payee": "New", "amount": -5.0,
        "account_id": sample_account.id, "category_id": sample_category.id, "split_weights": split,
    })
    assert response.status_code == 201, response.text
    assert client.get("/api/dashboard").json()["accounts"][0]["last_transaction_date"] == "2026-02-20"
