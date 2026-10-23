import json
import os
import sqlite3
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
cardIds lists its cards from top to bottom. Card details are in "cards".

To change the board, add operations to "operations":
- create_card: add a card to the end of a column (column_id, title, details)
- update_card: change a card's title and/or details (card_id; null for a field you keep)
- move_card: move a card to a column at a 0-based position (card_id, column_id, position)
- delete_card: remove a card (card_id)
- rename_column: rename a column (column_id, title)
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

    type: Literal["create_card", "update_card", "move_card", "delete_card", "rename_column"]
    card_id: str | None
    column_id: str | None
    title: str | None
    details: str | None
    position: int | None


REQUIRED_FIELDS = {
    "create_card": ("column_id", "title"),
    "update_card": ("card_id",),
    "move_card": ("card_id", "column_id", "position"),
    "delete_card": ("card_id",),
    "rename_column": ("column_id", "title"),
}


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
    return [
        {"role": "system", "content": SYSTEM_PROMPT + json.dumps(board_data)},
        *history,
        {"role": "user", "content": message},
    ]


def apply_operations(conn: sqlite3.Connection, board_id: int, operations: list[Operation]) -> int:
    """Apply each operation; ones missing required fields or using unknown ids are skipped.

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
        try:
            match op.type:
                case "create_card":
                    board.create_card(conn, board_id, op.column_id, op.title, op.details or "")
                case "update_card":
                    board.update_card(conn, board_id, op.card_id, op.title, op.details)
                case "move_card":
                    board.move_card(conn, board_id, op.card_id, op.column_id, op.position)
                case "delete_card":
                    board.delete_card(conn, board_id, op.card_id)
                case "rename_column":
                    board.rename_column(conn, board_id, op.column_id, op.title)
        except board.NotFound:
            skipped += 1
    return skipped
