"""Basic smoke tests for Email Service."""

from fastapi.testclient import TestClient


def test_health():
    import os
    os.environ.setdefault("ENABLE_RABBITMQ", "false")
    from app.main import app

    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] in ("ok", "degraded")
