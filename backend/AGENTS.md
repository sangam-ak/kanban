# Backend

FastAPI app managed with uv. Runs in Docker on port 8000.

## Structure

- `pyproject.toml` / `uv.lock` - dependencies (fastapi, uvicorn, itsdangerous for sessions, openai SDK for OpenRouter; dev group: pytest, httpx2)
- `app/main.py` - FastAPI app: startup db init, session middleware, dependencies (`current_user`, `get_conn`, `current_board_id`), API routes under `/api`; serves `static/` at `/`
- `app/db.py` - SQLite connection (`foreign_keys` on), schema, `init_db` (creates file/tables, seeds `user` once), `create_user` (user + demo board)
- `app/board.py` - board operations scoped to a board id: `get_board`, `rename_column`, `create_card`, `update_card`, `move_card`, `delete_card`; raise `NotFound` (mapped to 404) for unknown or other-board ids. Shared by the API routes and the AI (`ai.apply_operations`)
- `app/ai.py` - OpenRouter client (OpenAI SDK, `base_url=https://openrouter.ai/api/v1`, key from `OPENROUTER_API_KEY`), model `openai/gpt-oss-120b`, `max_tokens=4096`
  - `ask(prompt)` - plain text reply
  - `chat(messages)` - structured output `ChatResponse {message, operations}`; requests only providers that support structured outputs (`provider.require_parameters`). Returns `None` when there is no usable reply (refusal, or output cut off at `max_tokens`, which includes reasoning tokens)
  - `Operation` is one flat model (`type` + nullable `card_id`, `column_id`, `title`, `details`, `position`), not a union: some providers decode `anyOf` unions wrongly (verified: Phala returned `delete_card` ops while replying "Added card")
  - `build_messages` - system prompt with board JSON, then history, then the user message
  - `apply_operations` - applies ops via `board.py`; skips ops missing required fields (`REQUIRED_FIELDS`; a blank title counts as missing) or using unknown ids, and returns the number skipped
  - Without `max_tokens`, OpenRouter reserves the provider's full output limit against the balance and returns 402 on low balances
- `static/` - gitignored; the Docker build copies the Next.js export (`frontend/out`) here and it is served at `/`
- `data/app.db` - SQLite file (gitignored), `/app/data` in the container, mounted from the project-root `data/` folder
- `tests/` - pytest; `conftest.py` gives every test its own temp db and a signed-in `client` fixture

See `docs/DATABASE.md` for the schema and id conventions (`col-<id>`, `card-<id>`).

## Routes

- `GET /api/health` - `{"status": "ok"}`
- `POST /api/login` - body `{username, password}`; hardcoded `user`/`password`; sets the signed HTTP-only `session` cookie (Starlette `SessionMiddleware`, secret from `SESSION_SECRET`, local default); 401 on bad credentials
- `POST /api/logout` - clears the session
- `GET /api/me` - `{username}` or 401

Board routes require a session (401 otherwise) and return the full board JSON after each change:

- `GET /api/board`
- `PATCH /api/columns/{column_id}` - `{title}`
- `POST /api/cards` - `{column_id, title, details?}` (201, appended to the column)
- `PATCH /api/cards/{card_id}` - `{title?, details?}`
- `POST /api/cards/{card_id}/move` - `{column_id, position}` (0-based, clamped)
- `DELETE /api/cards/{card_id}`

Titles are trimmed; blank titles are rejected with 422. Each request uses one connection and transaction: committed on success, rolled back on error.

- `POST /api/ai/test` - requires a session; asks the model "What is 2+2?" and returns `{reply}` (connectivity check)
- `POST /api/chat` - requires a session; body `{message, history: [{role: "user"|"assistant", content}]}`; sends board + history + message to the model, applies returned operations in the request transaction, returns `{message, board}`. The message notes how many changes could not be applied; if the model gave no usable reply it is a short apology and the board is unchanged

## Commands

```bash
uv sync
uv run pytest
# include the real OpenRouter test (otherwise skipped):
set -a; . ../.env; set +a; uv run pytest
uv run uvicorn app.main:app --reload
```
