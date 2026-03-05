/**
 * Migration 003: Create stripe_events table for webhook idempotency
 * 
 * Purpose: Track processed Stripe webhook events to prevent duplicate processing
 * Features:
 * - Event deduplication
 * - Status tracking (pending, processed, failed)
 * - Error logging
 * - Payload retention for debugging
 */

import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SQLITE_PATH || path.join(__dirname, "../data/quizall.db");

export function up(db) {
  console.log("[migration 003] Creating stripe_events table...");
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',  -- pending | processed | failed
      error TEXT,
      payload TEXT,  -- JSON of event data object
      created_at TEXT NOT NULL,
      processed_at TEXT,
      retry_count INTEGER DEFAULT 0
    );
    
    CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripe_events(status);
    CREATE INDEX IF NOT EXISTS idx_stripe_events_created ON stripe_events(created_at);
  `);
  
  console.log("[migration 003] ✅ Migration completed successfully");
}

export function down(db) {
  console.log("[migration 003] Rolling back...");
  
  db.exec(`
    DROP TABLE IF EXISTS stripe_events;
  `);
  
  console.log("[migration 003] ✅ Rollback completed");
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const command = process.argv[2];
  
  if (!command || !["up", "down"].includes(command)) {
    console.error("Usage: node 003_stripe_events.js [up|down]");
    process.exit(1);
  }
  
  const db = new Database(dbPath);
  
  try {
    if (command === "up") {
      up(db);
    } else {
      down(db);
    }
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    db.close();
  }
}
