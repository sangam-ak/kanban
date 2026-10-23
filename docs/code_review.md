# Code Review

Date: 2026-10-23. Scope: whole repository on branch `mvp` (commit `bb1328d`).

## Summary

The MVP is complete against `AGENTS.md` and `docs/PLAN.md`, and is in good shape: small, readable modules, a clear single path for board changes (`backend/app/board.py`, shared by REST and AI), per-request transactions, and good test coverage at three levels.

Verified during this review:

- Backend: `uv run pytest` - 59 passed (including real OpenRouter tests)
- Frontend: `npm run lint` - clean; `npm run test:unit` - 35 passed
- E2E: `RUN_REAL_AI=1 npm run test:e2e` against the Docker container - 14 passed
- `npm audit --omit=dev` - 4 advisories (1 critical, 2 high, 1 moderate), all fixable by upgrading
- `npx tsc --noEmit` - 120 errors, all in test files, root cause found (see A2)

No correctness bugs were found in the main paths. The findings below are mostly robustness gaps in the AI path, dependency hygiene, and small UX inconsistencies. Each has a concrete action. Priorities: **High** = do next, **Medium** = worth doing, **Low** = optional.

---

## Actions

### A1. Upgrade dependencies with known vulnerabilities - High

`npm audit --omit=dev` reports:

| Package | Severity | Installed | Fix |
|---|---|---|---|
| `next` | critical | 16.1.6 | 16.4.2 |
| `postcss` (via next) | high | <=8.5.22 | comes with next upgrade |
| `nanoid` | high | <=3.3.17 | `npm audit fix` |
| `baseline-browser-mapping` | moderate | <2.11.0 | `npm audit fix` |

Real-world impact is lower than the severity suggests, because Next.js is used only as a static export (no Next server runs in production). Still, `AGENTS.md` asks for the latest versions and the fix is cheap.

Action: in `frontend/`, bump `next` and `eslint-config-next` to `16.4.2`, run `npm audit fix`, then re-run unit and E2E tests.

Other outdated packages (`npm outdated`, `uv tree --outdated`): minor bumps for `react`/`react-dom` 19.3.1, `tailwindcss` 4.3.3, `@playwright/test` 1.64.1, `fastapi` 0.161.1, `openai` 3.37.0. Major bumps are available for `vitest` (5), `typescript` (7), `eslint` (10), `jsdom` (30); take these separately, since they may need config changes. `@types/node` is pinned to `^20` while the Docker build uses Node 24; change to `^24`.

### A2. Fix TypeScript errors in test files - High

`npx tsc --noEmit` reports 120 errors (`describe`, `expect`, `vi` not found), all in `*.test.ts(x)`. This is documented in `frontend/AGENTS.md` as pre-existing, but it hides real type errors in tests.

Root cause: `frontend/src/test/vitest.d.ts` references `types="vitest"`, which does not declare the globals enabled by `globals: true` in `vitest.config.ts`. Verified: changing it to `/// <reference types="vitest/globals" />` brings the count to 0.

Action: make that one-line change and remove the note from `frontend/AGENTS.md` and `CLAUDE.md`. Optionally add `npx tsc --noEmit` to the checks run before committing.

### A3. Handle AI responses that fail to parse - Medium

`backend/app/ai.py` `chat()` returns `response.choices[0].message.parsed`. This is `None` when the model refuses, and the OpenAI SDK raises `LengthFinishReasonError` when output hits `max_tokens`. In both cases `/api/chat` fails with an unhandled 500.

`openai/gpt-oss-120b` is a reasoning model, and reasoning tokens count against `MAX_TOKENS = 4096`. As boards and chat histories grow, hitting the limit becomes more likely.

Action (keep it simple): in `main.py`'s `chat` route, catch these failures and return a short assistant message such as "Sorry, I could not process that. Please try again." with the unchanged board, so the user sees a reply instead of a generic error. Add one test with the fake model returning `None`. Consider raising `MAX_TOKENS` (for example to 8192) if limits are hit in practice.

### A4. Tell the user when AI operations are skipped - Medium

`apply_operations` silently skips operations with missing fields or unknown ids. The model's `message` was written before the operations ran, so it may say "Moved the card" when nothing changed.

Action: have `apply_operations` return the number of skipped operations. When it is non-zero, append a sentence to the reply in the route, for example "(1 change could not be applied.)". One extra test.

### A5. Validate AI-supplied titles like the API does - Medium

REST requests require non-empty titles (`Field(min_length=1)` in `main.py`), but the AI path does not: an AI `create_card`, `update_card` or `rename_column` with `title=""` is applied and produces a blank card or column. Whitespace-only titles also pass the REST validation.

Action: in `apply_operations`, treat an empty or whitespace-only title as missing. For example, strip it and skip the operation (or field) if it is empty. Optionally use `StringConstraints(strip_whitespace=True, min_length=1)` on the REST models so both paths behave the same.

### A6. Recover from failed saves instead of asking for a reload - Low

`KanbanBoard.save` shows "Reload the page to see the latest board" when a request fails. After a failed drag, the board stays in its optimistic (unsaved) state. After a failed column rename, `KanbanColumn` keeps showing the new title because `column.title` never changed.

Action: in the `catch` of `save`, call `api.getBoard()` and `setBoard` with the result, so the UI snaps back to the server state. Shorten the message to "Could not save your change." Update the existing unit test.

### A7. Handle network failure on startup and logout - Low

`App.tsx` calls `fetch("/api/me")` with no `catch`. If the backend is unreachable, the page stays blank forever. `handleLogout` also ignores failures.

Action: on a network error in the `/api/me` check, treat the user as signed out (`setUsername(null)`) so the login form appears. Login will then surface any error.

### A8. Use a real session secret outside local development - Low

`SessionMiddleware` falls back to `"dev-secret"`. Anyone who knows this default can forge a session cookie. This is acceptable for a local MVP, but easy to forget later.

Action: document `SESSION_SECRET` in the README next to `OPENROUTER_API_KEY`, and set it in `.env`. No code change needed.

### A9. Keyboard support for moving cards - Low

Only `PointerSensor` is registered in `KanbanBoard.tsx`, so cards cannot be moved with the keyboard. dnd-kit supports this through `KeyboardSensor` with `sortableKeyboardCoordinates`.

Action: add `useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })`. The AI chat already provides a keyboard way to move cards, so this is optional for the MVP.

### A10. Remove or keep the `/api/ai/test` endpoint deliberately - Low

`POST /api/ai/test` was the Part 8 connectivity check. The UI does not use it, and each call costs a model request. It is covered by `test_ai.py`.

Action: decide whether to keep it. If removed, delete the route and its test, and the line in `backend/AGENTS.md`. `ai.ask` can then be removed too, unless the real connectivity test still uses it.

### A11. Docker image hygiene - Low

- `ghcr.io/astral-sh/uv:latest` is unpinned, so builds are not reproducible. Pin a version tag (for example `uv:0.x.y`) and bump it deliberately.
- The container runs as root. For local use this is fine. If it is ever deployed, add a non-root `USER`. Note that `./data` is bind-mounted, so file ownership on the host would need care.

### A12. Trim `.gitignore` - Low

The root `.gitignore` is the full GitHub Python template (around 170 lines covering Django, Scrapy, Sphinx, PyBuilder and so on), most of it irrelevant here. This contradicts "keep it simple".

Action: replace it with the entries that apply: `__pycache__/`, `.venv/`, `.pytest_cache/`, `.env`, `.DS_Store`, `data/`, `backend/static/`, `frontend/test-results/`, `frontend/out/`. Node entries are already in `frontend/.gitignore`.

---

## Observations (no action needed)

- **Chat history is unbounded.** The full history is sent on every message. This is fine at MVP scale. If long sessions cause token-limit errors (see A3), send only the last N messages.
- **AI request timing.** `/api/chat` reads the board, waits for the model (several seconds), then applies operations. SQLite's write lock is taken only at the first write, after the model returns, so other requests are not blocked. If the user edits the board during the call, operations on ids that have since gone are skipped (see A4).
- **E2E tests use the real database.** They clean up after themselves (`E2E` prefix, column title restored in `finally`), but an interrupted run can leave `E2E` cards behind. This is acceptable, and documented in `frontend/AGENTS.md`.
- **No frontend dev server workflow.** `next dev` has no API, because static export does not allow rewrites, so every UI change needs a Docker rebuild (around 15s when cached) to test against the backend. This is acceptable. If iteration speed becomes a problem, running `uvicorn` locally plus `next build` is the lightest option, without adding proxy configuration.
- **Header copy is hardcoded.** "One board. Five columns. Zero clutter." is fine while the columns are fixed.
- **Documentation** (`AGENTS.md` files, `docs/DATABASE.md`, `docs/schema.json`) matches the code. Keep it in sync when acting on the items above, especially A2 and A10.

## Remediation status

Critical, High and Medium items (A1 to A5) were done on 2026-10-23.

- **A1 - done.**
  - `next` and `eslint-config-next` are at 16.4.2, `react`/`react-dom` at 19.3.1 and `@types/node` at `^24`. In-range minors were updated with `npm update`, and the backend lockfile was upgraded (`fastapi` 0.161.1, `openai` 3.37.0).
  - The dev-only test toolchain had a critical advisory (`tinypool`, via Vitest 3). It was fixed by moving to `vitest` 5 and `@vitest/coverage-v8` 5, with `@vitejs/plugin-react` 6.
  - `npm audit --omit=dev`: 0 vulnerabilities.
  - Remaining: `npm audit` (including dev) reports 5 high advisories. They are all one issue, `braces` (GHSA-vfj7-8cjw-p6xm), pulled in by `eslint-config-next` -> `@next/eslint-plugin-next` -> `fast-glob` -> `micromatch`. The advisory covers every `braces` version, including the latest (3.0.3), so there is no patched version. npm's suggested "fix" downgrades `eslint-config-next` to 14, which is wrong. This affects lint tooling only, never the built app. Re-check when `@next/eslint-plugin-next` updates.
- **A2 - done.** `src/test/vitest.d.ts` now references `vitest/globals` and `@testing-library/jest-dom/vitest`, and `setup.ts` imports `@testing-library/jest-dom/vitest`. The second change was needed after the Vitest 5 upgrade, because jest-dom's default entry augments Jest types, not Vitest's. `npx tsc --noEmit`: 0 errors.
- **A3 - done.** `ai.chat` returns `None` on a refusal or `LengthFinishReasonError` / `ContentFilterFinishReasonError`. `/api/chat` then replies with "Sorry, I could not process that. Please try again." and the unchanged board. `MAX_TOKENS` is unchanged.
- **A4 - done.** `apply_operations` returns the skipped count, and the reply gets "(N change(s) could not be applied.)" appended.
- **A5 - done.** AI titles are stripped and blank ones count as missing. REST titles use `StringConstraints(strip_whitespace=True, min_length=1)`, so they are trimmed and blank ones get a 422.

Tests added: blank and trimmed REST titles, AI blank titles, skipped-count messages (singular and plural), an unusable model reply, and `ai.chat` returning `None` on a length cut-off.

## Suggested order

1. A1 and A2: dependency upgrade and the tsc fix. Mechanical; run the full test suite afterwards.
2. A3, A4 and A5: AI robustness. Small backend changes, each with a test.
3. A6 and A7: frontend error recovery.
4. Low items as time allows.
