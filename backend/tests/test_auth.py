from fastapi.testclient import TestClient

from app.main import app


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def test_login_success_sets_http_only_cookie():
    client = TestClient(app)
    response = login(client)
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    assert "session" in client.cookies
    assert "httponly" in response.headers["set-cookie"].lower()


def test_login_wrong_password():
    client = TestClient(app)
    response = login(client, password="wrong")
    assert response.status_code == 401
    assert "session" not in client.cookies


def test_login_wrong_username():
    client = TestClient(app)
    assert login(client, username="admin").status_code == 401


def test_me_requires_login():
    client = TestClient(app)
    assert client.get("/api/me").status_code == 401


def test_me_after_login():
    client = TestClient(app)
    login(client)
    response = client.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"username": "user"}


def test_logout_clears_session():
    client = TestClient(app)
    login(client)
    assert client.post("/api/logout").status_code == 200
    assert client.get("/api/me").status_code == 401
