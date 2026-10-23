import sqlite3

import pytest

from app import board, db, users
from tests.conftest import init_seeded_db as init


def count(table):
    conn = db.connect()
    result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return result


@pytest.fixture(autouse=True)
def no_db(temp_db):
    """These tests start without a database file."""
    temp_db.unlink()


def test_init_creates_db_file_and_tables(temp_db):
    assert not temp_db.exists()
    db.init_db()
    assert temp_db.exists()
    conn = db.connect()
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    version = conn.execute("PRAGMA user_version").fetchone()[0]
    conn.close()
    assert {"users", "boards", "columns", "cards"} <= tables
    assert version == len(db.MIGRATIONS)


def test_seed_creates_demo_board():
    init()
    assert count("users") == 1
    assert count("boards") == 1
    assert count("columns") == 5
    assert count("cards") == 8


def test_seed_runs_only_once():
    init()
    init()
    assert count("users") == 1
    assert count("cards") == 8


def test_foreign_keys_cascade_on_user_delete():
    init()
    conn = db.connect()
    with conn:
        conn.execute("DELETE FROM users")
    conn.close()
    assert count("boards") == 0
    assert count("columns") == 0
    assert count("cards") == 0


def test_migrates_phase_1_database(temp_db):
    """A database created before migrations keeps its data and the demo user gets a password."""
    conn = sqlite3.connect(temp_db)
    conn.executescript(db.SCHEMA)
    conn.execute("INSERT INTO users (username) VALUES ('user')")
    conn.execute("INSERT INTO boards (user_id) VALUES (1)")
    conn.execute("INSERT INTO columns (board_id, title, position) VALUES (1, 'Todo', 0)")
    conn.execute("INSERT INTO cards (column_id, title, position) VALUES (1, 'Keep me', 0)")
    conn.commit()
    conn.close()

    init()

    conn = db.connect()
    assert conn.execute("SELECT title FROM cards").fetchone()[0] == "Keep me"
    assert users.authenticate(conn, "user", "password") == 1
    assert [tuple(r) for r in conn.execute("SELECT id, name, position FROM boards")] == [
        (1, "My Board", 0)
    ]
    with conn:
        board.create_board(conn, 1, "Second")
    conn.close()
    assert count("boards") == 2
    assert count("cards") == 1
