import pytest
from fastapi.testclient import TestClient

from app import db, users
from app.main import app


def board_positions():
    conn = db.connect()
    rows = conn.execute("SELECT user_id, position FROM boards ORDER BY user_id, position").fetchall()
    conn.close()
    by_user: dict[int, list[int]] = {}
    for row in rows:
        by_user.setdefault(row["user_id"], []).append(row["position"])
    return by_user


def create(client, name="Roadmap"):
    return client.post("/api/boards", json={"name": name})


def test_list_boards_has_demo_board(client):
    assert client.get("/api/boards").json() == [{"id": "board-1", "name": "My Board"}]


def test_create_board_has_empty_default_columns(client):
    response = create(client, "  Roadmap  ")
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Roadmap"
    board = client.get(f"/api/boards/{created['id']}").json()
    assert [c["title"] for c in board["columns"]] == [
        "Backlog", "Discovery", "In Progress", "Review", "Done",
    ]
    assert board["cards"] == {}
    assert [b["name"] for b in client.get("/api/boards").json()] == ["My Board", "Roadmap"]


def test_create_board_rejects_blank_name(client):
    assert create(client, "   ").status_code == 422


def test_rename_board(client):
    response = client.patch("/api/boards/board-1", json={"name": "Work"})
    assert response.json() == {"id": "board-1", "name": "Work"}
    assert client.get("/api/boards").json()[0]["name"] == "Work"


def test_delete_board_cascades_and_renumbers(client):
    roadmap = create(client).json()["id"]
    create(client, "Later")
    remaining = client.delete("/api/boards/board-1").json()
    assert [b["name"] for b in remaining] == ["Roadmap", "Later"]
    assert board_positions() == {1: [0, 1]}
    conn = db.connect()
    assert conn.execute("SELECT COUNT(*) FROM columns WHERE board_id = 1").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM cards").fetchone()[0] == 0
    conn.close()
    assert client.get(f"/api/boards/{roadmap}").status_code == 200


def test_can_delete_last_board_and_create_another(client):
    assert client.delete("/api/boards/board-1").json() == []
    new_id = create(client).json()["id"]
    assert client.get("/api/boards").json() == [{"id": new_id, "name": "Roadmap"}]
    assert board_positions() == {1: [0]}


def test_card_changes_stay_on_their_board(client):
    other = create(client).json()["id"]
    col_id = client.get(f"/api/boards/{other}").json()["columns"][0]["id"]
    client.post(f"/api/boards/{other}/cards", json={"column_id": col_id, "title": "Only here"})
    demo = client.get("/api/boards/board-1").json()
    assert "Only here" not in [c["title"] for c in demo["cards"].values()]
    # A column id from another board is not found on this one.
    response = client.post("/api/boards/board-1/cards", json={"column_id": col_id, "title": "X"})
    assert response.status_code == 404


BOARD_ROUTES = [
    ("GET", "", None),
    ("PATCH", "", {"name": "X"}),
    ("DELETE", "", None),
    ("PATCH", "/columns/col-1", {"title": "X"}),
    ("POST", "/cards", {"column_id": "col-1", "title": "X"}),
    ("PATCH", "/cards/card-1", {"title": "X"}),
    ("POST", "/cards/card-1/move", {"column_id": "col-2", "position": 0}),
    ("DELETE", "/cards/card-1", None),
    ("POST", "/chat", {"message": "Hi"}),
    ("GET", "/activity", None),
    ("POST", "/columns", {"title": "X"}),
    ("POST", "/columns/col-1/move", {"position": 1}),
    ("DELETE", "/columns/col-1", None),
]


@pytest.mark.parametrize("method, path, body", BOARD_ROUTES)
def test_other_users_board_is_not_found(client, method, path, body):
    conn = db.connect()
    with conn:
        users.create_user(conn, "other", "password1")
    conn.close()
    response = client.request(method, f"/api/boards/board-2{path}", json=body)
    assert response.status_code == 404
    assert len(client.get("/api/boards/board-1").json()["cards"]) == 8


@pytest.mark.parametrize("method, path, body", BOARD_ROUTES)
def test_board_routes_require_login(method, path, body):
    with TestClient(app) as anon:
        assert anon.request(method, f"/api/boards/board-1{path}", json=body).status_code == 401


@pytest.mark.parametrize("board_id", ["board-999", "1", "col-1", "board-x"])
def test_unknown_board_ids_return_404(client, board_id):
    assert client.get(f"/api/boards/{board_id}").status_code == 404


def test_list_and_create_require_login():
    with TestClient(app) as anon:
        assert anon.get("/api/boards").status_code == 401
        assert create(anon).status_code == 401
