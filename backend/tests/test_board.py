import pytest
from fastapi.testclient import TestClient

from app import db
from app.main import app


def column(board, title):
    return next(c for c in board["columns"] if c["title"] == title)


def card_titles(board, column_title):
    return [board["cards"][card_id]["title"] for card_id in column(board, column_title)["cardIds"]]


def assert_positions_contiguous():
    conn = db.connect()
    for (column_id,) in conn.execute("SELECT id FROM columns").fetchall():
        positions = [
            row[0]
            for row in conn.execute(
                "SELECT position FROM cards WHERE column_id = ? ORDER BY position", (column_id,)
            )
        ]
        assert positions == list(range(len(positions)))
    conn.close()


@pytest.mark.parametrize(
    "method, url, body",
    [
        ("GET", "/api/board", None),
        ("PATCH", "/api/columns/col-1", {"title": "X"}),
        ("POST", "/api/cards", {"column_id": "col-1", "title": "X"}),
        ("PATCH", "/api/cards/card-1", {"title": "X"}),
        ("POST", "/api/cards/card-1/move", {"column_id": "col-2", "position": 0}),
        ("DELETE", "/api/cards/card-1", None),
    ],
)
def test_routes_require_login(method, url, body):
    with TestClient(app) as client:
        assert client.request(method, url, json=body).status_code == 401


def test_get_board(client):
    board = client.get("/api/board").json()
    assert [c["title"] for c in board["columns"]] == [
        "Backlog", "Discovery", "In Progress", "Review", "Done",
    ]
    assert len(board["cards"]) == 8
    assert all(c["id"].startswith("col-") for c in board["columns"])
    assert all(card_id.startswith("card-") for card_id in board["cards"])
    assert card_titles(board, "Backlog") == ["Align roadmap themes", "Gather customer signals"]


def test_rename_column(client):
    col_id = column(client.get("/api/board").json(), "Done")["id"]
    response = client.patch(f"/api/columns/{col_id}", json={"title": "Shipped"})
    assert response.status_code == 200
    assert column(response.json(), "Shipped")["id"] == col_id


def test_rename_column_rejects_empty_title(client):
    assert client.patch("/api/columns/col-1", json={"title": ""}).status_code == 422


@pytest.mark.parametrize(
    "method, url, body",
    [
        ("patch", "/api/columns/col-1", {"title": "   "}),
        ("post", "/api/cards", {"column_id": "col-1", "title": "   "}),
        ("patch", "/api/cards/card-1", {"title": "   "}),
    ],
)
def test_rejects_blank_titles(client, method, url, body):
    assert client.request(method, url, json=body).status_code == 422


def test_titles_are_trimmed(client):
    board = client.patch("/api/columns/col-1", json={"title": "  Ideas  "}).json()
    assert board["columns"][0]["title"] == "Ideas"


def test_create_card_appends_to_column(client):
    col_id = column(client.get("/api/board").json(), "Backlog")["id"]
    response = client.post(
        "/api/cards", json={"column_id": col_id, "title": "New card", "details": "Notes"}
    )
    assert response.status_code == 201
    board = response.json()
    assert card_titles(board, "Backlog")[-1] == "New card"
    new_id = column(board, "Backlog")["cardIds"][-1]
    assert board["cards"][new_id]["details"] == "Notes"
    assert_positions_contiguous()


def test_update_card_title_and_details(client):
    card_id = column(client.get("/api/board").json(), "Backlog")["cardIds"][0]
    board = client.patch(f"/api/cards/{card_id}", json={"title": "T", "details": "D"}).json()
    assert board["cards"][card_id] == {"id": card_id, "title": "T", "details": "D"}


def test_update_card_title_only_keeps_details(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    details = board["cards"][card_id]["details"]
    board = client.patch(f"/api/cards/{card_id}", json={"title": "Only title"}).json()
    assert board["cards"][card_id]["details"] == details


def test_move_card_within_column(client):
    board = client.get("/api/board").json()
    backlog = column(board, "Backlog")
    first = backlog["cardIds"][0]
    board = client.post(
        f"/api/cards/{first}/move", json={"column_id": backlog["id"], "position": 1}
    ).json()
    assert card_titles(board, "Backlog") == ["Gather customer signals", "Align roadmap themes"]
    assert_positions_contiguous()


def test_move_card_to_other_column(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    review_id = column(board, "Review")["id"]
    board = client.post(
        f"/api/cards/{card_id}/move", json={"column_id": review_id, "position": 0}
    ).json()
    assert card_titles(board, "Review") == ["Align roadmap themes", "QA micro-interactions"]
    assert card_titles(board, "Backlog") == ["Gather customer signals"]
    assert_positions_contiguous()


def test_move_card_past_end_goes_to_end(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    done_id = column(board, "Done")["id"]
    board = client.post(
        f"/api/cards/{card_id}/move", json={"column_id": done_id, "position": 99}
    ).json()
    assert card_titles(board, "Done")[-1] == "Align roadmap themes"
    assert_positions_contiguous()


def test_move_card_to_empty_column(client):
    board = client.get("/api/board").json()
    discovery = column(board, "Discovery")
    client.delete(f"/api/cards/{discovery['cardIds'][0]}")
    card_id = column(board, "Backlog")["cardIds"][1]
    board = client.post(
        f"/api/cards/{card_id}/move", json={"column_id": discovery["id"], "position": 0}
    ).json()
    assert card_titles(board, "Discovery") == ["Gather customer signals"]
    assert_positions_contiguous()


def test_delete_card(client):
    board = client.get("/api/board").json()
    card_id = column(board, "Backlog")["cardIds"][0]
    board = client.delete(f"/api/cards/{card_id}").json()
    assert card_id not in board["cards"]
    assert card_titles(board, "Backlog") == ["Gather customer signals"]
    assert_positions_contiguous()


@pytest.mark.parametrize(
    "method, url, body",
    [
        ("PATCH", "/api/columns/col-999", {"title": "X"}),
        ("PATCH", "/api/columns/card-1", {"title": "X"}),
        ("POST", "/api/cards", {"column_id": "col-999", "title": "X"}),
        ("PATCH", "/api/cards/card-999", {"title": "X"}),
        ("PATCH", "/api/cards/col-1", {"title": "X"}),
        ("PATCH", "/api/cards/garbage", {"title": "X"}),
        ("POST", "/api/cards/card-999/move", {"column_id": "col-1", "position": 0}),
        ("POST", "/api/cards/card-1/move", {"column_id": "col-999", "position": 0}),
        ("DELETE", "/api/cards/card-999", None),
    ],
)
def test_unknown_ids_return_404(client, method, url, body):
    assert client.request(method, url, json=body).status_code == 404


def test_other_users_board_returns_404(client):
    conn = db.connect()
    with conn:
        db.create_user(conn, "other")
    other_card, other_column = conn.execute(
        "SELECT cards.id, cards.column_id FROM cards JOIN columns ON columns.id = cards.column_id"
        " JOIN boards ON boards.id = columns.board_id JOIN users ON users.id = boards.user_id"
        " WHERE users.username = 'other' LIMIT 1"
    ).fetchone()
    conn.close()

    assert client.patch(f"/api/cards/card-{other_card}", json={"title": "X"}).status_code == 404
    assert client.delete(f"/api/cards/card-{other_card}").status_code == 404
    assert client.patch(f"/api/columns/col-{other_column}", json={"title": "X"}).status_code == 404
    assert f"card-{other_card}" not in client.get("/api/board").json()["cards"]


def test_failed_move_does_not_change_board(client):
    before = client.get("/api/board").json()
    client.post("/api/cards/card-1/move", json={"column_id": "col-999", "position": 0})
    assert client.get("/api/board").json() == before


def test_changes_persist_across_restart(client):
    col_id = column(client.get("/api/board").json(), "Backlog")["id"]
    client.post("/api/cards", json={"column_id": col_id, "title": "Persisted"})

    with TestClient(app) as restarted:
        restarted.post("/api/login", json={"username": "user", "password": "password"})
        assert "Persisted" in card_titles(restarted.get("/api/board").json(), "Backlog")
