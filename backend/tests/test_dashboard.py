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
