"""Board operations, scoped to one board. Used by the API routes and the AI."""

import sqlite3
from datetime import date

from app import db

PRIORITIES = ("low", "medium", "high")
CARD_FIELDS = {"title", "details", "priority", "due_date", "labels"}


class NotFound(Exception):
    pass


class NotEmpty(Exception):
    """A column that still has cards cannot be deleted."""


def parse_id(value: str, prefix: str) -> int:
    """Convert an API id like 'card-5' to the database id 5."""
    head, _, number = value.partition("-")
    if head != prefix or not number.isdigit():
        raise NotFound(value)
    return int(number)


def _renumber(conn: sqlite3.Connection, table: str, ids: list[int]) -> None:
    """Set positions 0..n-1 in the given order."""
    conn.executemany(
        f"UPDATE {table} SET position = ? WHERE id = ?",
        [(position, row_id) for position, row_id in enumerate(ids)],
    )


def _ids(conn: sqlite3.Connection, query: str, param: int) -> list[int]:
    return [row[0] for row in conn.execute(query, (param,)).fetchall()]


def _log(conn: sqlite3.Connection, board_id: int, action: str, summary: str) -> None:
    """Record a board change in the activity log (same transaction as the change)."""
    conn.execute(
        "INSERT INTO activity (board_id, action, summary) VALUES (?, ?, ?)",
        (board_id, action, summary),
    )


def get_activity(conn: sqlite3.Connection, board_id: int, limit: int = 50) -> list[dict]:
    """The latest changes on a board, newest first."""
    rows = conn.execute(
        "SELECT id, action, summary, created_at FROM activity WHERE board_id = ?"
        " ORDER BY id DESC LIMIT ?",
        (board_id, limit),
    ).fetchall()
    return [
        {"id": row["id"], "action": row["action"], "summary": row["summary"], "createdAt": row["created_at"]}
        for row in rows
    ]


def owned_board_id(conn: sqlite3.Connection, user_id: int, board_id: str) -> int:
    """The database id of a board the user owns, from an API id like 'board-3'."""
    board = parse_id(board_id, "board")
    if not conn.execute(
        "SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board, user_id)
    ).fetchone():
        raise NotFound(board_id)
    return board


def list_boards(conn: sqlite3.Connection, user_id: int) -> list[dict]:
    rows = conn.execute(
        "SELECT id, name FROM boards WHERE user_id = ? ORDER BY position", (user_id,)
    ).fetchall()
    return [{"id": f"board-{row['id']}", "name": row["name"]} for row in rows]


def create_board(conn: sqlite3.Connection, user_id: int, name: str, seed: bool = False) -> int:
    """Append a board with the default columns; with `seed`, also the demo cards."""
    position = conn.execute(
        "SELECT COUNT(*) FROM boards WHERE user_id = ?", (user_id,)
    ).fetchone()[0]
    board = conn.execute(
        "INSERT INTO boards (user_id, name, position) VALUES (?, ?, ?)", (user_id, name, position)
    ).lastrowid
    for column_position, (title, cards) in enumerate(db.SEED_COLUMNS):
        column = conn.execute(
            "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
            (board, title, column_position),
        ).lastrowid
        if seed:
            conn.executemany(
                "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
                [(column, t, d, p) for p, (t, d) in enumerate(cards)],
            )
    _log(conn, board, "board.create", f'Created board "{name}"')
    return board


def rename_board(conn: sqlite3.Connection, board_id: int, name: str) -> None:
    conn.execute("UPDATE boards SET name = ? WHERE id = ?", (name, board_id))
    _log(conn, board_id, "board.rename", f'Renamed board to "{name}"')


def delete_board(conn: sqlite3.Connection, user_id: int, board_id: int) -> None:
    """Delete a board (its columns and cards cascade) and close the gap in positions."""
    conn.execute("DELETE FROM boards WHERE id = ?", (board_id,))
    _renumber(
        conn, "boards", _ids(conn, "SELECT id FROM boards WHERE user_id = ? ORDER BY position", user_id)
    )


def get_board(conn: sqlite3.Connection, board_id: int) -> dict:
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    cards = conn.execute(
        "SELECT cards.* FROM cards JOIN columns ON columns.id = cards.column_id"
        " WHERE columns.board_id = ? ORDER BY cards.position",
        (board_id,),
    ).fetchall()
    return {
        "columns": [
            {
                "id": f"col-{column['id']}",
                "title": column["title"],
                "cardIds": [f"card-{card['id']}" for card in cards if card["column_id"] == column["id"]],
            }
            for column in columns
        ],
        "cards": {
            f"card-{card['id']}": {
                "id": f"card-{card['id']}",
                "title": card["title"],
                "details": card["details"],
                "priority": card["priority"],
                "dueDate": card["due_date"],
                "labels": card["labels"].split(",") if card["labels"] else [],
            }
            for card in cards
        },
    }


def _column_id(conn: sqlite3.Connection, board_id: int, column_id: str) -> int:
    column = parse_id(column_id, "col")
    if not conn.execute(
        "SELECT 1 FROM columns WHERE id = ? AND board_id = ?", (column, board_id)
    ).fetchone():
        raise NotFound(column_id)
    return column


def _column_title(conn: sqlite3.Connection, column: int) -> str:
    return conn.execute("SELECT title FROM columns WHERE id = ?", (column,)).fetchone()[0]


def _column_ids(conn: sqlite3.Connection, board_id: int) -> list[int]:
    return _ids(conn, "SELECT id FROM columns WHERE board_id = ? ORDER BY position", board_id)


def _card(conn: sqlite3.Connection, board_id: int, card_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT cards.id, cards.column_id, cards.title FROM cards"
        " JOIN columns ON columns.id = cards.column_id"
        " WHERE cards.id = ? AND columns.board_id = ?",
        (parse_id(card_id, "card"), board_id),
    ).fetchone()
    if not row:
        raise NotFound(card_id)
    return row


def _card_ids_in_column(conn: sqlite3.Connection, column: int) -> list[int]:
    return _ids(conn, "SELECT id FROM cards WHERE column_id = ? ORDER BY position", column)


def create_column(conn: sqlite3.Connection, board_id: int, title: str) -> str:
    """Append a column to the board."""
    column = conn.execute(
        "INSERT INTO columns (board_id, title, position) VALUES (?, ?, ?)",
        (board_id, title, len(_column_ids(conn, board_id))),
    ).lastrowid
    _log(conn, board_id, "column.create", f'Added column "{title}"')
    return f"col-{column}"


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: str, title: str) -> None:
    column = _column_id(conn, board_id, column_id)
    old = _column_title(conn, column)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column))
    _log(conn, board_id, "column.rename", f'Renamed column "{old}" to "{title}"')


def move_column(conn: sqlite3.Connection, board_id: int, column_id: str, position: int) -> None:
    """Move a column to a 0-based position (clamped to the board's bounds)."""
    column = _column_id(conn, board_id, column_id)
    ids = [i for i in _column_ids(conn, board_id) if i != column]
    ids.insert(max(0, min(position, len(ids))), column)
    _renumber(conn, "columns", ids)
    _log(
        conn,
        board_id,
        "column.move",
        f'Moved column "{_column_title(conn, column)}" to position {ids.index(column) + 1}',
    )


def delete_column(conn: sqlite3.Connection, board_id: int, column_id: str) -> None:
    """Delete an empty column; raises NotEmpty if it still has cards."""
    column = _column_id(conn, board_id, column_id)
    if _card_ids_in_column(conn, column):
        raise NotEmpty(column_id)
    title = _column_title(conn, column)
    conn.execute("DELETE FROM columns WHERE id = ?", (column,))
    _renumber(conn, "columns", _column_ids(conn, board_id))
    _log(conn, board_id, "column.delete", f'Deleted column "{title}"')


def _card_values(fields: dict) -> dict:
    """Validate card fields and convert them to their database form.

    Accepts title, details, priority (low/medium/high or None), due_date (ISO date string
    or None) and labels (list of strings, stored comma-separated). Raises ValueError.
    """
    values = dict(fields)
    # Field names become SQL column names, so only known ones are allowed.
    if unknown := set(values) - CARD_FIELDS:
        raise ValueError(f"Unknown card fields {unknown}")
    if values.get("priority") not in (None, *PRIORITIES):
        raise ValueError(f"Unknown priority {values['priority']!r}")
    if values.get("due_date") is not None:
        values["due_date"] = date.fromisoformat(str(values["due_date"])).isoformat()
    if "labels" in values:
        labels = [label.replace(",", " ").strip() for label in values["labels"]]
        values["labels"] = ",".join(dict.fromkeys(label for label in labels if label))
    return values


def create_card(
    conn: sqlite3.Connection,
    board_id: int,
    column_id: str,
    title: str,
    details: str = "",
    **fields,
) -> str:
    """Append a card to a column. `fields` may set priority, due_date and labels."""
    column = _column_id(conn, board_id, column_id)
    values = _card_values({"title": title, "details": details, **fields})
    values |= {"column_id": column, "position": len(_card_ids_in_column(conn, column))}
    card = conn.execute(
        f"INSERT INTO cards ({', '.join(values)}) VALUES ({', '.join('?' * len(values))})",
        tuple(values.values()),
    ).lastrowid
    _log(conn, board_id, "card.create", f'Added card "{title}" to "{_column_title(conn, column)}"')
    return f"card-{card}"


def update_card(conn: sqlite3.Connection, board_id: int, card_id: str, **fields) -> None:
    """Change the given fields of a card (see `_card_values`); others are kept."""
    card = _card(conn, board_id, card_id)
    values = _card_values(fields)
    if values:
        conn.execute(
            f"UPDATE cards SET {', '.join(f'{name} = ?' for name in values)} WHERE id = ?",
            (*values.values(), card["id"]),
        )
        _log(conn, board_id, "card.update", f'Updated card "{values.get("title", card["title"])}"')


def move_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int
) -> None:
    """Move a card to a 0-based position in a column (clamped to the column's bounds)."""
    card = _card(conn, board_id, card_id)
    target = _column_id(conn, board_id, column_id)
    target_ids = [i for i in _card_ids_in_column(conn, target) if i != card["id"]]
    target_ids.insert(max(0, min(position, len(target_ids))), card["id"])
    conn.execute("UPDATE cards SET column_id = ? WHERE id = ?", (target, card["id"]))
    _renumber(conn, "cards", target_ids)
    if card["column_id"] != target:
        _renumber(conn, "cards", _card_ids_in_column(conn, card["column_id"]))
        summary = f'Moved card "{card["title"]}" to "{_column_title(conn, target)}"'
    else:
        summary = f'Reordered card "{card["title"]}" in "{_column_title(conn, target)}"'
    _log(conn, board_id, "card.move", summary)


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> None:
    card = _card(conn, board_id, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card["id"],))
    _renumber(conn, "cards", _card_ids_in_column(conn, card["column_id"]))
    _log(conn, board_id, "card.delete", f'Deleted card "{card["title"]}"')
