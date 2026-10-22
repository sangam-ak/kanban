# Database

SQLite, accessed with Python's standard library `sqlite3` (no ORM). Full schema: [schema.json](schema.json).

## Tables

```
users 1──1 boards 1──* columns 1──* cards
```

- `users` - `id`, `username` (unique). No password column: the MVP checks hardcoded credentials (`user` / `password`) in code.
- `boards` - one per user (`user_id` is unique). Dropping that constraint later allows multiple boards.
- `columns` - `board_id`, `title`, `position`.
- `cards` - `column_id`, `title`, `details`, `position`.

Foreign keys use `ON DELETE CASCADE`, so deleting a user removes their board, columns and cards. `PRAGMA foreign_keys = ON` is set on every connection (SQLite has it off by default).

## Ordering

Columns and cards are ordered by an integer `position`, 0-based and kept contiguous:

- Create card: appended at the end of its column.
- Move card: removed from its old position, inserted at the new one; positions in both affected columns are renumbered.
- Delete card: positions after it shift down by one.

Each change runs in a single transaction.

## Lifecycle

- The database file is `data/app.db` (`/app/data/app.db` in the container, mounted from the host `data/` folder so it survives container restarts).
- On startup the backend creates the file and tables if they do not exist (`CREATE TABLE IF NOT EXISTS`).
- On startup, if user `user` does not exist, it is created with a board seeded from the demo data: 5 columns (Backlog, Discovery, In Progress, Review, Done) and the 8 sample cards. Seeding happens once; later restarts keep existing data.
- Deleting `data/app.db` resets everything.

## JSON shape

The API and the AI see the board in the frontend's existing `BoardData` shape:

```json
{
  "columns": [{ "id": "col-1", "title": "Backlog", "cardIds": ["card-1", "card-2"] }],
  "cards": { "card-1": { "id": "card-1", "title": "...", "details": "..." } }
}
```

Database integer ids are exposed as prefixed strings (`col-<id>`, `card-<id>`). The prefix matters: drag and drop uses a single id space for columns and cards, so a column and a card must never share an id. The backend strips the prefix when reading ids from requests.

All board queries are scoped to the signed-in user's board, so ids from another user's board return 404.
