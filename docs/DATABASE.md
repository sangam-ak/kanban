# Database

SQLite, accessed with Python's standard library `sqlite3` (no ORM). Full schema: [schema.json](schema.json).

## Tables

```
users 1──* boards 1──* columns 1──* cards
                  └──* activity
```

- `users` - `id`, `username` (unique), `password_hash` (scrypt, `<salt hex>$<hash hex>`; empty means the user cannot sign in).
- `boards` - `user_id`, `name`, `position` (0-based order of the user's boards, kept contiguous). A user can have any number of boards, including none.
- `columns` - `board_id`, `title`, `position`.
- `cards` - `column_id`, `title`, `details`, `position`, `priority` (`low` / `medium` / `high` or NULL), `due_date` (ISO `YYYY-MM-DD` or NULL), `labels` (comma-separated, `''` for none).

- `activity` - `board_id`, `action` (e.g. `card.create`), `summary` (human-readable), `created_at` (UTC). One row per change, written by `board.py` in the same transaction; no user column because a board has a single owner.

Foreign keys use `ON DELETE CASCADE`, so deleting a user removes their board, columns and cards. `PRAGMA foreign_keys = ON` is set on every connection (SQLite has it off by default).

## Ordering

Columns and cards are ordered by an integer `position`, 0-based and kept contiguous:

- Create column or card: appended at the end of the board or column.
- Move column: removed and reinserted at the new position (clamped); the board's columns are renumbered.
- Delete column: only allowed when it has no cards; later columns shift down by one.
- Move card: removed from its old position, inserted at the new one; positions in both affected columns are renumbered.
- Delete card: positions after it shift down by one.

Each change runs in a single transaction.

## Lifecycle

- The database file is `data/app.db` (`/app/data/app.db` in the container, mounted from the host `data/` folder so it survives container restarts).
- On startup the backend creates the file and tables if they do not exist (`CREATE TABLE IF NOT EXISTS`), then applies pending migrations (`db.MIGRATIONS`, tracked with `PRAGMA user_version`), so an existing database upgrades in place.
- Migrations: 1 adds `users.password_hash`; 2 rebuilds `boards` without `UNIQUE(user_id)` and adds `name` (existing boards become "My Board") and `position`; 3 adds `cards.priority`, `cards.due_date` and `cards.labels`; 4 creates `activity` (indexed by `board_id, id`).
- On startup, if the demo user `user` does not exist, it is created with password `password` and a board named "My Board" with a board seeded from the demo data: 5 columns (Backlog, Discovery, In Progress, Review, Done) and the 8 sample cards. Seeding happens once; later restarts keep existing data.
- Registered users get the same seeded board. Boards created later get the 5 default columns and no cards.
- Deleting `data/app.db` resets everything.

## JSON shape

The API and the AI see the board in the frontend's existing `BoardData` shape:

```json
{
  "columns": [{ "id": "col-1", "title": "Backlog", "cardIds": ["card-1", "card-2"] }],
  "cards": {
    "card-1": {
      "id": "card-1", "title": "...", "details": "...",
      "priority": "high", "dueDate": "2026-11-05", "labels": ["design"]
    }
  }
}
```

Database integer ids are exposed as prefixed strings (`board-<id>`, `col-<id>`, `card-<id>`). The prefix matters: drag and drop uses a single id space for columns and cards, so a column and a card must never share an id. The backend strips the prefix when reading ids from requests.

Every board route takes the board id in its path; boards owned by another user, and column or card ids from another board, return 404.
