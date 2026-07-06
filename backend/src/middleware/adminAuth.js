/**
 * Admin access checks — subscription_tier=admin and/or ADMIN_EMAILS allowlist.
 */

import { db } from "../lib/db.js";

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

function dbGet(sql, params = []) {
  if (USE_POSTGRES) return db.get(sql, ...params);
  return Promise.resolve(db.prepare(sql).get(...params));
}

export function parseAdminEmails() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function isAdminUser({ userId, email }) {
  const adminEmails = parseAdminEmails();
  if (email && adminEmails.includes(String(email).toLowerCase())) return true;
  if (!userId) return false;
  const row = await dbGet(`SELECT subscription_tier FROM users WHERE id = ?`, [userId]);
  return String(row?.subscription_tier || "").toLowerCase() === "admin";
}

export async function requireAdmin(req, res, next) {
  try {
    const userId = req.user?.sub;
    const email = req.user?.email;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }
    if (!(await isAdminUser({ userId, email }))) {
      return res.status(403).json({ ok: false, error: "Admin access required" });
    }
    return next();
  } catch (err) {
    console.error("[adminAuth] guard error:", err.message);
    return res.status(500).json({ ok: false, error: "Failed to validate admin access" });
  }
}
