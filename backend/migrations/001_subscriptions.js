/**
 * Migration 001: Subscriptions & Token Ledger Schema
 * 
 * This migration adds all the tables required for:
 * - Stripe customer management
 * - Subscription tracking
 * - Token-based billing (ledger)
 * - Webhook idempotency
 * - Trial anti-abuse controls
 * 
 * Run with: node migrations/001_subscriptions.js
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

console.log("[migration-001] Starting subscriptions schema migration...");

// =============================================
// 1. Stripe Customers Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS stripe_customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_stripe_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_stripe_customers_user ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe ON stripe_customers(stripe_customer_id);
`);
console.log("[migration-001] ✓ stripe_customers table created");

// =============================================
// 2. Subscriptions Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  
  -- Subscription status: none, trialing, active, past_due, canceled, unpaid
  status TEXT NOT NULL DEFAULT 'none',
  
  -- Plan: monthly, yearly, trial
  plan TEXT,
  
  -- Stripe Price ID
  price_id TEXT,
  
  -- Period timestamps
  period_start TEXT,
  period_end TEXT,
  trial_start TEXT,
  trial_end TEXT,
  
  -- Cancellation
  cancel_at_period_end INTEGER DEFAULT 0,
  canceled_at TEXT,
  
  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
`);
console.log("[migration-001] ✓ subscriptions table created");

// =============================================
// 3. Token Ledger Table (Source of Truth)
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS token_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  
  -- Bucket type: daily_free, monthly, trial_base, adjustment
  bucket TEXT NOT NULL,
  
  -- Positive = grant, Negative = spend
  tokens_change INTEGER NOT NULL,
  
  -- Running balance after this transaction
  balance_after INTEGER NOT NULL,
  
  -- For trial_base and daily_free: when does this grant expire?
  expires_at TEXT,
  
  -- Source of change: webhook, cron, admin, api_usage
  source TEXT NOT NULL,
  
  -- Reason for audit trail
  reason TEXT,
  
  -- Reference to related entities
  run_id TEXT,
  subscription_id TEXT,
  stripe_event_id TEXT,
  
  -- Admin who made adjustment (if applicable)
  admin_actor TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  CONSTRAINT fk_ledger_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_user ON token_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_token_ledger_bucket ON token_ledger(user_id, bucket);
CREATE INDEX IF NOT EXISTS idx_token_ledger_created ON token_ledger(created_at);
CREATE INDEX IF NOT EXISTS idx_token_ledger_expires ON token_ledger(expires_at);
`);
console.log("[migration-001] ✓ token_ledger table created");

// =============================================
// 4. Token Balances Cache (Read Optimization)
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS token_balances_cache (
  user_id TEXT PRIMARY KEY,
  daily_free_remaining INTEGER NOT NULL DEFAULT 0,
  monthly_remaining INTEGER NOT NULL DEFAULT 0,
  trial_base_remaining INTEGER NOT NULL DEFAULT 0,
  total_remaining INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  CONSTRAINT fk_balance_user FOREIGN KEY (user_id) REFERENCES users(id)
);
`);
console.log("[migration-001] ✓ token_balances_cache table created");

// =============================================
// 5. Stripe Events Table (Idempotency)
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS stripe_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  
  -- Processing status: pending, processed, failed
  status TEXT NOT NULL DEFAULT 'pending',
  
  -- Error message if failed
  error TEXT,
  
  -- Raw event payload (JSON)
  payload TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_stripe_events_event_id ON stripe_events(event_id);
CREATE INDEX IF NOT EXISTS idx_stripe_events_type ON stripe_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stripe_events_status ON stripe_events(status);
`);
console.log("[migration-001] ✓ stripe_events table created");

// =============================================
// 6. Trial Anti-Abuse Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS trial_abuse_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  
  -- Risk indicators
  ip_address TEXT,
  device_fingerprint TEXT,
  email_domain TEXT,
  
  -- Risk score (0-100)
  risk_score INTEGER DEFAULT 0,
  
  -- Flags
  is_disposable_email INTEGER DEFAULT 0,
  is_high_velocity_ip INTEGER DEFAULT 0,
  is_duplicate_fingerprint INTEGER DEFAULT 0,
  requires_payment_method INTEGER DEFAULT 0,
  
  -- Actions taken
  trial_blocked INTEGER DEFAULT 0,
  blocked_reason TEXT,
  
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  CONSTRAINT fk_abuse_user FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_trial_abuse_user ON trial_abuse_checks(user_id);
CREATE INDEX IF NOT EXISTS idx_trial_abuse_ip ON trial_abuse_checks(ip_address);
CREATE INDEX IF NOT EXISTS idx_trial_abuse_fingerprint ON trial_abuse_checks(device_fingerprint);
`);
console.log("[migration-001] ✓ trial_abuse_checks table created");

// =============================================
// 7. IP Rate Limiting Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS ip_rate_limits (
  ip_address TEXT PRIMARY KEY,
  registration_count INTEGER NOT NULL DEFAULT 0,
  trial_count INTEGER NOT NULL DEFAULT 0,
  last_registration TEXT,
  last_trial TEXT,
  blocked_until TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);
console.log("[migration-001] ✓ ip_rate_limits table created");

// =============================================
// 8. Add columns to users table
// =============================================
function ensureColumn(table, column, definition) {
  try {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    const exists = columns.some((col) => col.name === column);
    if (!exists) {
      db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
      console.log(`[migration-001] ✓ Added ${column} to ${table}`);
    }
  } catch (err) {
    if (!/duplicate column name/i.test(err.message)) {
      console.error(`[migration-001] Error adding ${column} to ${table}:`, err);
    }
  }
}

ensureColumn("users", "email_verified", "INTEGER DEFAULT 0");
ensureColumn("users", "email_verified_at", "TEXT");
ensureColumn("users", "trial_used", "INTEGER DEFAULT 0");
ensureColumn("users", "trial_started_at", "TEXT");

// =============================================
// 9. Add token tracking to runs table
// =============================================
ensureColumn("runs", "input_tokens", "INTEGER");
ensureColumn("runs", "output_tokens", "INTEGER");
ensureColumn("runs", "total_tokens", "INTEGER");
ensureColumn("runs", "credits_spent", "INTEGER");
ensureColumn("runs", "multiplier", "REAL DEFAULT 1.0");
ensureColumn("runs", "multiplier_reason", "TEXT");

console.log("[migration-001] ✅ Migration completed successfully!");

db.close();
