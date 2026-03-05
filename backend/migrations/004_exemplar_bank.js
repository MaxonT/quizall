/**
 * Migration 004: Create exemplar_bank table for high-quality prompt exemplars
 *
 * Purpose: Store successful prompts that scored above threshold so the pipeline
 * can retrieve similar exemplars as few-shot context during generation.
 *
 * Features:
 * - Links exemplar to spec, run, and candidate
 * - Stores composite score + per-dimension metrics
 * - FTS5 virtual table for fast semantic-keyword search
 * - Auto-populated by pipeline when composite score ≥ 80
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "../data/quizall.db");

export function up(db) {
  console.log("[migration 004] Creating exemplar_bank and exemplar_fts tables...");

  db.exec(`
    -- Main exemplar storage
    CREATE TABLE IF NOT EXISTS exemplar_bank (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      spec_id       TEXT,
      run_id        TEXT,
      candidate_id  TEXT,
      mode          TEXT NOT NULL DEFAULT 'standard',

      -- The prompt text that achieved high score
      prompt_text   TEXT NOT NULL,

      -- Source spec summary (helps search & display)
      task_domain   TEXT,          -- e.g. "copywriting", "code-review", "translation"
      spec_summary  TEXT,          -- short human-readable summary of the original spec
      language      TEXT DEFAULT 'en',

      -- Quality scores (pipeline v2 8-dim)
      composite_score REAL NOT NULL,
      completeness    REAL,
      clarity         REAL,
      specificity     REAL,
      structure       REAL,
      coherence       REAL,
      creativity      REAL,
      safety          REAL,
      efficiency      REAL,

      -- Lifecycle
      usage_count   INTEGER DEFAULT 0,       -- how often retrieved as exemplar
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_exemplar_user        ON exemplar_bank(user_id);
    CREATE INDEX IF NOT EXISTS idx_exemplar_domain      ON exemplar_bank(task_domain);
    CREATE INDEX IF NOT EXISTS idx_exemplar_score       ON exemplar_bank(composite_score DESC);
    CREATE INDEX IF NOT EXISTS idx_exemplar_mode        ON exemplar_bank(mode);
    CREATE INDEX IF NOT EXISTS idx_exemplar_created     ON exemplar_bank(created_at);

    -- FTS5 for keyword search across prompt text and spec summary
    CREATE VIRTUAL TABLE IF NOT EXISTS exemplar_fts USING fts5(
      id UNINDEXED,
      prompt_text,
      spec_summary,
      task_domain,
      content='exemplar_bank',
      content_rowid='rowid'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS exemplar_fts_insert AFTER INSERT ON exemplar_bank BEGIN
      INSERT INTO exemplar_fts(rowid, id, prompt_text, spec_summary, task_domain)
      VALUES (new.rowid, new.id, new.prompt_text, new.spec_summary, new.task_domain);
    END;

    CREATE TRIGGER IF NOT EXISTS exemplar_fts_delete AFTER DELETE ON exemplar_bank BEGIN
      INSERT INTO exemplar_fts(exemplar_fts, rowid, id, prompt_text, spec_summary, task_domain)
      VALUES ('delete', old.rowid, old.id, old.prompt_text, old.spec_summary, old.task_domain);
    END;

    CREATE TRIGGER IF NOT EXISTS exemplar_fts_update AFTER UPDATE ON exemplar_bank BEGIN
      INSERT INTO exemplar_fts(exemplar_fts, rowid, id, prompt_text, spec_summary, task_domain)
      VALUES ('delete', old.rowid, old.id, old.prompt_text, old.spec_summary, old.task_domain);
      INSERT INTO exemplar_fts(rowid, id, prompt_text, spec_summary, task_domain)
      VALUES (new.rowid, new.id, new.prompt_text, new.spec_summary, new.task_domain);
    END;
  `);

  console.log("[migration 004] ✅ exemplar_bank + exemplar_fts created successfully");
}

export function down(db) {
  console.log("[migration 004] Rolling back...");
  db.exec(`
    DROP TRIGGER IF EXISTS exemplar_fts_update;
    DROP TRIGGER IF EXISTS exemplar_fts_delete;
    DROP TRIGGER IF EXISTS exemplar_fts_insert;
    DROP TABLE IF EXISTS exemplar_fts;
    DROP TABLE IF EXISTS exemplar_bank;
  `);
  console.log("[migration 004] ✅ Rollback completed");
}

// Allow standalone execution: node migrations/004_exemplar_bank.js
if (process.argv[1] && process.argv[1].includes("004_exemplar_bank")) {
  const db = new Database(dbPath, { verbose: console.log });
  db.pragma("journal_mode = WAL");
  try {
    up(db);
  } finally {
    db.close();
  }
}
