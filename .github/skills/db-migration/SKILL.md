---
name: db-migration
description: >
  Add a new table or column to QuizAll's database.
  Use when: "add table", "add column", "new DB table", "schema change", "migrate",
  "create table", "ALTER TABLE". Handles SQLite (dev) + PostgreSQL (prod) simultaneously.
---

# db-migration Skill

QuizAll uses **SQLite in development** and **PostgreSQL in production**. Every schema change must be applied to **both** files. This skill documents the exact pattern.

## Files to edit for every schema change

| File | What to add |
|------|-------------|
| `backend/src/lib/db.js` | `CREATE TABLE IF NOT EXISTS` inside the `sqliteDb.exec()` block |
| `backend/src/lib/db-pg.js` | Same DDL inside `initializeSchema()`, **plus** an idempotent `ALTER TABLE … ADD COLUMN IF NOT EXISTS` in the migration block below the schema string |

---

## Adding a new TABLE

### 1. `backend/src/lib/db.js` — SQLite block

Find the large `sqliteDb.exec(` call and append before its closing backtick:

```sql
CREATE TABLE IF NOT EXISTS my_new_table (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  data TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
```

### 2. `backend/src/lib/db-pg.js` — inside `initializeSchema()` schema string

Append **inside** the template literal (before the closing backtick of the `schema` constant):

```sql
CREATE TABLE IF NOT EXISTS my_new_table (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  data TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_my_new_table_user ON my_new_table(user_id);
```

### 3. `backend/src/lib/db-pg.js` — idempotent migration block

After the existing `await db.exec(...)` calls (just before `console.log('[quizall] PostgreSQL schema initialized')`):

```js
await db.exec(`
  CREATE TABLE IF NOT EXISTS my_new_table (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    data TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);
await db.exec("CREATE INDEX IF NOT EXISTS idx_my_new_table_user ON my_new_table(user_id);");
```

---

## Adding a new COLUMN to an existing table

### SQLite (`db.js`)

Find or add a call to `ensureColumn`:

```js
ensureColumn("existing_table", "new_column", "TEXT DEFAULT ''");
```

`ensureColumn` is already defined in `db.js` and uses `ALTER TABLE … ADD COLUMN IF NOT EXISTS`.

### PostgreSQL (`db-pg.js`)

Add to the migration block:

```js
await db.exec("ALTER TABLE existing_table ADD COLUMN IF NOT EXISTS new_column TEXT DEFAULT '';");
```

---

## Query helpers — always use these

```js
import { dbGet, dbRun, dbAll, USE_POSTGRES, DB_TRUE, dbBool } from "../lib/dbHelpers.js";
```

- `DB_TRUE` = `true` (PG) or `1` (SQLite)
- `DB_FALSE` = `false` (PG) or `0` (SQLite)
- `dbBool(v)` — converts any truthy value to the DB-correct boolean

---

## Checklist

- [ ] Added `CREATE TABLE IF NOT EXISTS` to `db.js` (SQLite block)
- [ ] Added `CREATE TABLE IF NOT EXISTS` to `initializeSchema()` schema string in `db-pg.js`
- [ ] Added idempotent `CREATE TABLE IF NOT EXISTS` to the migration block in `db-pg.js`
- [ ] Added any needed indexes in both files
- [ ] Using `dbGet/dbRun/dbAll` (never `db.prepare()`) in route code
- [ ] Using `DB_TRUE/DB_FALSE/dbBool` for boolean columns
