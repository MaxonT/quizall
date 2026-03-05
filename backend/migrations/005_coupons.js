/**
 * Migration 005: Coupons Table
 * 
 * Adds a coupons table and a coupon_redemptions table for tracking usage.
 * Seeds one initial coupon for friends & family.
 * 
 * Run with: node migrations/005_coupons.js
 */

import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

console.log("[migration-005] Starting coupons schema migration...");

// =============================================
// 1. Coupons Table
// =============================================
db.exec(`
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
`);
console.log("[migration-005] ✓ coupons table created");

// =============================================
// 2. Coupon Redemptions Table
// =============================================
db.exec(`
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
  CONSTRAINT fk_coupon FOREIGN KEY (coupon_id) REFERENCES coupons(id),
  CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT uq_coupon_user UNIQUE (coupon_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_user ON coupon_redemptions(user_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon ON coupon_redemptions(coupon_id);
`);
console.log("[migration-005] ✓ coupon_redemptions table created");

// =============================================
// 3. Seed the initial friends & family coupon
// =============================================
const existing = db.prepare("SELECT id FROM coupons WHERE code = ?").get("QUIZALL-DEE1636310A6");
if (!existing) {
  db.prepare(`
    INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
    VALUES (?, 'monthly', 10, 30, 1)
  `).run("QUIZALL-DEE1636310A6");
  console.log("[migration-005] ✓ Seeded friends & family coupon: QUIZALL-DEE1636310A6");
} else {
  console.log("[migration-005] ✓ Coupon already exists, skipping seed");
}

db.close();
console.log("[migration-005] ✅ Coupons migration complete!");
