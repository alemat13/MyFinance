import export_openapi


def test_committed_openapi_schema_matches_the_app():
    """frontend/src/api/openapi.json drives the frontend's generated API types.

    If this fails, a schema or route changed: run `python export_openapi.py` in
    backend/, then `npm run gen:api` in frontend/, and commit both files.
    """
    assert export_openapi.OUTPUT.read_text(encoding="utf-8") == export_openapi.render()


def test_swagger_ui_and_schema_are_served_under_api(client):
    # /api is the only prefix production routes to the backend.
    assert client.get("/api/openapi.json").json()["info"]["title"] == "Personal Finance Manager API"
    assert "swagger-ui" in client.get("/api/docs").text
