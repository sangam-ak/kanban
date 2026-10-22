# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4. Built as a static export (`output: "export"` -> `out/`) and served by the FastAPI backend in Docker. The board is loaded from and saved to the backend API.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (display) and Manrope (body) via `next/font/google`
- `src/app/page.tsx` - renders `App`
- `src/app/globals.css` - Tailwind import and color tokens as CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, plus surface/stroke/shadow)
- `src/components/App.tsx` - checks `/api/me` on load; shows `LoginForm` when signed out, `KanbanBoard` when signed in; handles logout via `/api/logout`
- `src/components/LoginForm.tsx` - username/password form posting to `/api/login`; shows an error on 401
- `src/lib/api.ts` - typed fetch helpers for the board routes (each returns the full updated `BoardData`) and `chat(message, history)` (returns `{message, board}`); all throw on non-2xx
- `src/lib/kanban.ts` - types (`Card`, `Column`, `BoardData`) and `moveCard` (pure reorder/move logic)
- `src/components/KanbanBoard.tsx` - loads the board via `getBoard`; every change calls the API and replaces state with the returned board. Drag is optimistic (local `moveCard`, then `api.moveCard` with the card's new column and index). Shows an error banner if a load or save fails. Log out button in the header. Renders `ChatSidebar` and passes `setBoard` so AI changes show immediately; board scrolls horizontally (columns min 240px) and gets right padding while the sidebar is open
- `src/components/ChatSidebar.tsx` - fixed right-hand AI chat panel (full width on phones, 380px otherwise); open by default except below 640px; stays mounted when closed so the conversation is kept. History lives in React state and is sent with each message; Enter sends, Shift+Enter adds a line
- `src/components/KanbanColumn.tsx` - droppable column; title input keeps local state and saves on blur or Enter (empty title reverts); sortable card list, `NewCardForm`
- `src/components/KanbanCard.tsx` - sortable card showing title, details (long words wrap), Edit and Remove buttons below the text; Edit switches to an inline form (drag attributes/listeners are removed while editing so the inputs stay usable)
- `src/components/KanbanCardPreview.tsx` - card rendered in the drag overlay
- `src/components/NewCardForm.tsx` - toggled form to add a card (title required, details optional)
- `src/test/boardData.ts` - demo board fixture for unit tests (mirrors the backend seed)

## Data shape

```ts
BoardData = { columns: { id, title, cardIds[] }[], cards: Record<id, { id, title, details }> }
```

Column order is the array order; card order is `cardIds` order. Ids come from the backend as `col-<n>` and `card-<n>`.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts`, `src/lib/api.test.ts` (fetch stubbed), `src/components/KanbanBoard.test.tsx` (`@/lib/api` mocked with `vi.mock`), `src/components/ChatSidebar.test.tsx` (`@/lib/api` mocked), `src/components/App.test.tsx` (fetch stubbed). `src/test/setup.ts` stubs `window.matchMedia` (missing in jsdom). Run `npm run test:unit`.
- E2E (Playwright, Chromium): `tests/auth.spec.ts`, `tests/kanban.spec.ts`, `tests/chat.spec.ts` (`/api/chat` mocked with `page.route`; the real-AI test runs only with `RUN_REAL_AI=1`). Runs against the Docker container at `http://127.0.0.1:8000`; start it with `scripts/start` first. Run `npm run test:e2e`.
  - Uses the real database: tests create their own `E2E`-prefixed cards and delete them in `afterEach`; the rename test restores the column title in `finally`.
  - Wait for the save response before reloading (`saved` helper), or the reload cancels the request.
  - `workers: 1` because tests share the database and one test runs `docker restart pm`.

## Notes

- `npx tsc --noEmit` reports errors for test globals (`describe`, `expect`) in test files; this predates the project work. Vitest runs fine and `next build` passes.
