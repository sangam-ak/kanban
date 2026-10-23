# Backend

FastAPI app managed with uv. Runs in Docker on port 8000.

## Structure

- `pyproject.toml` / `uv.lock` - dependencies (fastapi, uvicorn, itsdangerous for sessions, openai SDK for OpenRouter; dev group: pytest, pytest-cov, httpx2)
- `app/main.py` - FastAPI app: startup db init + `users.ensure_demo_user`, session middleware, dependencies (`get_conn`, `current_user` - the user row for the session's `user_id`, 401 if missing or deleted, `current_board_id` - the `{board_id}` path parameter, 404 unless the user owns it), API routes under `/api`; serves `static/` at `/`
- `app/db.py` - SQLite connection (`foreign_keys` on), base `SCHEMA`, `MIGRATIONS` (applied in order by `init_db`, tracked with `PRAGMA user_version`; append new ones, never edit old ones), `seed_board` (demo board for a user)
- `app/users.py` - scrypt password hashing (`salt$hash` hex; `SCRYPT_N` lowered in tests for speed), `create_user` (with a seeded "My Board"; raises `UsernameTaken`), `ensure_demo_user` (`user` / `password`), `authenticate`, `change_password`, `delete_user`
- `app/board.py` - every mutation also writes one `activity` row via `_log` (same transaction, so failed changes log nothing); `get_activity` returns the latest 50, newest first. Boards: `owned_board_id`, `list_boards`, `create_board` (default columns; `seed=True` adds the demo cards), `rename_board`, `delete_board`; operations scoped to a board id: `get_board`, `create_column`, `rename_column`, `move_column`, `delete_column` (raises `NotEmpty`, mapped to 409, if it has cards), `create_card` / `update_card` (keyword card fields, validated and converted by `_card_values`: `priority` low/medium/high or None, `due_date` ISO date or None, `labels` list stored comma-separated; field names are whitelisted because they become SQL column names), `move_card`, `delete_card`; raise `NotFound` (mapped to 404) for unknown or other-board ids. Shared by the API routes and the AI (`ai.apply_operations`)
- `app/ai.py` - OpenRouter client (OpenAI SDK, `base_url=https://openrouter.ai/api/v1`, key from `OPENROUTER_API_KEY`), model `openai/gpt-oss-120b`, `max_tokens=4096`
  - `ask(prompt)` - plain text reply
  - `chat(messages)` - structured output `ChatResponse {message, operations}`; requests only providers that support structured outputs (`provider.require_parameters`). Returns `None` when there is no usable reply (refusal, or output cut off at `max_tokens`, which includes reasoning tokens)
  - Operation types: `create_card`, `update_card`, `move_card`, `delete_card`, `create_column`, `rename_column`, `move_column`, `delete_column`. The system prompt includes today's date so the model can set relative due dates
  - `Operation` is one flat model (`type` + nullable `card_id`, `column_id`, `title`, `details`, `position`, `priority`, `due_date`, `labels`), not a union: some providers decode `anyOf` unions wrongly (verified: Phala returned `delete_card` ops while replying "Added card")
  - `build_messages` - system prompt with board JSON, then history, then the user message
  - `apply_operations` - applies ops via `board.py`; skips ops missing required fields (`REQUIRED_FIELDS`; a blank title counts as missing), using unknown ids, deleting a non-empty column or giving invalid values (e.g. a bad date), and returns the number skipped. Null card fields mean "unchanged"
  - Without `max_tokens`, OpenRouter reserves the provider's full output limit against the balance and returns 402 on low balances
- `static/` - gitignored; the Docker build copies the Next.js export (`frontend/out`) here and it is served at `/`
- `data/app.db` - SQLite file (gitignored), `/app/data` in the container, mounted from the project-root `data/` folder
- `tests/` - pytest; `conftest.py` gives every test its own temp db and a signed-in `client` fixture; `test_auth.py` has an `anon` fixture (db initialised, nobody signed in). The seeded, migrated database is built once per session (`template_db`) and copied for each test; `test_db.py` deletes the copy to test creation and migration from scratch. Coverage gate: `uv run pytest --cov` fails below 90%

See `docs/DATABASE.md` for the schema and id conventions (`col-<id>`, `card-<id>`).

## Routes

- `GET /api/health` - `{"status": "ok"}`
- `POST /api/register` - `{username, password}`; username 3-32 of `[A-Za-z0-9_-]`, password 8+ chars (422 otherwise); 409 if taken; creates the user with a seeded board and signs in (201, `{id, username}`)
- `POST /api/login` - `{username, password}` checked against the database; stores `user_id` in the signed HTTP-only `session` cookie (Starlette `SessionMiddleware`, secret from `SESSION_SECRET`, local default); returns `{id, username}`; 401 on bad credentials
- `POST /api/logout` - clears the session
- `GET /api/me` - `{id, username}` or 401
- `POST /api/account/password` - `{current_password, new_password}`; 400 if the current password is wrong
- `DELETE /api/account` - `{password}`; deletes the user and all their data, clears the session; 400 if the password is wrong

Board routes require a session (401 otherwise). `{board_id}` is `board-<n>`; boards of other users return 404.

- `GET /api/boards` - `[{id, name}]` in position order
- `POST /api/boards` - `{name}` (201, `{id, name}`; default columns, no cards; appended)
- `PATCH /api/boards/{board_id}` - `{name}`, returns `{id, name}`
- `DELETE /api/boards/{board_id}` - deletes the board with its columns and cards, returns the remaining boards. A user may delete their last board

- `GET /api/boards/{board_id}/activity` - `[{id, action, summary, createdAt}]`, latest 50, newest first (`action` like `card.move`; `createdAt` is UTC `YYYY-MM-DD HH:MM:SS`)

These return the full board JSON after each change:

- `GET /api/boards/{board_id}`
- `POST /api/boards/{board_id}/columns` - `{title}` (201, appended)
- `PATCH /api/boards/{board_id}/columns/{column_id}` - `{title}`
- `POST /api/boards/{board_id}/columns/{column_id}/move` - `{position}` (0-based, clamped)
- `DELETE /api/boards/{board_id}/columns/{column_id}` - 409 if the column still has cards
- `POST /api/boards/{board_id}/cards` - `{column_id, title, details?, priority?, due_date?, labels?}` (201, appended to the column)
- `PATCH /api/boards/{board_id}/cards/{card_id}` - any of `{title, details, priority, due_date, labels}`; only fields sent change; `priority` and `due_date` are cleared with null

Card fields: `priority` is `low` / `medium` / `high`; `due_date` an ISO date (`YYYY-MM-DD`); `labels` a list of 1-30 character strings (trimmed, duplicates dropped, commas replaced by spaces). Invalid values are rejected with 422. In the board JSON they appear as `priority`, `dueDate` and `labels`.
- `POST /api/boards/{board_id}/cards/{card_id}/move` - `{column_id, position}` (0-based, clamped)
- `DELETE /api/boards/{board_id}/cards/{card_id}`

Titles and board names are trimmed; blank ones are rejected with 422. Each request uses one connection and transaction: committed on success, rolled back on error.

- `POST /api/ai/test` - requires a session; asks the model "What is 2+2?" and returns `{reply}` (connectivity check)
- `POST /api/boards/{board_id}/chat` - requires a session; only reads and changes that board; body `{message, history: [{role: "user"|"assistant", content}]}`; sends board + history + message to the model, applies returned operations in the request transaction, returns `{message, board}`. The message notes how many changes could not be applied; if the model gave no usable reply it is a short apology and the board is unchanged

## Commands

```bash
uv sync
uv run pytest
uv run pytest --cov   # coverage gate (90%)
# include the real OpenRouter test (otherwise skipped):
set -a; . ../.env; set +a; uv run pytest
uv run uvicorn app.main:app --reload
```
