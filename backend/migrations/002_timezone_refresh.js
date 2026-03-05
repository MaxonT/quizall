/**
 * Migration 002: Timezone-aware Daily Refresh Tracking
 * 
 * This migration adds support for per-user timezone-aware daily token refresh.
 * Instead of refreshing all users at a fixed UTC time, each user's tokens 
 * refresh based on their local timezone midnight.
 * 
 * Run with: node migrations/002_timezone_refresh.js
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

console.log("[migration-002] Starting timezone-aware refresh tracking migration...");

// =============================================
// 1. User Daily Refresh Tracker Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS user_daily_refresh_tracker (
  user_id TEXT PRIMARY KEY,
  last_daily_refresh_date TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tracker_updated ON user_daily_refresh_tracker(updated_at);
`);
console.log("[migration-002] ✓ user_daily_refresh_tracker table created");

console.log("[migration-002] ✅ Migration completed successfully!");

db.close();
