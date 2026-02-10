"""Basic smoke tests for Symbol Subscription Service."""

from fastapi.testclient import TestClient


def test_health():
    import os
    os.environ.setdefault("MONGODB_URL", "mongodb://localhost:27017")
    # Note: health check will show degraded without real MongoDB
