from app import db


def count(table):
    conn = db.connect()
    result = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    conn.close()
    return result


def test_init_creates_db_file_and_tables(temp_db):
    assert not temp_db.exists()
    db.init_db("user")
    assert temp_db.exists()
    conn = db.connect()
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    conn.close()
    assert {"users", "boards", "columns", "cards"} <= tables


def test_seed_creates_demo_board():
    db.init_db("user")
    assert count("users") == 1
    assert count("boards") == 1
    assert count("columns") == 5
    assert count("cards") == 8


def test_seed_runs_only_once():
    db.init_db("user")
    db.init_db("user")
    assert count("users") == 1
    assert count("cards") == 8


def test_foreign_keys_cascade_on_user_delete():
    db.init_db("user")
    conn = db.connect()
    with conn:
        conn.execute("DELETE FROM users")
    conn.close()
    assert count("boards") == 0
    assert count("columns") == 0
    assert count("cards") == 0
