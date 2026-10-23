# Frontend

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, lucide-react icons. Built as a static export (`output: "export"` -> `out/`) and served by the FastAPI backend in Docker. The board is loaded from and saved to the backend API.

## Structure

- `src/app/layout.tsx` - root layout; loads Space Grotesk (display) and Manrope (body) via `next/font/google`
- `src/app/page.tsx` - renders `App`
- `src/app/globals.css` - Tailwind import and color tokens as CSS variables (`--accent-yellow`, `--primary-blue`, `--secondary-purple`, `--navy-dark`, `--gray-text`, plus surface/stroke/shadow)
- `src/components/App.tsx` - checks `/api/me` on load; shows `LoginForm` when signed out, `Workspace` when signed in; handles logout via `/api/logout`
- `src/components/Workspace.tsx` - loads the board list, picks the board remembered in `localStorage` (`pm.boardId`) or the first; full-viewport layout with a compact header (logo, `BoardSwitcher`, Open assistant button while the chat is closed, `UserMenu`; icon-only below 640px); renders `KanbanBoard key={boardId}` so switching boards remounts it and resets the chat; empty state with a create form when there are no boards; owns `isChatOpen` (right padding while the sidebar is open)
- `src/components/BoardSwitcher.tsx` - current board name as a dropdown: board list, New board, Rename board, Delete board (inline confirmation). Exports `NameForm` (one-line name input, ignores blank names)
- `src/components/LoginForm.tsx` - sign-in form with a "Create account" mode (adds Confirm password; mismatch is caught client-side; 409 shows "taken", 422 shows the username/password rules)
- `src/components/UserMenu.tsx` - header button showing the username; dropdown with Account settings and Log out
- `src/components/AccountSettings.tsx` - modal dialog: change password (result shown in a `role="status"` line) and delete account (password confirmation; signs out on success)
- `src/lib/api.ts` - typed fetch helpers: boards (`listBoards`, `createBoard`, `renameBoard`, `deleteBoard`), board content routes taking the board id first (each returns the full updated `BoardData`), `chat(boardId, message, history)` (returns `{message, board}`), `getActivity(boardId)`, and account helpers (`login`, `register`, `changePassword`, `deleteAccount`); all throw `ApiError` (with `status`) on non-2xx
- `src/lib/kanban.ts` - types (`Card` with `priority`, `dueDate`, `labels`; `CardChanges` - the snake_case edit payload; `Column`, `BoardData`), `today` / `isOverdue` (ISO string comparison in local time), `parseLabels`, `BoardFilter` / `NO_FILTER` / `isFilterActive` / `filterBoard` (keeps matching card ids per column; text matches title, details or a label, case-insensitive), `moveCard` (pure reorder/move logic) and `columnFirstCollision` (dnd-kit collision detection: the column under the pointer first, then `closestCorners` within it; plain `closestCorners` dropped cards meant for an empty column onto a neighbouring full column)
- `src/components/KanbanBoard.tsx` - takes `boardId`; loads the board via `getBoard`; every change calls the API and replaces state with the returned board. Drag is optimistic (local `moveCard`, then `api.moveCard` with the card's new column and index). Shows an error banner if a load or save fails. The row above the columns holds `BoardToolbar`, `BoardStats` and `ActivityPanel`. `BoardToolbar` filters the view client-side (search, priority, overdue only); while a filter is active `DndContext` gets no sensors, so drag is off, and a status line says so. The board fills the height below the header. Columns share the width (min 190px, 85% wide with scroll snap on phones), scroll horizontally only when they do not fit, and each column scrolls its cards vertically; an "Add column" slot (`NameForm`) follows the last column. Renders `ChatSidebar` (with the board id) and passes `setBoard` so AI changes show immediately
- `src/components/ChatSidebar.tsx` - fixed right-hand AI chat panel (full width on phones, 320px, 380px from 1536px); open by default except below 640px; renders nothing when closed but stays mounted so the conversation is kept (the open button lives in the board header). History lives in React state and is sent with each message; Enter sends, Shift+Enter adds a line
- `src/components/KanbanColumn.tsx` - droppable column; title input and card count badge in the header; title input keeps local state and saves on blur or Enter (empty title reverts); move left/right buttons (disabled at the ends) and a delete button shown only when the column is empty (`isEmpty` comes from the unfiltered board); sortable card list, `NewCardForm`
- `src/components/KanbanCard.tsx` - sortable card showing title, details (long words wrap), edit (pencil) and delete (trash) icon buttons in the top-right corner, shown on hover/focus on devices that can hover and always on touch devices; Edit switches to an inline form with title, details, priority select, due date and comma-separated labels (drag attributes/listeners are removed while editing so the inputs stay usable). `CardMeta` shows the priority badge, due date (`Overdue <date>` in red when past) and label chips
- `src/components/BoardStats.tsx` - board summary (`dl` labelled "Board summary"): card, overdue and high-priority counts
- `src/components/ActivityPanel.tsx` - Activity button and dropdown (`region` "Recent activity"); fetches `getActivity` when opened and again whenever the board changes while open
- `src/components/BoardToolbar.tsx` - search input, priority select, Overdue only checkbox; when active shows "Showing N of M cards" and Clear filters
- `src/components/KanbanCardPreview.tsx` - card rendered in the drag overlay (with `CardMeta`)
- `src/components/NewCardForm.tsx` - toggled form to add a card (title required, details optional)
- `src/test/boardData.ts` - demo board fixture for unit tests (mirrors the backend seed) and `makeCard` (fills in empty priority, due date and labels)

## Data shape

```ts
BoardData = {
  columns: { id, title, cardIds[] }[],
  cards: Record<id, { id, title, details, priority: "low" | "medium" | "high" | null, dueDate: string | null, labels: string[] }>,
}
```

Column order is the array order; card order is `cardIds` order. Ids come from the backend as `col-<n>` and `card-<n>`.

## Tests

- Unit (Vitest + Testing Library, jsdom): `src/lib/kanban.test.ts`, `src/lib/api.test.ts` (fetch stubbed), `src/components/KanbanBoard.test.tsx` (`@/lib/api` mocked with `vi.mock`), `src/components/ChatSidebar.test.tsx` (`@/lib/api` mocked), `src/components/App.test.tsx` (fetch stubbed; sign in, registration, logout), `src/components/UserMenu.test.tsx` (account settings; fetch stubbed), `src/components/Workspace.test.tsx` (board switching, create/rename/delete, empty state; `@/lib/api` mocked). `src/test/setup.ts` stubs `window.matchMedia` (missing in jsdom). Run `npm run test:unit`; `npm run test:coverage` fails below 80% of lines.
- E2E (Playwright, Chromium): `tests/auth.spec.ts`, `tests/boards.spec.ts`, `tests/kanban.spec.ts`, `tests/chat.spec.ts` (`**/api/boards/*/chat` mocked with `page.route`; the real-AI test runs only with `RUN_REAL_AI=1`). Runs against the Docker container at `http://127.0.0.1:8000`; start it with `scripts/start` first. Run `npm run test:e2e`.
  - Shared helpers in `tests/helpers.ts` (`signIn`, `boardUrl` - the first board, which a fresh browser opens, `deleteE2ECards`).
  - Uses the real database: tests create their own `E2E`-prefixed cards and boards and delete them in `afterEach`; the rename test restores the column title in `finally`. The registration test creates an `e2e_<timestamp>` user and deletes the account at the end.
  - After signing in, wait for the Account menu button, not the "Kanban Studio" heading: the login page has that heading too, so the wait would pass before the session cookie is set.
  - Wait for the save response before reloading (`saved` helper), or the reload cancels the request.
  - `workers: 1` because tests share the database and one test runs `docker restart pm`.

## Notes

- `npx tsc --noEmit` type-checks app and test files. Test globals and jest-dom matchers are typed via `src/test/vitest.d.ts` (`vitest/globals`, `@testing-library/jest-dom/vitest`).
