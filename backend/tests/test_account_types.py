from models import AccountTypeOrder


def _account(client, name, type_):
    response = client.post("/api/accounts", json={"name": name, "type": type_})
    assert response.status_code == 201, response.text
    return response.json()


def test_no_order_by_default(client):
    _account(client, "CCF", "Checking")
    assert client.get("/api/account-types/order").json() == []
    assert client.get("/api/accounts").json()[0]["type_position"] is None


def test_set_order_normalises_and_reaches_every_account_list(client, sample_user):
    _account(client, "CCF", "Checking")
    _account(client, "Livret A", "Savings ")
    _account(client, "PEA", "investment")

    response = client.put(
        "/api/account-types/order",
        json={"types": ["Savings", " INVESTMENT", "savings", "", "Checking"]},
    )
    assert response.status_code == 200, response.text
    assert response.json() == ["savings", "investment", "checking"]

    positions = {a["name"]: a["type_position"] for a in client.get("/api/accounts").json()}
    assert positions == {"CCF": 2, "Livret A": 0, "PEA": 1}
    dashboard = client.get("/api/dashboard").json()["accounts"]
    assert {a["name"]: a["type_position"] for a in dashboard} == positions

    # A type left out of a new order goes back to the unplaced tail.
    client.put("/api/account-types/order", json={"types": ["Checking"]})
    positions = {a["name"]: a["type_position"] for a in client.get("/api/accounts").json()}
    assert positions == {"CCF": 0, "Livret A": None, "PEA": None}


def test_created_and_updated_accounts_carry_their_type_position(client):
    client.put("/api/account-types/order", json={"types": ["Savings", "Checking"]})
    created = _account(client, "CCF", "checking")
    assert created["type_position"] == 1
    updated = client.put(f"/api/accounts/{created['id']}", json={"type": "Savings"}).json()
    assert updated["type_position"] == 0


def test_order_round_trips_through_an_overwrite_restore(client, db):
    client.put("/api/account-types/order", json={"types": ["Savings", "Checking"]})
    archive = client.get("/api/backup/export").content
    db.query(AccountTypeOrder).delete()
    db.commit()

    response = client.post(
        "/api/backup/import",
        params={"mode": "overwrite"},
        files={"file": ("backup.zip", archive, "application/zip")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["account_type_order"] == 2
    assert client.get("/api/account-types/order").json() == ["savings", "checking"]
