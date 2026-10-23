import shutil

import pytest
from fastapi.testclient import TestClient

from app import db, users
from app.main import app


def init_seeded_db() -> None:
    db.init_db()
    conn = db.connect()
    with conn:
        users.ensure_demo_user(conn)
    conn.close()


@pytest.fixture(scope="session")
def template_db(tmp_path_factory):
    """A migrated and seeded database, built once and copied into each test (much faster
    than migrating per test)."""
    path = tmp_path_factory.mktemp("template") / "app.db"
    with pytest.MonkeyPatch.context() as patch:
        patch.setattr(db, "DB_PATH", path)
        patch.setattr(users, "SCRYPT_N", 2**4)
        init_seeded_db()
    return path


@pytest.fixture(autouse=True)
def temp_db(tmp_path, monkeypatch, template_db):
    """Every test gets its own copy of the seeded database."""
    path = tmp_path / "data" / "app.db"
    path.parent.mkdir()
    shutil.copy(template_db, path)
    monkeypatch.setattr(db, "DB_PATH", path)
    monkeypatch.setattr(users, "SCRYPT_N", 2**4)
    return path


@pytest.fixture
def client():
    """Signed-in client; entering the context runs startup (db init and seed)."""
    with TestClient(app) as client:
        client.post("/api/login", json={"username": "user", "password": "password"})
        yield client
