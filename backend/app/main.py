import os
import sqlite3
from contextlib import asynccontextmanager
from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, StringConstraints
from starlette.middleware.sessions import SessionMiddleware

from app import ai, board, db, users

STATIC_DIR = Path(__file__).parent.parent / "static"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    conn = db.connect()
    with conn:
        users.ensure_demo_user(conn)
    conn.close()
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "dev-secret")
)


@app.exception_handler(board.NotFound)
def not_found(request: Request, exc: board.NotFound):
    return JSONResponse(status_code=404, content={"detail": f"Not found: {exc}"})


@app.exception_handler(board.NotEmpty)
def not_empty(request: Request, exc: board.NotEmpty):
    return JSONResponse(status_code=409, content={"detail": "Move or delete its cards first"})


def get_conn():
    """One connection per request; commits on success, rolls back on error."""
    conn = db.connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def current_user(request: Request, conn: Conn) -> sqlite3.Row:
    """The signed-in user; 401 if there is no session or the user no longer exists."""
    user = users.get_user(conn, request.session.get("user_id", 0))
    if not user:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


User = Annotated[sqlite3.Row, Depends(current_user)]


def current_board_id(board_id: str, user: User, conn: Conn) -> int:
    """The `{board_id}` path parameter as a database id; 404 unless the user owns it."""
    return board.owned_board_id(conn, user["id"], board_id)


BoardId = Annotated[int, Depends(current_board_id)]


Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=30)]
Priority = Literal["low", "medium", "high"]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{3,32}$")]
    password: Annotated[str, StringConstraints(min_length=8)]


class PasswordChange(BaseModel):
    current_password: str
    new_password: Annotated[str, StringConstraints(min_length=8)]


class AccountDelete(BaseModel):
    password: str


class BoardName(BaseModel):
    name: Title


class ColumnTitle(BaseModel):
    title: Title


class ColumnMove(BaseModel):
    position: int


class CardCreate(BaseModel):
    column_id: str
    title: Title
    details: str = ""
    priority: Priority | None = None
    due_date: date | None = None
    labels: list[Label] = []


class CardUpdate(BaseModel):
    """Only fields sent are changed; priority and due_date can be cleared with null."""

    title: Title | None = None
    details: str | None = None
    priority: Priority | None = None
    due_date: date | None = None
    labels: list[Label] | None = None


class CardMove(BaseModel):
    column_id: str
    position: int


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    history: list[ChatMessage] = []


@app.get("/api/health")
def health():
    return {"status": "ok"}


def sign_in(request: Request, conn: sqlite3.Connection, user_id: int) -> dict:
    request.session["user_id"] = user_id
    user = users.get_user(conn, user_id)
    return {"id": user["id"], "username": user["username"]}


@app.post("/api/register", status_code=201)
def register(body: Registration, request: Request, conn: Conn):
    try:
        user_id = users.create_user(conn, body.username, body.password)
    except users.UsernameTaken:
        raise HTTPException(status_code=409, detail="Username is taken")
    return sign_in(request, conn, user_id)


@app.post("/api/login")
def login(credentials: Credentials, request: Request, conn: Conn):
    user_id = users.authenticate(conn, credentials.username, credentials.password)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return sign_in(request, conn, user_id)


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/me")
def me(user: User):
    return {"id": user["id"], "username": user["username"]}


def check_password(user: sqlite3.Row, password: str) -> None:
    if not users.verify_password(password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Password is incorrect")


@app.post("/api/account/password")
def change_password(body: PasswordChange, user: User, conn: Conn):
    check_password(user, body.current_password)
    users.change_password(conn, user["id"], body.new_password)
    return {"status": "ok"}


@app.delete("/api/account")
def delete_account(body: AccountDelete, request: Request, user: User, conn: Conn):
    check_password(user, body.password)
    users.delete_user(conn, user["id"])
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/boards")
def list_boards(user: User, conn: Conn):
    return board.list_boards(conn, user["id"])


@app.post("/api/boards", status_code=201)
def create_board(body: BoardName, user: User, conn: Conn):
    board_id = board.create_board(conn, user["id"], body.name)
    return {"id": f"board-{board_id}", "name": body.name}


@app.patch("/api/boards/{board_id}")
def rename_board(body: BoardName, user: User, conn: Conn, board_id: BoardId):
    board.rename_board(conn, board_id, body.name)
    return {"id": f"board-{board_id}", "name": body.name}


@app.delete("/api/boards/{board_id}")
def delete_board(user: User, conn: Conn, board_id: BoardId):
    board.delete_board(conn, user["id"], board_id)
    return board.list_boards(conn, user["id"])


@app.get("/api/boards/{board_id}/activity")
def read_activity(conn: Conn, board_id: BoardId):
    return board.get_activity(conn, board_id)


# Board content routes return the full board after each change.
@app.get("/api/boards/{board_id}")
def read_board(conn: Conn, board_id: BoardId):
    return board.get_board(conn, board_id)


@app.post("/api/boards/{board_id}/columns", status_code=201)
def create_column(body: ColumnTitle, conn: Conn, board_id: BoardId):
    board.create_column(conn, board_id, body.title)
    return board.get_board(conn, board_id)


@app.patch("/api/boards/{board_id}/columns/{column_id}")
def rename_column(column_id: str, body: ColumnTitle, conn: Conn, board_id: BoardId):
    board.rename_column(conn, board_id, column_id, body.title)
    return board.get_board(conn, board_id)


@app.post("/api/boards/{board_id}/columns/{column_id}/move")
def move_column(column_id: str, body: ColumnMove, conn: Conn, board_id: BoardId):
    board.move_column(conn, board_id, column_id, body.position)
    return board.get_board(conn, board_id)


@app.delete("/api/boards/{board_id}/columns/{column_id}")
def delete_column(column_id: str, conn: Conn, board_id: BoardId):
    board.delete_column(conn, board_id, column_id)
    return board.get_board(conn, board_id)


@app.post("/api/boards/{board_id}/cards", status_code=201)
def create_card(body: CardCreate, conn: Conn, board_id: BoardId):
    board.create_card(conn, board_id, **body.model_dump())
    return board.get_board(conn, board_id)


@app.patch("/api/boards/{board_id}/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, conn: Conn, board_id: BoardId):
    fields = {
        name: value
        for name, value in body.model_dump(exclude_unset=True).items()
        if value is not None or name in ("priority", "due_date")
    }
    board.update_card(conn, board_id, card_id, **fields)
    return board.get_board(conn, board_id)


@app.post("/api/boards/{board_id}/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, conn: Conn, board_id: BoardId):
    board.move_card(conn, board_id, card_id, body.column_id, body.position)
    return board.get_board(conn, board_id)


@app.delete("/api/boards/{board_id}/cards/{card_id}")
def delete_card(card_id: str, conn: Conn, board_id: BoardId):
    board.delete_card(conn, board_id, card_id)
    return board.get_board(conn, board_id)


@app.post("/api/ai/test")
def ai_test(user: User):
    return {"reply": ai.ask("What is 2+2?")}


@app.post("/api/boards/{board_id}/chat")
def chat(body: ChatRequest, conn: Conn, board_id: BoardId):
    messages = ai.build_messages(
        board.get_board(conn, board_id),
        [m.model_dump() for m in body.history],
        body.message,
    )
    response = ai.chat(messages)
    if response is None:
        message = "Sorry, I could not process that. Please try again."
    else:
        message = response.message
        skipped = ai.apply_operations(conn, board_id, response.operations)
        if skipped:
            message += f"\n\n({skipped} change{'s' if skipped > 1 else ''} could not be applied.)"
    return {"message": message, "board": board.get_board(conn, board_id)}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
