import json
import os

import pytest
from fastapi.testclient import TestClient

from app import ai
from app.ai import ChatResponse, Operation
from app.main import app


def op(type, **fields):
    """An operation with unused fields null, as the model returns them."""
    empty = dict(card_id=None, column_id=None, title=None, details=None, position=None)
    return Operation(type=type, **(empty | fields))


def column(board, title):
    return next(c for c in board["columns"] if c["title"] == title)


def card_titles(board, column_title):
    return [board["cards"][card_id]["title"] for card_id in column(board, column_title)["cardIds"]]


@pytest.fixture
def fake_model(monkeypatch):
    """Replace the model: returns `fake_model.response` and records the messages sent."""

    class Fake:
        response = ChatResponse(message="Done.", operations=[])
        calls: list[list[dict]] = []

    def chat(messages):
        Fake.calls.append(messages)
        return Fake.response

    monkeypatch.setattr(ai, "chat", chat)
    return Fake


def send(client, message="Hi", history=None):
    return client.post("/api/chat", json={"message": message, "history": history or []})


def test_chat_requires_login():
    with TestClient(app) as client:
        assert send(client).status_code == 401


def test_reply_only_leaves_board_unchanged(client, fake_model):
    before = client.get("/api/board").json()
    response = send(client)
    assert response.status_code == 200
    assert response.json() == {"message": "Done.", "board": before}


def test_messages_include_board_history_and_question(client, fake_model):
    board = client.get("/api/board").json()
    history = [
        {"role": "user", "content": "What is in Backlog?"},
        {"role": "assistant", "content": "Two cards."},
    ]
    send(client, "Move one to Done", history)

    messages = fake_model.calls[0]
    assert messages[0]["role"] == "system"
    assert messages[0]["content"].endswith(json.dumps(board))
    assert messages[1:3] == history
    assert messages[3] == {"role": "user", "content": "Move one to Done"}


def test_create_card(client, fake_model):
    fake_model.response = ChatResponse(
        message="Added.",
        operations=[op("create_card", column_id="col-1", title="AI card", details="From AI")],
    )
    board = send(client).json()["board"]
    assert card_titles(board, "Backlog")[-1] == "AI card"


def test_update_card_keeps_null_fields(client, fake_model):
    details = client.get("/api/board").json()["cards"]["card-1"]["details"]
    fake_model.response = ChatResponse(
        message="Renamed.",
        operations=[op("update_card", card_id="card-1", title="Renamed", details=None)],
    )
    card = send(client).json()["board"]["cards"]["card-1"]
    assert card == {"id": "card-1", "title": "Renamed", "details": details}


def test_move_card(client, fake_model):
    fake_model.response = ChatResponse(
        message="Moved.",
        operations=[op("move_card", card_id="card-1", column_id="col-5", position=0)],
    )
    board = send(client).json()["board"]
    assert card_titles(board, "Done")[0] == "Align roadmap themes"
    assert "Align roadmap themes" not in card_titles(board, "Backlog")


def test_delete_card(client, fake_model):
    fake_model.response = ChatResponse(
        message="Deleted.", operations=[op("delete_card", card_id="card-1")]
    )
    board = send(client).json()["board"]
    assert "card-1" not in board["cards"]


def test_rename_column(client, fake_model):
    fake_model.response = ChatResponse(
        message="Renamed.",
        operations=[op("rename_column", column_id="col-5", title="Shipped")],
    )
    board = send(client).json()["board"]
    assert board["columns"][4]["title"] == "Shipped"


def test_multiple_operations_apply_in_order(client, fake_model):
    fake_model.response = ChatResponse(
        message="Reorganised.",
        operations=[
            op("move_card", card_id="card-1", column_id="col-2", position=0),
            op("move_card", card_id="card-2", column_id="col-2", position=0),
            op("create_card", column_id="col-1", title="Fresh", details=""),
        ],
    )
    board = send(client).json()["board"]
    assert card_titles(board, "Discovery") == [
        "Gather customer signals", "Align roadmap themes", "Prototype analytics view",
    ]
    assert card_titles(board, "Backlog") == ["Fresh"]


def test_invalid_operations_are_skipped(client, fake_model):
    fake_model.response = ChatResponse(
        message="Tried.",
        operations=[
            op("delete_card", card_id="card-999"),
            op("move_card", card_id="card-1", column_id="col-999", position=0),
            op("rename_column", column_id="nonsense", title="X"),
            op("create_card", column_id="col-1", title="Still added", details=""),
        ],
    )
    response = send(client)
    assert response.status_code == 200
    board = response.json()["board"]
    assert card_titles(board, "Backlog") == [
        "Align roadmap themes", "Gather customer signals", "Still added",
    ]


def test_operations_missing_required_fields_are_skipped(client, fake_model):
    before = client.get("/api/board").json()
    fake_model.response = ChatResponse(
        message="Tried.",
        operations=[
            op("create_card", title="No column"),
            op("move_card", card_id="card-1", column_id="col-2"),
            op("delete_card"),
            op("rename_column", column_id="col-1"),
        ],
    )
    assert send(client).json()["board"] == before


def test_ai_changes_persist(client, fake_model):
    fake_model.response = ChatResponse(
        message="Deleted.", operations=[op("delete_card", card_id="card-1")]
    )
    send(client)
    assert "card-1" not in client.get("/api/board").json()["cards"]


def test_rejects_empty_message(client, fake_model):
    assert send(client, message="").status_code == 422


real_ai = pytest.mark.skipif(
    not os.environ.get("OPENROUTER_API_KEY"), reason="OPENROUTER_API_KEY not set"
)


@real_ai
def test_real_ai_creates_card(client):
    response = send(client, "Add a card called Test to the Backlog column.")
    assert response.status_code == 200
    assert response.json()["message"]
    assert "Test" in card_titles(response.json()["board"], "Backlog")


@real_ai
def test_real_ai_moves_card(client):
    response = send(client, "Move the card 'Align roadmap themes' to the Done column.")
    board = response.json()["board"]
    assert "Align roadmap themes" in card_titles(board, "Done")
    assert "Align roadmap themes" not in card_titles(board, "Backlog")


@real_ai
def test_real_ai_answers_without_changes(client):
    before = client.get("/api/board").json()
    response = send(client, "How many cards are in the Review column? Do not change anything.")
    assert "1" in response.json()["message"] or "one" in response.json()["message"].lower()
    assert response.json()["board"] == before
