# Project Plan

Checklist items are checked off by the agent as work completes. Each part ends with user review before moving on.

## Agreed decisions

- Card editing: inline edit of title and details (added in Part 3).
- New user board: seeded with the demo's 5 columns and 8 sample cards.
- Database: normalized SQLite tables (users, boards, columns, cards). Schema documented as JSON in docs/. API and AI exchange the board as JSON in the frontend's `BoardData` shape.
- AI board changes: structured output contains a list of operations (create, edit, move, delete card; rename column), not a full board.
- Chat history: kept in browser state only, sent with each request.
- Auth: hardcoded `user` / `password`; backend sets an HTTP-only session cookie; API routes require it.
- Scripts: `.sh` for Mac/Linux, `.ps1` for Windows.
- E2E tests: Playwright runs against the Docker container (port 8000) from Part 3 on.

## Target layout

```
backend/        FastAPI app (uv project), tests in backend/tests
frontend/       Next.js app, built with static export
scripts/        start/stop scripts
data/           SQLite db (mounted into container, gitignored)
Dockerfile      multi-stage: node builds frontend, python + uv runs backend
```

---

## Part 1: Plan

- [x] Review AGENTS.md, existing frontend and this plan
- [x] Resolve open questions with the user (see Agreed decisions)
- [x] Enrich this plan with substeps, tests and success criteria
- [x] Create frontend/AGENTS.md describing the existing code
- [x] User approves the plan

Success criteria: user has approved this document.

## Part 2: Scaffolding

- [x] `backend/` uv project (`pyproject.toml`, `uv.lock`) with FastAPI and uvicorn
- [x] `backend/app/main.py`: `GET /api/health` returns `{"status": "ok"}`; serves a static hello-world `index.html` at `/`
- [x] `Dockerfile` at project root using a Python image with uv; runs uvicorn on port 8000
- [x] `.dockerignore` (node_modules, .next, .venv, data, .env)
- [x] `scripts/start.sh`, `scripts/stop.sh`, `scripts/start.ps1`, `scripts/stop.ps1`: build image, run container named `pm` with `--env-file .env`, port 8000, `./data` mounted; stop removes the container
- [x] pytest set up in backend with a test for `/api/health` and `/`
- [x] Update `.gitignore` (data/, frontend/test-results/, frontend/out/) and remove committed `frontend/test-results/`
- [x] Update backend/AGENTS.md and scripts/AGENTS.md

Tests:
- `uv run pytest` passes (health and static root).
- Manual: `scripts/start` then `curl localhost:8000/api/health` and open `localhost:8000` shows hello world; `scripts/stop` removes the container.

Success criteria: container builds and runs on Windows; hello-world page and API call both work.

## Part 3: Add in Frontend

- [x] `next.config.ts`: `output: "export"`
- [x] Dockerfile stage 1 (node) runs `npm ci && npm run build`; stage 2 copies `frontend/out` into the backend static dir
- [x] FastAPI serves the static export at `/` (API routes under `/api` take precedence)
- [x] Inline card editing: clicking edit on a card switches title and details to inputs with Save / Cancel; `KanbanBoard` gets `handleEditCard`
- [x] Playwright config points at `http://127.0.0.1:8000` with no `webServer` (container started via scripts)
- [x] Update frontend/AGENTS.md

Tests:
- Unit: edit card updates title/details; cancel leaves card unchanged; existing unit tests still pass.
- E2E against container: board loads at `/` with 5 columns; add card; edit card; delete card; rename column; drag card between columns.

Success criteria: `localhost:8000` shows the working Kanban demo from the container; all unit and e2e tests pass.

## Part 4: Fake sign in

- [x] Backend: `POST /api/login` (checks `user`/`password`, sets signed HTTP-only cookie), `POST /api/logout` (clears cookie), `GET /api/me` (200 with username or 401)
- [x] Session via Starlette `SessionMiddleware`; secret from `SESSION_SECRET` env var with a local default
- [x] Frontend: on load call `/api/me`; show a login form if 401, else the board; logout button in the header
- [x] Login form styled with the project color scheme; error message on bad credentials

Tests:
- Backend: login success sets cookie; wrong credentials return 401; `/api/me` before/after login and after logout.
- Unit: login form submits, shows error on 401, shows board on success; logout returns to login.
- E2E: visiting `/` shows login; bad credentials show error; good credentials show board; reload stays logged in; logout returns to login.

Success criteria: board is only visible after login; logout works; all tests pass.

## Part 5: Database modeling

- [x] Propose schema for SQLite:
  - `users` (id, username unique, created_at)
  - `boards` (id, user_id unique FK, created_at) - one board per user for MVP
  - `columns` (id, board_id FK, title, position)
  - `cards` (id, column_id FK, title, details, position)
- [x] Save schema as `docs/schema.json`
- [x] Write `docs/DATABASE.md`: tables, ordering via integer `position`, mapping to `BoardData` JSON (ids exposed as strings), db created on startup if missing at `data/app.db`, new user seeded with demo board, no ORM (standard library `sqlite3`)
- [x] User sign off

Success criteria: user approves the schema and approach.

## Part 6: Backend

- [x] `backend/app/db.py`: connect, create tables if missing, seed `user` with demo board on first run
- [x] Board service functions (used by both API and AI): `get_board`, `rename_column`, `create_card`, `update_card`, `move_card(card_id, column_id, position)`, `delete_card`
- [x] Routes (all require session, scoped to the logged-in user's board):
  - `GET /api/board` returns `BoardData` JSON
  - `PATCH /api/columns/{id}` rename
  - `POST /api/cards` create (column_id, title, details)
  - `PATCH /api/cards/{id}` edit title/details
  - `POST /api/cards/{id}/move` (column_id, position)
  - `DELETE /api/cards/{id}`
- [x] Pydantic request/response models
- [x] Update backend/AGENTS.md

Tests (pytest with a temp db per test):
- DB file and tables created when missing; seed only runs once.
- Each route: success path, 401 without session, 404 for ids not on the user's board.
- Move: within column reorder, across columns, to end; positions stay contiguous.
- Data persists across app restart (new client on same db file).

Success criteria: all backend tests pass; board state persists in `data/app.db`.

## Part 7: Frontend + Backend

- [x] `src/lib/api.ts`: typed fetch helpers for the board routes
- [x] `KanbanBoard` loads board from `GET /api/board`; each action calls the API then updates state from the response (optimistic update for drag to keep it smooth)
- [x] Remove `initialData` from frontend runtime use (keep for tests if useful)
- [x] Basic error display if an API call fails

Tests:
- Unit: board renders data from mocked API; each action calls the right endpoint.
- E2E: every action (add, edit, delete, rename, drag) survives a page reload and a container restart.

Success criteria: the board is fully persistent; all tests pass.

## Part 8: AI connectivity

- [x] Add `openai` Python SDK; client with `base_url=https://openrouter.ai/api/v1`, key from `OPENROUTER_API_KEY`, model `openai/gpt-oss-120b`
- [x] `backend/app/ai.py` with a simple `ask(prompt)` function
- [x] `POST /api/ai/test` (auth required) sends "What is 2+2?" and returns the reply

Tests:
- Unit: route with mocked client returns mocked reply.
- Integration (skipped if no key): real call answer contains "4".

Success criteria: real OpenRouter call works from inside the container.

## Part 9: AI with board context and structured outputs

- [x] Pydantic models for the structured output:
  - `ChatResponse { message: str, operations: list[Operation] }`
  - `Operation` is a discriminated union: `create_card(column_id, title, details)`, `update_card(card_id, title?, details?)`, `move_card(card_id, column_id, position)`, `delete_card(card_id)`, `rename_column(column_id, title)`
- [x] `POST /api/chat` takes `{ message, history }`; builds system prompt with board JSON and instructions; calls the model with JSON schema response format; applies operations via the Part 6 service functions; returns `{ message, board }`
- [x] Invalid operations (unknown ids) are skipped and do not fail the request

Tests:
- Unit with mocked model: reply-only response leaves board unchanged; each operation type applies correctly; multiple operations in one response; invalid id skipped; history is passed through to the model.
- Integration (skipped if no key): "Add a card called Test to Backlog" results in a new card in Backlog.

Success criteria: AI can read the board and make reliable changes; all tests pass.

## Part 10: AI chat sidebar

- [x] `ChatSidebar` component: collapsible right sidebar, message list, input, send button (purple), loading state
- [x] Conversation history in React state, sent with each request
- [x] On response, append assistant message and replace board state with returned board
- [x] Styled with the project color scheme; works alongside the board on desktop widths

Tests:
- Unit: sending a message shows user and assistant messages; board updates from response; loading state shown.
- E2E with `/api/chat` mocked via Playwright route: send message, board updates without reload.
- Manual: real AI creates, edits, and moves cards from chat.

Success criteria: user can manage the board through chat and the UI refreshes automatically; all tests pass.
