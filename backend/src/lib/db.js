/**
 * Database Adapter - Supports both SQLite and PostgreSQL
 * Automatically selects based on environment variables:
 * - Use PostgreSQL if DATABASE_URL or DB_HOST is set
 * - Otherwise use SQLite
 */

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

let dbModule;

if (USE_POSTGRES) {
  // Dynamic import PostgreSQL module (top-level await supported in Node.js 14.8+)
  dbModule = await import('./db-pg.js');
  console.log('[quizall] Using PostgreSQL database');
  await dbModule.initializeSchema();
  await dbModule.ensureDemoUser();
} else {
  // Use SQLite (default)
  console.log('[quizall] Using SQLite database');
  
  const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
  const absoluteDBPath = path.resolve(DB_PATH);
  console.log(`[quizall] SQLite database path: ${DB_PATH}`);
  console.log(`[quizall] SQLite absolute path: ${absoluteDBPath}`);
  console.log(`[quizall] Current working directory: ${process.cwd()}`);
  
  // 确保数据库目录存在且权限正确
  const dbDir = path.dirname(absoluteDBPath);
  fs.mkdirSync(dbDir, { recursive: true, mode: 0o750 });
  
  // 设置安全的数据库选项
  const sqliteDb = new Database(absoluteDBPath, {
    fileMustExist: false,
    timeout: 5000,
    verbose: process.env.NODE_ENV === 'development' ? console.log : undefined
  });
  
  // 设置安全的SQLite配置
  sqliteDb.pragma('journal_mode = WAL');  // WAL模式提供更好的并发性
  sqliteDb.pragma('synchronous = NORMAL'); // 平衡性能和安全性
  sqliteDb.pragma('foreign_keys = ON');    // 启用外键约束
  sqliteDb.pragma('temp_store = MEMORY');  // 临时数据存储在内存中
  
  // 验证数据库连接
  try {
    sqliteDb.exec('SELECT 1');
    console.log('[quizall] ✅ SQLite database connection verified');
  } catch (error) {
    console.error('[quizall] ❌ SQLite database connection failed:', error);
    throw error;
  }
  
  // Export SQLite Database directly (synchronous API)
  // Routes use db.prepare(), db.exec(), etc. which are synchronous
  dbModule = {
    db: sqliteDb,  // Direct export of better-sqlite3 Database instance
    ensureUser: null, // Will be defined below
    ensureColumn: null,
    columnExists: null
  };
  
  // SQLite schema initialization
  sqliteDb.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  oauth_provider TEXT,
  oauth_id TEXT,
  subscription_tier TEXT DEFAULT 'free',
  subscription_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_docs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS shares (
  id TEXT PRIMARY KEY,
  doc_id TEXT NOT NULL,
  token TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  CONSTRAINT fk_shares_doc FOREIGN KEY (doc_id) REFERENCES docs(id)
);

-- Prompt spec storage (S1: Structured Spec Columns)
CREATE TABLE IF NOT EXISTS specs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  project_id TEXT,
  session_id TEXT,
  kind TEXT,
  title TEXT NOT NULL,
  summary TEXT,
  tech_stack TEXT,
  pages TEXT,
  data_model TEXT,
  constraints TEXT,
  spec_json TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  version INTEGER NOT NULL DEFAULT 1,
  completeness_score REAL DEFAULT 0.0,
  raw_idea TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_specs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS compiled_prompts (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  compiled_json TEXT NOT NULL,
  explanation TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_cp_spec FOREIGN KEY (spec_id) REFERENCES specs(id)
);

-- Question engine session state
CREATE TABLE IF NOT EXISTS question_sessions (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  initial_description TEXT NOT NULL,
  kind TEXT,
  mode TEXT DEFAULT 'deep',
  model TEXT DEFAULT 'quizall',
  language TEXT DEFAULT 'en',
  status TEXT NOT NULL,
  intent_json TEXT,
  spec_json TEXT,
  compiled_prompt_json TEXT,
  explanation TEXT,
  step INTEGER DEFAULT 0,
  is_complete INTEGER DEFAULT 0,
  spec_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CONSTRAINT fk_qs_owner FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS question_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT NOT NULL,
  options_json TEXT,
  order_index INTEGER NOT NULL,
  CONSTRAINT fk_qq_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
);

CREATE TABLE IF NOT EXISTS question_answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_qa_session FOREIGN KEY (session_id) REFERENCES question_sessions(id),
  CONSTRAINT fk_qa_question FOREIGN KEY (question_id) REFERENCES question_questions(id)
);

-- Iteration helper & error tracking (B1-B3)
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  spec_id TEXT,
  spec_version TEXT,
  model TEXT,
  status TEXT NOT NULL,
  input_blocks TEXT,
  raw_output TEXT,
  completed_at TEXT,
  metrics_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS run_errors (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  error_type TEXT,
  details TEXT,
  detected_by TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_re_run FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Prompt evaluation storage (B4-B6)
CREATE TABLE IF NOT EXISTS evaluations (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  compiled_prompt_id TEXT NOT NULL,
  run_id TEXT,
  model TEXT,
  score REAL,
  verdict TEXT,
  summary TEXT,
  details TEXT,
  metrics_json TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_eval_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
  CONSTRAINT fk_eval_cp FOREIGN KEY (compiled_prompt_id) REFERENCES compiled_prompts(id),
  CONSTRAINT fk_eval_run FOREIGN KEY (run_id) REFERENCES runs(id)
);

-- Question Engine advanced controls (Q1-Q3)
CREATE TABLE IF NOT EXISTS question_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_snapshot_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
);

CREATE TABLE IF NOT EXISTS question_actions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  action TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_action_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
);

-- Outcome Runner (O1-O3)
CREATE TABLE IF NOT EXISTS outcome_runs (
  id TEXT PRIMARY KEY,
  spec_id TEXT,
  run_id TEXT,
  task TEXT NOT NULL,
  input TEXT,
  style TEXT,
  constraints TEXT,
  n INTEGER NOT NULL,
  model TEXT,
  status TEXT NOT NULL,
  best_candidate_id TEXT,
  request_json TEXT,
  result_json TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_outcome_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
  CONSTRAINT fk_outcome_run FOREIGN KEY (run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS outcome_candidates (
  id TEXT PRIMARY KEY,
  outcome_run_id TEXT NOT NULL,
  candidate_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  llm_score REAL,
  final_score REAL,
  tests_passed INTEGER,
  tests_json TEXT,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_cand_outcome FOREIGN KEY (outcome_run_id) REFERENCES outcome_runs(id)
);

-- Best Prompt Pipeline: Candidate Prompts (for Multi-Agent generation)
CREATE TABLE IF NOT EXISTS candidate_prompts (
  id TEXT PRIMARY KEY,
  spec_id TEXT NOT NULL,
  session_id TEXT,
  agent TEXT NOT NULL,
  model TEXT NOT NULL,
  content TEXT NOT NULL,
  
  -- Metrics (filled later by Metrics & Scoring)
  clarity REAL,
  coherence REAL,
  style_match REAL,
  safety REAL,
  token_cost INTEGER,
  risk REAL,
  pass_rate REAL,
  f1_score REAL,
  composite_score REAL,
  metrics_json TEXT,
  
  created_at TEXT NOT NULL,
  CONSTRAINT fk_cp_spec FOREIGN KEY (spec_id) REFERENCES specs(id),
  CONSTRAINT fk_cp_session FOREIGN KEY (session_id) REFERENCES question_sessions(id)
);

-- Plan usage tracking for enforcing daily limits
CREATE TABLE IF NOT EXISTS plan_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  feature_type TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CONSTRAINT fk_usage_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_plan_usage_user_date ON plan_usage(user_id, date, feature_type);

-- Timezone-aware daily refresh tracking
CREATE TABLE IF NOT EXISTS user_daily_refresh_tracker (
  user_id TEXT PRIMARY KEY,
  last_daily_refresh_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tracker_updated ON user_daily_refresh_tracker(updated_at);

-- ─── Exemplar Bank (Pipeline v2) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS exemplar_bank (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  spec_id         TEXT,
  run_id          TEXT,
  candidate_id    TEXT,
  mode            TEXT NOT NULL DEFAULT 'standard',
  prompt_text     TEXT NOT NULL,
  task_domain     TEXT,
  spec_summary    TEXT,
  language        TEXT DEFAULT 'en',
  composite_score REAL NOT NULL,
  completeness    REAL,
  clarity         REAL,
  specificity     REAL,
  structure       REAL,
  coherence       REAL,
  creativity      REAL,
  safety          REAL,
  efficiency      REAL,
  usage_count     INTEGER DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exemplar_user    ON exemplar_bank(user_id);
CREATE INDEX IF NOT EXISTS idx_exemplar_domain  ON exemplar_bank(task_domain);
CREATE INDEX IF NOT EXISTS idx_exemplar_score   ON exemplar_bank(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_exemplar_mode    ON exemplar_bank(mode);
CREATE INDEX IF NOT EXISTS idx_exemplar_created ON exemplar_bank(created_at);

-- ─── Coupons ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'monthly',
  max_redemptions INTEGER NOT NULL DEFAULT 10,
  times_redeemed INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_coupon_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT uq_coupon_user UNIQUE (coupon_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);

CREATE TABLE IF NOT EXISTS oauth_pkce_states (
  state TEXT PRIMARY KEY,
  code_verifier TEXT NOT NULL,
  provider TEXT NOT NULL,
  return_origin TEXT,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oauth_pkce_expires ON oauth_pkce_states(expires_at);
`);

  // SQLite helper functions
  function ensureColumn(table, column, definition) {
    const columns = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((col) => col.name === column);
    if (!exists) {
      sqliteDb.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
  }

  // Backfill newly added columns
  ensureColumn("question_sessions", "mode", "TEXT DEFAULT 'deep'");
  ensureColumn("question_sessions", "model", "TEXT DEFAULT 'quizall'");
  ensureColumn("question_sessions", "language", "TEXT DEFAULT 'en'");
  ensureColumn("question_sessions", "step", "INTEGER DEFAULT 0");
  ensureColumn("question_sessions", "is_complete", "INTEGER DEFAULT 0");
  ensureColumn("question_sessions", "spec_id", "TEXT");
  ensureColumn("specs", "completeness_score", "REAL DEFAULT 0.0");
  ensureColumn("specs", "raw_idea", "TEXT");
  ensureColumn("candidate_prompts", "metrics_json", "TEXT");
  ensureColumn("users", "oauth_provider", "TEXT");
  ensureColumn("users", "oauth_id", "TEXT");
  ensureColumn("users", "timezone", "TEXT DEFAULT 'UTC'");
  ensureColumn("users", "timezone_updated_at", "TEXT");
  ensureColumn("runs", "completed_at", "TEXT");
  ensureColumn("runs", "metrics_json", "TEXT");
  ensureColumn("runs", "rejection_reason", "TEXT");
  ensureColumn("evaluations", "metrics_json", "TEXT");

  // ─── Exemplar FTS5 (separate exec for VIRTUAL TABLE compat) ──────────
  try {
    sqliteDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS exemplar_fts USING fts5(
        id UNINDEXED,
        prompt_text,
        spec_summary,
        task_domain,
        content='exemplar_bank',
        content_rowid='rowid'
      );

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
  } catch (ftsErr) {
    // FTS5 may not be available in all SQLite builds — log but don't crash
    console.warn("[quizall] FTS5 setup skipped (not critical):", ftsErr.message);
  }

  // Ensure demo user exists
  try {
    sqliteDb.prepare(`
      INSERT OR IGNORE INTO users (id, email, created_at)
      VALUES ('demo-user', 'demo@quizall.local', datetime('now'))
    `).run();
    console.log("[quizall] Demo user ensured");
  } catch (err) {
    console.error("[quizall] Failed to ensure demo user:", err);
  }

  // Seed the friends & family coupon
  try {
    sqliteDb.prepare(`
      INSERT OR IGNORE INTO coupons (code, plan, max_redemptions, duration_days, active)
      VALUES ('QUIZALL-DEE1636310A6', 'monthly', 10, 30, 1)
    `).run();
    console.log("[quizall] Friends & family coupon ensured");
  } catch (err) {
    console.error("[quizall] Failed to seed coupon:", err);
  }

  // SQLite ensureUser function
  dbModule.ensureUser = function(userId, email = null) {
    try {
      const userEmail = email || `${userId}@quizall.local`;
      sqliteDb.prepare(`
        INSERT OR IGNORE INTO users (
          id,
          email,
          password_hash,
          subscription_tier,
          subscription_active,
          created_at,
          updated_at
        )
        VALUES (?, ?, NULL, 'free', 1, datetime('now'), datetime('now'))
      `).run(userId, userEmail);
    } catch (err) {
      console.error(`[quizall] Failed to ensure user ${userId}:`, err);
    }
  };

  dbModule.ensureColumn = ensureColumn;
  dbModule.columnExists = function(table, column) {
    const columns = sqliteDb.prepare(`PRAGMA table_info(${table})`).all();
    return columns.some((col) => col.name === column);
  };
}

export const db = dbModule.db;
export const ensureUser = dbModule.ensureUser;
export const ensureColumn = dbModule.ensureColumn;
export const columnExists = dbModule.columnExists;
