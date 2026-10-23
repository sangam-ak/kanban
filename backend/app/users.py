"""User accounts: password hashing, registration, sign in and account changes."""

import hashlib
import hmac
import secrets
import sqlite3

from app import board

DEMO_USERNAME = "user"
DEMO_PASSWORD = "password"
SCRYPT_N = 2**14  # cost factor; tests lower it for speed


class UsernameTaken(Exception):
    pass


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=SCRYPT_N, r=8, p=1)
    return f"{salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, _, digest = stored.partition("$")
    if not digest:
        return False
    candidate = hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=SCRYPT_N, r=8, p=1)
    return hmac.compare_digest(candidate.hex(), digest)


def create_user(conn: sqlite3.Connection, username: str, password: str) -> int:
    """Create a user with a seeded demo board; raises UsernameTaken."""
    try:
        user_id = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (username, hash_password(password)),
        ).lastrowid
    except sqlite3.IntegrityError:  # UNIQUE(username), also under concurrent sign-ups
        raise UsernameTaken(username)
    board.create_board(conn, user_id, "My Board", seed=True)
    return user_id


def ensure_demo_user(conn: sqlite3.Connection) -> None:
    """Create the demo account, or give it a password if it predates password hashes."""
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (DEMO_USERNAME,)
    ).fetchone()
    if not row:
        create_user(conn, DEMO_USERNAME, DEMO_PASSWORD)
    elif not row["password_hash"]:
        conn.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(DEMO_PASSWORD), row["id"]),
        )


def get_user(conn: sqlite3.Connection, user_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT id, username, password_hash FROM users WHERE id = ?", (user_id,)
    ).fetchone()


def authenticate(conn: sqlite3.Connection, username: str, password: str) -> int | None:
    row = conn.execute(
        "SELECT id, password_hash FROM users WHERE username = ?", (username,)
    ).fetchone()
    if row and verify_password(password, row["password_hash"]):
        return row["id"]
    return None


def change_password(conn: sqlite3.Connection, user_id: int, password: str) -> None:
    conn.execute(
        "UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), user_id)
    )


def delete_user(conn: sqlite3.Connection, user_id: int) -> None:
    """Delete a user; boards, columns and cards cascade."""
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
