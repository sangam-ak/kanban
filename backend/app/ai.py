import json
import os
import sqlite3
from datetime import date
from typing import Literal

from openai import ContentFilterFinishReasonError, LengthFinishReasonError, OpenAI
from pydantic import BaseModel

from app import board

MODEL = "openai/gpt-oss-120b"
# Without a cap, OpenRouter reserves the provider's full output limit (e.g. 65k tokens)
# against the account balance and rejects the request with 402 when it is low.
MAX_TOKENS = 4096

SYSTEM_PROMPT = """You are the assistant for a Kanban project management board.
You help the user understand and manage their board, and you can change it.

The current board is below as JSON. Columns are listed in order; each column's
cardIds lists its cards from top to bottom. Card details are in "cards": each card
has a title, details, priority ("low", "medium", "high" or null), dueDate (ISO date
"YYYY-MM-DD" or null) and labels (a list of short tags).

Today's date is {today}.

To change the board, add operations to "operations":
- create_card: add a card to the end of a column (column_id, title, details; optional
  priority, due_date, labels)
- update_card: change a card (card_id, plus any of title, details, priority, due_date,
  labels; null for a field you keep). labels replaces the card's whole label list.
- move_card: move a card to a column at a 0-based position (card_id, column_id, position)
- delete_card: remove a card (card_id)
- create_column: add a column at the right end of the board (title)
- rename_column: rename a column (column_id, title)
- move_column: move a column to a 0-based position (column_id, position)
- delete_column: remove a column; only works when it has no cards (column_id)
Set every field an operation does not use to null.

Rules:
- Only use ids that exist in the board JSON (like "col-1" or "card-3"). Never invent ids.
- Operations run in order. You cannot refer to a card created in the same response.
- If no change is needed, return an empty operations list.
- In "message", reply briefly to the user and summarise any changes you made.

Board:
"""


class Operation(BaseModel):
    """One board change. Fields not used by the operation type are null.

    A single flat object is used instead of a union of per-type models: some OpenRouter
    providers decode unions ("anyOf") of objects incorrectly in structured outputs and
    return operations that contradict the reply (e.g. delete_card when adding a card).
    """

    type: Literal[
        "create_card",
        "update_card",
        "move_card",
        "delete_card",
        "create_column",
        "rename_column",
        "move_column",
        "delete_column",
    ]
    card_id: str | None
    column_id: str | None
    title: str | None
    details: str | None
    position: int | None
    priority: Literal["low", "medium", "high"] | None
    due_date: str | None
    labels: list[str] | None


REQUIRED_FIELDS = {
    "create_card": ("column_id", "title"),
    "update_card": ("card_id",),
    "move_card": ("card_id", "column_id", "position"),
    "delete_card": ("card_id",),
    "create_column": ("title",),
    "rename_column": ("column_id", "title"),
    "move_column": ("column_id", "position"),
    "delete_column": ("column_id",),
}

# Optional card fields an operation may set; null means "leave unchanged".
CARD_EXTRAS = ("priority", "due_date", "labels")


class ChatResponse(BaseModel):
    message: str
    operations: list[Operation]


def client() -> OpenAI:
    return OpenAI(base_url="https://openrouter.ai/api/v1", api_key=os.environ["OPENROUTER_API_KEY"])


def ask(prompt: str) -> str:
    response = client().chat.completions.create(
        model=MODEL, messages=[{"role": "user", "content": prompt}], max_tokens=MAX_TOKENS
    )
    return response.choices[0].message.content


def chat(messages: list[dict]) -> ChatResponse | None:
    """Returns None when the model gives no usable reply (a refusal, or output cut off at
    MAX_TOKENS, which also counts the model's reasoning tokens)."""
    try:
        response = client().chat.completions.parse(
            model=MODEL,
            messages=messages,
            response_format=ChatResponse,
            max_tokens=MAX_TOKENS,
            # Only route to providers that support structured outputs.
            extra_body={"provider": {"require_parameters": True}},
        )
    except (LengthFinishReasonError, ContentFilterFinishReasonError):
        return None
    return response.choices[0].message.parsed


def build_messages(board_data: dict, history: list[dict], message: str) -> list[dict]:
    system = SYSTEM_PROMPT.replace("{today}", date.today().isoformat())
    return [
        {"role": "system", "content": system + json.dumps(board_data)},
        *history,
        {"role": "user", "content": message},
    ]


def apply_operations(conn: sqlite3.Connection, board_id: int, operations: list[Operation]) -> int:
    """Apply each operation; ones missing required fields, using unknown ids, deleting a
    column that has cards or giving invalid field values are skipped.

    Returns the number of skipped operations.
    """
    skipped = 0
    for op in operations:
        # A blank title counts as missing, as in the REST API.
        if op.title is not None:
            op.title = op.title.strip() or None
        if any(getattr(op, field) is None for field in REQUIRED_FIELDS[op.type]):
            skipped += 1
            continue
        extras = {name: getattr(op, name) for name in CARD_EXTRAS if getattr(op, name) is not None}
        try:
            match op.type:
                case "create_card":
                    board.create_card(
                        conn, board_id, op.column_id, op.title, op.details or "", **extras
                    )
                case "update_card":
                    changes = {"title": op.title, "details": op.details}
                    changes = {k: v for k, v in changes.items() if v is not None} | extras
                    board.update_card(conn, board_id, op.card_id, **changes)
                case "move_card":
                    board.move_card(conn, board_id, op.card_id, op.column_id, op.position)
                case "delete_card":
                    board.delete_card(conn, board_id, op.card_id)
                case "create_column":
                    board.create_column(conn, board_id, op.title)
                case "rename_column":
                    board.rename_column(conn, board_id, op.column_id, op.title)
                case "move_column":
                    board.move_column(conn, board_id, op.column_id, op.position)
                case "delete_column":
                    board.delete_column(conn, board_id, op.column_id)
        except (board.NotFound, board.NotEmpty, ValueError):
            skipped += 1
    return skipped
