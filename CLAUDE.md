# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

More detailed notes live in `backend/AGENTS.md`, `frontend/AGENTS.md`, `scripts/AGENTS.md`, `docs/PLAN.md` and `docs/DATABASE.md`. Keep them up to date when the code they describe changes.

## Commands

Run the whole app (Docker, http://localhost:8000, demo account `user` / `password` or register a new one; needs `.env` with `OPENROUTER_API_KEY`):

```bash
./scripts/start.sh            # Mac/Linux
./scripts/stop.sh
```

```powershell
powershell -ExecutionPolicy Bypass -File scripts\start.ps1   # Windows
powershell -ExecutionPolicy Bypass -File scripts\stop.ps1
```

Do not use the `.sh` scripts from Git Bash on Windows: the volume path gets mangled.

Backend (from `backend/`, managed with uv):

```bash
uv sync
uv run pytest                                  # real OpenRouter tests skip unless OPENROUTER_API_KEY is set
uv run pytest tests/test_board.py::test_rename_column   # single test
uv run pytest --cov                            # coverage; fails below 90%
set -a; . ../.env; set +a; uv run pytest       # include the real OpenRouter tests
uv run uvicorn app.main:app --reload
```

Frontend (from `frontend/`):

```bash
npm run lint
npm run test:unit                              # Vitest
npm run test:coverage                          # Vitest coverage; fails below 80% lines
npx vitest run src/lib/kanban.test.ts          # single file (-t "name" for one test)
npm run test:e2e                               # Playwright; needs the Docker container running
npx playwright test tests/kanban.spec.ts       # single spec
RUN_REAL_AI=1 npm run test:e2e                 # include the real-AI chat test
npm run build                                  # static export to out/
npx tsc --noEmit                               # type-check, including test files
```

## Architecture

One Docker container: a multi-stage `Dockerfile` builds the Next.js app as a static export (`frontend/out`), copies it into `backend/static`, and FastAPI serves it at `/` with all API routes under `/api`. There is no Next.js server and no API proxy, so the frontend only talks to the backend through the container (E2E tests target `http://127.0.0.1:8000`).

Backend (`backend/app/`):
- `main.py` - routes and FastAPI dependencies. `current_user` loads the user from the signed session cookie's `user_id` (401 if absent or deleted), `get_conn` gives one SQLite connection per request wrapped in a transaction (commit on success, rollback on error), `current_board_id` turns the `{board_id}` path parameter into a db id, 404 unless the user owns it. `board.NotFound` maps to 404.
- `board.py` - board CRUD (`list_boards`, `create_board`, ...) and all board content mutations, scoped to a board id. Used by both the REST routes and the AI, so any new board operation belongs here.
- `db.py` - base schema plus numbered `MIGRATIONS` applied by `init_db` (tracked with `PRAGMA user_version`; append, never edit), and `seed_board`. `DB_PATH` is monkeypatched per test in `tests/conftest.py`.
- `users.py` - scrypt password hashing, registration, `authenticate`, change password, delete account, and `ensure_demo_user` (`user` / `password`, run at startup).
- `ai.py` - OpenRouter via the OpenAI SDK, model `openai/gpt-oss-120b`. `/api/boards/{board_id}/chat` sends that board's JSON + browser-held chat history + the new message; the model returns structured output `{message, operations}`; `apply_operations` applies them through `board.py` inside the request transaction, skipping invalid ops (the reply then says how many could not be applied). `chat` returns `None` for an unusable reply (refusal or token limit) and the route answers with a short apology. `Operation` is deliberately one flat model with nullable fields (not a union) because some providers decode `anyOf` incorrectly; `max_tokens` is set because OpenRouter otherwise returns 402 on low balances.

Ids: the database uses integer ids; the API and AI see them as `board-<n>`, `col-<n>` and `card-<n>` (`board.parse_id` converts). Board content routes live under `/api/boards/{board_id}/`.

Frontend (`frontend/src/`):
- `lib/kanban.ts` - `BoardData` shape (`columns[]` with ordered `cardIds`, plus a `cards` map) and pure `moveCard`.
- `lib/api.ts` - fetch helpers; every board route returns the full updated board, and components replace state with it (drag is optimistic, then synced).
- `components/App.tsx` - auth gate via `/api/me`; `Workspace.tsx` owns the header, board list and selected board (remembered in `localStorage`); `KanbanBoard.tsx` (mounted with `key={boardId}`, so switching resets it and the chat) owns board state and passes `setBoard` to `ChatSidebar.tsx` so AI changes render immediately. Drag and drop uses dnd-kit.

E2E tests share the real database: they create `E2E`-prefixed cards and boards (and `e2e_` users) and clean up after themselves (`tests/helpers.ts`), run with `workers: 1`, and one test restarts the `pm` container.
