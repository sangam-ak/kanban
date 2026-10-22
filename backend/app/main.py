import os
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.middleware.sessions import SessionMiddleware

from app import ai, board, db

STATIC_DIR = Path(__file__).parent.parent / "static"

# MVP: single hardcoded user
USERNAME = "user"
PASSWORD = "password"


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db(USERNAME)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    SessionMiddleware, secret_key=os.environ.get("SESSION_SECRET", "dev-secret")
)


@app.exception_handler(board.NotFound)
def not_found(request: Request, exc: board.NotFound):
    return JSONResponse(status_code=404, content={"detail": f"Not found: {exc}"})


def current_user(request: Request) -> str:
    username = request.session.get("username")
    if not username:
        raise HTTPException(status_code=401, detail="Not signed in")
    return username


def get_conn():
    """One connection per request; commits on success, rolls back on error."""
    conn = db.connect()
    try:
        with conn:
            yield conn
    finally:
        conn.close()


Username = Annotated[str, Depends(current_user)]
Conn = Annotated[sqlite3.Connection, Depends(get_conn)]


def current_board_id(username: Username, conn: Conn) -> int:
    return board.get_board_id(conn, username)


BoardId = Annotated[int, Depends(current_board_id)]


class Credentials(BaseModel):
    username: str
    password: str


class ColumnRename(BaseModel):
    title: str = Field(min_length=1)


class CardCreate(BaseModel):
    column_id: str
    title: str = Field(min_length=1)
    details: str = ""


class CardUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1)
    details: str | None = None


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


@app.post("/api/login")
def login(credentials: Credentials, request: Request):
    if credentials.username != USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    request.session["username"] = credentials.username
    return {"username": credentials.username}


@app.post("/api/logout")
def logout(request: Request):
    request.session.clear()
    return {"status": "ok"}


@app.get("/api/me")
def me(username: Username):
    return {"username": username}


@app.get("/api/board")
def read_board(conn: Conn, board_id: BoardId):
    return board.get_board(conn, board_id)


@app.patch("/api/columns/{column_id}")
def rename_column(column_id: str, body: ColumnRename, conn: Conn, board_id: BoardId):
    board.rename_column(conn, board_id, column_id, body.title)
    return board.get_board(conn, board_id)


@app.post("/api/cards", status_code=201)
def create_card(body: CardCreate, conn: Conn, board_id: BoardId):
    board.create_card(conn, board_id, body.column_id, body.title, body.details)
    return board.get_board(conn, board_id)


@app.patch("/api/cards/{card_id}")
def update_card(card_id: str, body: CardUpdate, conn: Conn, board_id: BoardId):
    board.update_card(conn, board_id, card_id, body.title, body.details)
    return board.get_board(conn, board_id)


@app.post("/api/cards/{card_id}/move")
def move_card(card_id: str, body: CardMove, conn: Conn, board_id: BoardId):
    board.move_card(conn, board_id, card_id, body.column_id, body.position)
    return board.get_board(conn, board_id)


@app.delete("/api/cards/{card_id}")
def delete_card(card_id: str, conn: Conn, board_id: BoardId):
    board.delete_card(conn, board_id, card_id)
    return board.get_board(conn, board_id)


@app.post("/api/ai/test")
def ai_test(username: Username):
    return {"reply": ai.ask("What is 2+2?")}


@app.post("/api/chat")
def chat(body: ChatRequest, conn: Conn, board_id: BoardId):
    messages = ai.build_messages(
        board.get_board(conn, board_id),
        [m.model_dump() for m in body.history],
        body.message,
    )
    response = ai.chat(messages)
    ai.apply_operations(conn, board_id, response.operations)
    return {"message": response.message, "board": board.get_board(conn, board_id)}


app.mount("/", StaticFiles(directory=STATIC_DIR, html=True, check_dir=False), name="static")
