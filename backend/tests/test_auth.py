import pytest
from fastapi.testclient import TestClient

from app import users
from app.main import app


@pytest.fixture
def anon():
    """Client with the database initialised but nobody signed in."""
    with TestClient(app) as client:
        yield client


def login(client, username="user", password="password"):
    return client.post("/api/login", json={"username": username, "password": password})


def board_url(client):
    """URL of the signed-in user's first board."""
    return f"/api/boards/{client.get('/api/boards').json()[0]['id']}"


def register(client, username="alice", password="secret123"):
    return client.post("/api/register", json={"username": username, "password": password})


def test_hash_round_trip_and_unique_salts():
    first = users.hash_password("secret123")
    assert users.verify_password("secret123", first)
    assert not users.verify_password("wrong", first)
    assert first != users.hash_password("secret123")


def test_verify_rejects_empty_hash():
    assert not users.verify_password("anything", "")


def test_login_success_sets_http_only_cookie(anon):
    response = login(anon)
    assert response.status_code == 200
    assert response.json()["username"] == "user"
    assert "session" in anon.cookies
    assert "httponly" in response.headers["set-cookie"].lower()


def test_login_wrong_password(anon):
    response = login(anon, password="wrong")
    assert response.status_code == 401
    assert "session" not in anon.cookies


def test_login_wrong_username(anon):
    assert login(anon, username="admin").status_code == 401


def test_me_requires_login(anon):
    assert anon.get("/api/me").status_code == 401


def test_me_after_login(anon):
    login(anon)
    response = anon.get("/api/me")
    assert response.status_code == 200
    assert response.json() == {"id": 1, "username": "user"}


def test_logout_clears_session(anon):
    login(anon)
    assert anon.post("/api/logout").status_code == 200
    assert anon.get("/api/me").status_code == 401


def test_register_signs_in_with_seeded_board(anon):
    response = register(anon)
    assert response.status_code == 201
    assert response.json()["username"] == "alice"
    assert anon.get("/api/me").json()["username"] == "alice"
    assert len(anon.get(board_url(anon)).json()["cards"]) == 8


def test_registered_user_can_log_in_again(anon):
    register(anon)
    anon.post("/api/logout")
    assert login(anon, "alice", "secret123").status_code == 200
    assert login(anon, "alice", "wrong-pass").status_code == 401


def test_register_duplicate_username(anon):
    register(anon)
    assert register(anon).status_code == 409
    assert register(anon, username="user").status_code == 409


@pytest.mark.parametrize(
    "username, password",
    [("ab", "secret123"), ("a" * 33, "secret123"), ("bad name", "secret123"), ("alice", "short")],
)
def test_register_validation(anon, username, password):
    assert register(anon, username, password).status_code == 422


def test_users_see_only_their_own_board(anon):
    register(anon)
    alice_board = board_url(anon)
    card_id = next(iter(anon.get(alice_board).json()["cards"]))
    anon.patch(f"{alice_board}/cards/{card_id}", json={"title": "Alice only"})
    anon.post("/api/logout")
    login(anon)
    titles = [c["title"] for c in anon.get(board_url(anon)).json()["cards"].values()]
    assert "Alice only" not in titles
    assert anon.get(alice_board).status_code == 404
    assert anon.patch(f"{alice_board}/cards/{card_id}", json={"title": "X"}).status_code == 404


def test_change_password(anon):
    register(anon)
    body = {"current_password": "secret123", "new_password": "newsecret1"}
    assert anon.post("/api/account/password", json=body).status_code == 200
    anon.post("/api/logout")
    assert login(anon, "alice", "secret123").status_code == 401
    assert login(anon, "alice", "newsecret1").status_code == 200


def test_change_password_wrong_current(anon):
    register(anon)
    body = {"current_password": "wrong", "new_password": "newsecret1"}
    assert anon.post("/api/account/password", json=body).status_code == 400


def test_change_password_too_short(anon):
    register(anon)
    body = {"current_password": "secret123", "new_password": "short"}
    assert anon.post("/api/account/password", json=body).status_code == 422


def test_delete_account(anon):
    register(anon)
    response = anon.request("DELETE", "/api/account", json={"password": "secret123"})
    assert response.status_code == 200
    assert anon.get("/api/me").status_code == 401
    assert login(anon, "alice", "secret123").status_code == 401
    assert register(anon).status_code == 201


def test_delete_account_wrong_password(anon):
    register(anon)
    response = anon.request("DELETE", "/api/account", json={"password": "wrong"})
    assert response.status_code == 400
    assert anon.get("/api/me").status_code == 200


def test_session_of_deleted_user_is_rejected(anon):
    register(anon)
    other = TestClient(app)
    login(other, "alice", "secret123")
    anon.request("DELETE", "/api/account", json={"password": "secret123"})
    assert other.get("/api/me").status_code == 401


@pytest.mark.parametrize(
    "method, url, body",
    [
        ("POST", "/api/account/password", {"current_password": "x", "new_password": "newsecret1"}),
        ("DELETE", "/api/account", {"password": "x"}),
    ],
)
def test_account_routes_require_login(anon, method, url, body):
    assert anon.request(method, url, json=body).status_code == 401
