"""MYF-14: a request that changes data must carry the client's own header."""
from fastapi.testclient import TestClient

from main import CSRF_HEADER, app


def _bare_client():
    return TestClient(app)


def test_write_without_header_is_refused(client):
    response = _bare_client().post("/api/users", json={"name": "Mallory"})
    assert response.status_code == 403
    assert CSRF_HEADER in response.json()["detail"]


def test_write_with_header_is_accepted(client):
    response = client.post("/api/users", json={"name": "Alice"})
    assert response.status_code == 201


def test_read_without_header_is_allowed(client):
    assert _bare_client().get("/api/users").status_code == 200


def test_backup_restore_without_header_is_refused(client):
    response = _bare_client().post(
        "/api/backup/import",
        params={"mode": "overwrite"},
        files={"file": ("backup.zip", b"x", "application/zip")},
    )
    assert response.status_code == 403


def test_backup_restore_requires_a_mode(client):
    response = client.post(
        "/api/backup/import",
        files={"file": ("backup.zip", b"x", "application/zip")},
    )
    assert response.status_code == 422


def test_scheduler_endpoints_are_exempt(client):
    # No secret configured in tests, so the route itself refuses, but not
    # with the CSRF guard's 403.
    for path in ("/api/bank-sync/run-due", "/api/onedrive/backup/run-due"):
        response = _bare_client().post(path)
        assert "detail" not in response.json() or CSRF_HEADER not in str(response.json()["detail"])


def test_preflight_from_unknown_origin_is_not_allowed(client):
    response = _bare_client().options(
        "/api/users",
        headers={
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": CSRF_HEADER,
        },
    )
    assert "access-control-allow-origin" not in response.headers
