import pytest

from app import ai, board, db
from app.ai import ChatResponse
from tests.test_chat import op

B = "/api/boards/board-1"


def activity(client, url=B):
    return client.get(f"{url}/activity").json()


def latest(client, url=B):
    return activity(client, url)[0]


def test_seeded_board_starts_with_creation(client):
    entries = activity(client)
    assert [(e["action"], e["summary"]) for e in entries] == [
        ("board.create", 'Created board "My Board"')
    ]
    assert set(entries[0]) == {"id", "action", "summary", "createdAt"}


@pytest.mark.parametrize(
    "method, path, body, action, summary",
    [
        ("PATCH", "", {"name": "Work"}, "board.rename", 'Renamed board to "Work"'),
        ("POST", "/columns", {"title": "Blocked"}, "column.create", 'Added column "Blocked"'),
        (
            "PATCH", "/columns/col-1", {"title": "Ideas"},
            "column.rename", 'Renamed column "Backlog" to "Ideas"',
        ),
        (
            "POST", "/columns/col-5/move", {"position": 0},
            "column.move", 'Moved column "Done" to position 1',
        ),
        (
            "POST", "/cards", {"column_id": "col-2", "title": "New"},
            "card.create", 'Added card "New" to "Discovery"',
        ),
        ("PATCH", "/cards/card-1", {"priority": "high"}, "card.update", 'Updated card "Align roadmap themes"'),
        ("PATCH", "/cards/card-1", {"title": "Renamed"}, "card.update", 'Updated card "Renamed"'),
        (
            "POST", "/cards/card-1/move", {"column_id": "col-5", "position": 0},
            "card.move", 'Moved card "Align roadmap themes" to "Done"',
        ),
        (
            "POST", "/cards/card-1/move", {"column_id": "col-1", "position": 1},
            "card.move", 'Reordered card "Align roadmap themes" in "Backlog"',
        ),
        ("DELETE", "/cards/card-1", None, "card.delete", 'Deleted card "Align roadmap themes"'),
    ],
)
def test_each_change_is_logged_once(client, method, path, body, action, summary):
    client.request(method, f"{B}{path}", json=body)
    entries = activity(client)
    assert len(entries) == 2
    assert (entries[0]["action"], entries[0]["summary"]) == (action, summary)


def test_delete_column_is_logged(client):
    client.delete(f"{B}/cards/card-3")
    client.delete(f"{B}/columns/col-2")
    assert latest(client)["summary"] == 'Deleted column "Discovery"'


def test_failed_change_is_not_logged(client):
    assert client.delete(f"{B}/columns/col-1").status_code == 409
    assert client.patch(f"{B}/cards/card-1", json={"priority": "urgent"}).status_code == 422
    assert len(activity(client)) == 1


def test_update_without_fields_is_not_logged(client):
    client.patch(f"{B}/cards/card-1", json={})
    assert len(activity(client)) == 1


def test_ai_changes_are_logged(client, monkeypatch):
    response = ChatResponse(
        message="Done.",
        operations=[op("create_card", column_id="col-1", title="From AI", details="")],
    )
    monkeypatch.setattr(ai, "chat", lambda messages: response)
    client.post(f"{B}/chat", json={"message": "Add", "history": []})
    assert latest(client)["summary"] == 'Added card "From AI" to "Backlog"'


def test_activity_is_per_board_and_newest_first(client):
    other = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    client.patch(f"{B}/cards/card-1", json={"title": "First change"})
    client.patch(f"{B}/cards/card-2", json={"title": "Second change"})
    assert [e["summary"] for e in activity(client)][:2] == [
        'Updated card "Second change"',
        'Updated card "First change"',
    ]
    assert [e["summary"] for e in activity(client, f"/api/boards/{other}")] == [
        'Created board "Second"'
    ]


def test_activity_is_limited_and_deleted_with_the_board():
    conn = db.connect()
    with conn:
        for i in range(60):
            board.rename_board(conn, 1, f"Name {i}")
    entries = board.get_activity(conn, 1)
    assert len(entries) == 50
    assert entries[0]["summary"] == 'Renamed board to "Name 59"'
    with conn:
        board.delete_board(conn, 1, 1)
    assert conn.execute("SELECT COUNT(*) FROM activity").fetchone()[0] == 0
    conn.close()
