from models import SavedFilter

SIMPLE = {"mode": "simple", "filters": {"search": "carrefour", "reconciled": "false"}}
ADVANCED = {"mode": "advanced", "filters": {"match_mode": "any", "conditions": [
    {"field": "payee", "operator": "contains", "value": "sfr", "value2": ""}]}}


def test_create_list_rename_replace_delete(client):
    a = client.post("/api/saved-filters", json={"name": " Courses ", **SIMPLE})
    assert a.status_code == 201, a.text
    assert a.json()["name"] == "Courses"
    assert a.json()["filters"] == SIMPLE["filters"]
    b = client.post("/api/saved-filters", json={"name": "Téléphone", **ADVANCED}).json()
    assert [(f["name"], f["position"]) for f in client.get("/api/saved-filters").json()] == [
        ("Courses", 0), ("Téléphone", 1)]

    renamed = client.put(f"/api/saved-filters/{b['id']}", json={"name": "Phone"}).json()
    assert renamed["name"] == "Phone" and renamed["filters"] == ADVANCED["filters"]

    replaced = client.put(f"/api/saved-filters/{b['id']}", json=SIMPLE).json()
    assert (replaced["name"], replaced["mode"], replaced["filters"]) == ("Phone", "simple", SIMPLE["filters"])

    assert client.delete(f"/api/saved-filters/{a.json()['id']}").status_code == 204
    assert [f["name"] for f in client.get("/api/saved-filters").json()] == ["Phone"]
    assert client.delete(f"/api/saved-filters/{a.json()['id']}").status_code == 404


def test_refuses_a_blank_name_a_bad_mode_or_half_a_replacement(client):
    assert client.post("/api/saved-filters", json={"name": "  ", **SIMPLE}).status_code == 422
    assert client.post("/api/saved-filters", json={"name": "x", "mode": "other", "filters": {}}).status_code == 422
    saved = client.post("/api/saved-filters", json={"name": "x", **SIMPLE}).json()
    assert client.put(f"/api/saved-filters/{saved['id']}", json={"filters": {}}).status_code == 422


def test_reorder(client):
    ids = [client.post("/api/saved-filters", json={"name": n, **SIMPLE}).json()["id"] for n in "ABC"]
    response = client.put("/api/saved-filters/order", json={"filter_ids": [ids[2], ids[0], ids[1]]})
    assert response.status_code == 200, response.text
    assert [f["name"] for f in response.json()] == ["C", "A", "B"]
    assert client.put("/api/saved-filters/order", json={"filter_ids": ids[:2]}).status_code == 422


def test_saved_filters_round_trip_through_an_overwrite_restore(client, db):
    client.post("/api/saved-filters", json={"name": "Courses", **SIMPLE})
    archive = client.get("/api/backup/export").content
    db.query(SavedFilter).delete()
    db.commit()

    response = client.post("/api/backup/import", data={"mode": "overwrite"},
                           files={"file": ("backup.zip", archive, "application/zip")})
    assert response.status_code == 200, response.text
    assert response.json()["saved_filters"] == 1
    restored = client.get("/api/saved-filters").json()
    assert [(f["name"], f["filters"]) for f in restored] == [("Courses", SIMPLE["filters"])]
