/**
 * Migration 007: Tester Pro Coupon
 *
 * Seeds QUIZALL-TESTER-PRO — monthly (Pro) plan, 30 days, 20 redemptions.
 * Safe to run multiple times — INSERT OR IGNORE / ON CONFLICT DO NOTHING.
 *
 * Run with: node migrations/007_tester_coupon.js
 */

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

const TESTER_CODE = "QUIZALL-TESTER-PRO";

if (USE_POSTGRES) {
  const { default: pg } = await import("pg");
  const { Pool } = pg;

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  });

  try {
    await pool.query(
      `INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
       VALUES ($1, 'monthly', 20, 30, true)
       ON CONFLICT (code) DO NOTHING`,
      [TESTER_CODE]
    );
    console.log(`[migration-007] ✓ Tester Pro coupon seeded: ${TESTER_CODE}`);
  } catch (err) {
    console.error("[migration-007] ✗ Failed to seed tester coupon:", err.message || err);
  } finally {
    await pool.end();
  }
} else {
  const { default: Database } = await import("better-sqlite3");
  const { default: path } = await import("path");
  const { default: fs } = await import("fs");

  const DB_PATH = process.env.SQLITE_PATH || "./data/app.db";
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  try {
    const existing = db.prepare("SELECT id FROM coupons WHERE code = ?").get(TESTER_CODE);
    if (!existing) {
      db.prepare(
        `INSERT INTO coupons (code, plan, max_redemptions, duration_days, active)
         VALUES (?, 'monthly', 20, 30, 1)`
      ).run(TESTER_CODE);
      console.log(`[migration-007] ✓ Tester Pro coupon seeded: ${TESTER_CODE}`);
    } else {
      console.log("[migration-007] ✓ Tester Pro coupon already exists, skipping");
    }
  } catch (err) {
    console.error("[migration-007] ✗ Failed to seed tester coupon:", err.message || err);
  } finally {
    db.close();
  }
}

console.log("[migration-007] ✅ Tester coupon migration complete!");
