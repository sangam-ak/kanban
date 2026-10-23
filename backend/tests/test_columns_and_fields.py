import pytest

from app import board, db

B = "/api/boards/board-1"


def titles(board):
    return [c["title"] for c in board["columns"]]


def column_positions():
    conn = db.connect()
    rows = conn.execute("SELECT position FROM columns WHERE board_id = 1 ORDER BY position")
    positions = [row[0] for row in rows]
    conn.close()
    return positions


def empty_column(client, title="Empty"):
    return client.post(f"{B}/columns", json={"title": title}).json()["columns"][-1]["id"]


# Columns


def test_create_column_appends(client):
    response = client.post(f"{B}/columns", json={"title": "  Blocked  "})
    assert response.status_code == 201
    board = response.json()
    assert titles(board)[-1] == "Blocked"
    assert board["columns"][-1]["cardIds"] == []
    assert column_positions() == list(range(6))


def test_create_column_rejects_blank_title(client):
    assert client.post(f"{B}/columns", json={"title": " "}).status_code == 422


@pytest.mark.parametrize(
    "position, expected",
    [
        (0, ["Done", "Backlog", "Discovery", "In Progress", "Review"]),
        (2, ["Backlog", "Discovery", "Done", "In Progress", "Review"]),
        (99, ["Backlog", "Discovery", "In Progress", "Review", "Done"]),
        (-5, ["Done", "Backlog", "Discovery", "In Progress", "Review"]),
    ],
)
def test_move_column(client, position, expected):
    board = client.post(f"{B}/columns/col-5/move", json={"position": position}).json()
    assert titles(board) == expected
    assert column_positions() == list(range(5))


def test_move_column_keeps_its_cards(client):
    board = client.post(f"{B}/columns/col-1/move", json={"position": 4}).json()
    assert board["columns"][4]["id"] == "col-1"
    assert board["columns"][4]["cardIds"] == ["card-1", "card-2"]


def test_delete_empty_column(client):
    column_id = empty_column(client)
    board = client.delete(f"{B}/columns/{column_id}").json()
    assert column_id not in [c["id"] for c in board["columns"]]
    assert column_positions() == list(range(5))


def test_delete_middle_column_renumbers(client):
    client.delete(f"{B}/cards/card-3")
    board = client.delete(f"{B}/columns/col-2").json()
    assert titles(board) == ["Backlog", "In Progress", "Review", "Done"]
    assert column_positions() == list(range(4))


def test_delete_column_with_cards_is_rejected(client):
    response = client.delete(f"{B}/columns/col-1")
    assert response.status_code == 409
    assert len(client.get(B).json()["columns"]) == 5


@pytest.mark.parametrize(
    "method, path, body",
    [
        ("POST", "/columns/col-999/move", {"position": 0}),
        ("DELETE", "/columns/col-999", None),
        ("DELETE", "/columns/card-1", None),
    ],
)
def test_unknown_column_returns_404(client, method, path, body):
    assert client.request(method, f"{B}{path}", json=body).status_code == 404


# Card fields


def test_new_card_has_empty_fields_by_default(client):
    board = client.post(f"{B}/cards", json={"column_id": "col-1", "title": "Plain"}).json()
    card = board["cards"][board["columns"][0]["cardIds"][-1]]
    assert card["priority"] is None
    assert card["dueDate"] is None
    assert card["labels"] == []


def test_create_card_with_fields(client):
    body = {
        "column_id": "col-1",
        "title": "Rich",
        "priority": "high",
        "due_date": "2026-11-05",
        "labels": [" design ", "ux", "ux"],
    }
    board = client.post(f"{B}/cards", json=body).json()
    card = board["cards"][board["columns"][0]["cardIds"][-1]]
    assert card["priority"] == "high"
    assert card["dueDate"] == "2026-11-05"
    assert card["labels"] == ["design", "ux"]


def test_update_card_fields_and_keep_others(client):
    client.patch(f"{B}/cards/card-1", json={"priority": "low", "labels": ["a", "b"]})
    card = client.patch(f"{B}/cards/card-1", json={"due_date": "2026-12-01"}).json()["cards"][
        "card-1"
    ]
    assert card["priority"] == "low"
    assert card["labels"] == ["a", "b"]
    assert card["dueDate"] == "2026-12-01"
    assert card["title"] == "Align roadmap themes"


def test_update_card_clears_priority_and_due_date_with_null(client):
    client.patch(f"{B}/cards/card-1", json={"priority": "high", "due_date": "2026-12-01"})
    card = client.patch(f"{B}/cards/card-1", json={"priority": None, "due_date": None}).json()[
        "cards"
    ]["card-1"]
    assert card["priority"] is None
    assert card["dueDate"] is None


def test_update_card_null_title_is_ignored(client):
    card = client.patch(f"{B}/cards/card-1", json={"title": None, "labels": []}).json()["cards"][
        "card-1"
    ]
    assert card["title"] == "Align roadmap themes"
    assert card["labels"] == []


@pytest.mark.parametrize(
    "body",
    [
        {"priority": "urgent"},
        {"due_date": "2026-13-45"},
        {"due_date": "next week"},
        {"labels": [""]},
        {"labels": ["x" * 31]},
    ],
)
def test_invalid_card_fields_are_rejected(client, body):
    assert client.patch(f"{B}/cards/card-1", json=body).status_code == 422
    assert client.post(f"{B}/cards", json={"column_id": "col-1", "title": "X", **body}).status_code == 422


def test_commas_in_labels_are_replaced(client):
    card = client.patch(f"{B}/cards/card-1", json={"labels": ["a,b"]}).json()["cards"]["card-1"]
    assert card["labels"] == ["a b"]


@pytest.mark.parametrize("fields", [{"priority": "urgent"}, {"position": 3}])
def test_board_rejects_invalid_card_fields(fields):
    with pytest.raises(ValueError):
        board._card_values(fields)
