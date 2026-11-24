"""MYF-87: a category's colour is its parent's; subcategories inherit it."""

from models import Category


def _create(client, **body):
    response = client.post("/api/categories", json={"type": "Expense", **body})
    assert response.status_code == 201, response.text
    return response.json()


def test_subcategory_shows_parent_color_and_stores_none(client, db):
    parent = _create(client, name="Logement", color="#db2777")
    child = _create(client, name="Loyer", color="#16a34a", parent_id=parent["id"])
    assert child["color"] == "#db2777"
    assert db.get(Category, child["id"]).color is None

    listed = {c["id"]: c for c in client.get("/api/categories").json()}
    assert listed[child["id"]]["color"] == "#db2777"


def test_parent_color_change_reaches_children(client):
    parent = _create(client, name="Logement", color="#db2777")
    child = _create(client, name="Loyer", parent_id=parent["id"])
    client.put(f"/api/categories/{parent['id']}", json={"color": "#2563eb"})
    listed = {c["id"]: c for c in client.get("/api/categories").json()}
    assert listed[child["id"]]["color"] == "#2563eb"


def test_color_set_on_subcategory_is_ignored(client, db):
    parent = _create(client, name="Logement", color="#db2777")
    child = _create(client, name="Loyer", parent_id=parent["id"])
    response = client.put(f"/api/categories/{child['id']}", json={"color": "#16a34a"})
    assert response.status_code == 200
    assert response.json()["color"] == "#db2777"
    assert db.get(Category, child["id"]).color is None


def test_promoted_subcategory_keeps_the_color_it_showed(client):
    parent = _create(client, name="Logement", color="#db2777")
    child = _create(client, name="Loyer", parent_id=parent["id"])
    response = client.put(f"/api/categories/{child['id']}", json={"parent_id": None})
    assert response.status_code == 200
    assert response.json()["color"] == "#db2777"


def test_transaction_rows_carry_inherited_color(client, sample_transaction, db):
    parent = _create(client, name="Logement", color="#db2777")
    child = _create(client, name="Loyer", parent_id=parent["id"])
    # A stale colour left on a subcategory (from before MYF-87) is not shown.
    db.get(Category, child["id"]).color = "#16a34a"
    sample_transaction.category_id = child["id"]
    db.commit()

    one = client.get(f"/api/transactions/{sample_transaction.id}")
    assert one.json()["category_color"] == "#db2777"
    items = client.post("/api/transactions/search", json={"unpaginated": True}).json()["items"]
    assert [r["category_color"] for r in items] == ["#db2777"]
