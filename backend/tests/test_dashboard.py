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
