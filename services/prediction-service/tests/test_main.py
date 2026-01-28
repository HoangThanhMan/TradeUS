"""
Tests for the main application.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def test_root_endpoint(client):
    """Test root endpoint returns service info."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "prediction-service"
    assert "version" in data


def test_health_endpoint(client):
    """Test health check endpoint."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"


def test_liveness_endpoint(client):
    """Test liveness endpoint."""
    response = client.get("/health/live")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "alive"


def test_buffer_status_endpoint(client):
    """Test buffer status endpoint."""
    response = client.get("/api/predictions/buffer-status")
    assert response.status_code == 200
    data = response.json()
    assert "model_loaded" in data
    assert "buffers" in data


def test_model_info_endpoint(client):
    """Test model info endpoint."""
    response = client.get("/api/predictions/model-info")
    assert response.status_code == 200
    data = response.json()
    assert "loaded" in data
    assert "window_size" in data
    assert "feature_cols" in data


def test_symbols_endpoint(client):
    """Test symbols endpoint."""
    response = client.get("/api/predictions/symbols")
    assert response.status_code == 200
    data = response.json()
    assert "symbols" in data
    assert "model_loaded" in data


def test_predict_without_data(client):
    """Test prediction endpoint without sufficient data."""
    response = client.get("/api/predictions/predict?symbol=BTCUSDT&interval=1h")
    # Should return 400 or 503 depending on model status
    assert response.status_code in [400, 503]
