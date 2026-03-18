/**
 * Migration 006: Create flow topic refinement + file analysis cache tables
 *
 * Adds:
 * - topic_revisions: stores topic changes from auto/chat/manual refinement paths
 * - file_analysis_cache: stores text extraction/OCR summaries for uploaded assets
 *
 * Run with: node migrations/006_create_flow_topics.js
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

console.log("[migration-006] Starting create-flow schema migration...");

db.exec(`
CREATE TABLE IF NOT EXISTS topic_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  before_topics_json TEXT NOT NULL,
  after_topics_json TEXT NOT NULL,
  diff_json TEXT,
  created_at TEXT NOT NULL,

  CONSTRAINT fk_topic_revisions_project FOREIGN KEY (project_id) REFERENCES study_projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_topic_revisions_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_topic_revisions_project ON topic_revisions(project_id, created_at);

CREATE TABLE IF NOT EXISTS file_analysis_cache (
  id TEXT PRIMARY KEY,
  project_file_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  extracted_text TEXT,
  metadata_json TEXT,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  CONSTRAINT fk_file_analysis_cache_project_file FOREIGN KEY (project_file_id) REFERENCES project_files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_analysis_cache_file ON file_analysis_cache(project_file_id, updated_at);
`);

console.log("[migration-006] ✓ topic_revisions table created");
console.log("[migration-006] ✓ file_analysis_cache table created");

db.close();
console.log("[migration-006] ✅ Migration complete!");
