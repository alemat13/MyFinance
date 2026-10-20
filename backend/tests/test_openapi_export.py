import export_openapi


def test_committed_openapi_schema_matches_the_app():
    """frontend/src/api/openapi.json drives the frontend's generated API types.

    If this fails, a schema or route changed: run `python export_openapi.py` in
    backend/, then `npm run gen:api` in frontend/, and commit both files.
    """
    assert export_openapi.OUTPUT.read_text(encoding="utf-8") == export_openapi.render()
