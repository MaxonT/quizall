/**
 * Migration 006: Annual Coupon
 *
 * Seeds the QUIZALL-YEAR-F3C8A201 annual coupon (365-day yearly plan).
 * Safe to run multiple times — uses INSERT OR IGNORE (SQLite) / ON CONFLICT DO NOTHING (PG).
 *
 * Run with: node migrations/006_annual_coupon.js
 */

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

const ANNUAL_CODE = "QUIZALL-YEAR-F3C8A201";

if (USE_POSTGRES) {
  // ── PostgreSQL path ──────────────────────────────────────────────────
  const { default: pg } = await import("pg");
  const { Pool } = pg;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query(
      `INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
       VALUES ($1, 'yearly', 100, 365, true)
       ON CONFLICT (code) DO NOTHING`,
      [ANNUAL_CODE]
    );
    console.log(`[migration-006] ✓ Annual coupon seeded: ${ANNUAL_CODE}`);
  } catch (err) {
    console.error("[migration-006] ✗ Failed to seed annual coupon:", err.message || err);
  } finally {
    await pool.end();
  }
} else {
  // ── SQLite path ──────────────────────────────────────────────────────
  const { default: Database } = await import("better-sqlite3");
  const { default: path } = await import("path");
  const { default: fs } = await import("fs");

  const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  try {
    const existing = db.prepare("SELECT id FROM coupons WHERE code = ?").get(ANNUAL_CODE);
    if (!existing) {
      db.prepare(
        `INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
         VALUES (?, 'yearly', 100, 365, 1)`
      ).run(ANNUAL_CODE);
      console.log(`[migration-006] ✓ Annual coupon seeded: ${ANNUAL_CODE}`);
    } else {
      console.log("[migration-006] ✓ Annual coupon already exists, skipping");
    }
  } catch (err) {
    console.error("[migration-006] ✗ Failed to seed annual coupon:", err.message || err);
  } finally {
    db.close();
  }
}

console.log("[migration-006] ✅ Annual coupon migration complete!");
