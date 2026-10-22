import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch):
    """Every test gets its own database file."""
    path = tmp_path / "data" / "app.db"
    monkeypatch.setattr(db, "DB_PATH", path)
    return path


@pytest.fixture
def client():
    """Signed-in client; entering the context runs startup (db init and seed)."""
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        yield client
