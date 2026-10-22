"""Board operations, scoped to one board. Used by the API routes and the AI."""

import sqlite3


class NotFound(Exception):
    pass


def parse_id(value: str, prefix: str) -> int:
    """Convert an API id like 'card-5' to the database id 5."""
    head, _, number = value.partition("-")
    if head != prefix or not number.isdigit():
        raise NotFound(value)
    return int(number)


def get_board_id(conn: sqlite3.Connection, username: str) -> int:
    row = conn.execute(
        "SELECT boards.id FROM boards JOIN users ON users.id = boards.user_id WHERE users.username = ?",
        (username,),
    ).fetchone()
    if not row:
        raise NotFound(username)
    return row["id"]


def get_board(conn: sqlite3.Connection, board_id: int) -> dict:
    columns = conn.execute(
        "SELECT id, title FROM columns WHERE board_id = ? ORDER BY position", (board_id,)
    ).fetchall()
    cards = conn.execute(
        "SELECT cards.id, cards.column_id, cards.title, cards.details FROM cards"
        " JOIN columns ON columns.id = cards.column_id"
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


def _card(conn: sqlite3.Connection, board_id: int, card_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT cards.id, cards.column_id FROM cards JOIN columns ON columns.id = cards.column_id"
        " WHERE cards.id = ? AND columns.board_id = ?",
        (parse_id(card_id, "card"), board_id),
    ).fetchone()
    if not row:
        raise NotFound(card_id)
    return row


def _card_ids_in_column(conn: sqlite3.Connection, column: int) -> list[int]:
    rows = conn.execute(
        "SELECT id FROM cards WHERE column_id = ? ORDER BY position", (column,)
    ).fetchall()
    return [row["id"] for row in rows]


def _renumber(conn: sqlite3.Connection, card_ids: list[int]) -> None:
    conn.executemany(
        "UPDATE cards SET position = ? WHERE id = ?",
        [(position, card_id) for position, card_id in enumerate(card_ids)],
    )


def rename_column(conn: sqlite3.Connection, board_id: int, column_id: str, title: str) -> None:
    column = _column_id(conn, board_id, column_id)
    conn.execute("UPDATE columns SET title = ? WHERE id = ?", (title, column))


def create_card(
    conn: sqlite3.Connection, board_id: int, column_id: str, title: str, details: str
) -> str:
    column = _column_id(conn, board_id, column_id)
    position = len(_card_ids_in_column(conn, column))
    card = conn.execute(
        "INSERT INTO cards (column_id, title, details, position) VALUES (?, ?, ?, ?)",
        (column, title, details, position),
    ).lastrowid
    return f"card-{card}"


def update_card(
    conn: sqlite3.Connection,
    board_id: int,
    card_id: str,
    title: str | None = None,
    details: str | None = None,
) -> None:
    card = _card(conn, board_id, card_id)
    if title is not None:
        conn.execute("UPDATE cards SET title = ? WHERE id = ?", (title, card["id"]))
    if details is not None:
        conn.execute("UPDATE cards SET details = ? WHERE id = ?", (details, card["id"]))


def move_card(
    conn: sqlite3.Connection, board_id: int, card_id: str, column_id: str, position: int
) -> None:
    """Move a card to a 0-based position in a column (clamped to the column's bounds)."""
    card = _card(conn, board_id, card_id)
    target = _column_id(conn, board_id, column_id)
    target_ids = [i for i in _card_ids_in_column(conn, target) if i != card["id"]]
    target_ids.insert(max(0, min(position, len(target_ids))), card["id"])
    conn.execute("UPDATE cards SET column_id = ? WHERE id = ?", (target, card["id"]))
    _renumber(conn, target_ids)
    if card["column_id"] != target:
        _renumber(conn, _card_ids_in_column(conn, card["column_id"]))


def delete_card(conn: sqlite3.Connection, board_id: int, card_id: str) -> None:
    card = _card(conn, board_id, card_id)
    conn.execute("DELETE FROM cards WHERE id = ?", (card["id"],))
    _renumber(conn, _card_ids_in_column(conn, card["column_id"]))
