/**
 * Migration 002: Checkout Sessions & Analytics
 * 
 * Adds tables for:
 * - checkout_sessions: Track Stripe checkout sessions with idempotency
 * - analytics_events: Track subscription funnel events
 */

import Database from "better-sqlite3";

export function up(db) {
  console.log("[migration 002] Creating checkout_sessions table...");
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkout_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      stripe_session_id TEXT UNIQUE,
      session_url TEXT,
      plan TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      idempotency_key TEXT,
      stripe_subscription_id TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_user ON checkout_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_status ON checkout_sessions(status);
    CREATE INDEX IF NOT EXISTS idx_checkout_sessions_created ON checkout_sessions(created_at);
  `);
  
  console.log("[migration 002] Creating analytics_events table...");
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event TEXT NOT NULL,
      user_id TEXT,
      session_id TEXT,
      properties TEXT,
      created_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON analytics_events(event);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON analytics_events(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON analytics_events(created_at);
  `);
  
  console.log("[migration 002] Enhancing stripe_events table...");
  
  // Check if stripe_events table exists
  const tableExists = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name='stripe_events'
  `).get();
  
  if (tableExists) {
    // Check if columns already exist before adding
    const columns = db.prepare("PRAGMA table_info(stripe_events)").all();
    const hasStatus = columns.some(col => col.name === 'status');
    const hasError = columns.some(col => col.name === 'error');
    const hasRetryCount = columns.some(col => col.name === 'retry_count');
    
    if (!hasStatus) {
      db.exec(`ALTER TABLE stripe_events ADD COLUMN status TEXT DEFAULT 'completed';`);
    }
    
    if (!hasError) {
      db.exec(`ALTER TABLE stripe_events ADD COLUMN error TEXT;`);
    }

    if (!hasRetryCount) {
      db.exec(`ALTER TABLE stripe_events ADD COLUMN retry_count INTEGER DEFAULT 0;`);
    }
  } else {
    console.log("[migration 002] stripe_events table does not exist, skipping enhancement...");
  }
  
  console.log("[migration 002] ✅ Migration completed successfully");
}

export function down(db) {
  console.log("[migration 002] Rolling back...");
  
  db.exec(`
    DROP TABLE IF EXISTS checkout_sessions;
    DROP TABLE IF EXISTS analytics_events;
  `);
  
  // Note: Cannot easily remove columns from stripe_events in SQLite
  // They will remain but be unused after rollback
  
  console.log("[migration 002] ✅ Rollback completed");
}

// CLI runner
if (import.meta.url === `file://${process.argv[1]}`) {
  const dbPath = process.env.SQLITE_PATH || "./data/quizall.db";
  const db = new Database(dbPath);
  
  const command = process.argv[2];
  if (command === 'up') {
    up(db);
  } else if (command === 'down') {
    down(db);
  } else {
    console.log('Usage: node 002_checkout_sessions.js [up|down]');
    process.exit(1);
  }
  
  db.close();
}
