import { timingSafeEqual } from "node:crypto";

export function requireSyncToken(req, res, next) {
  const secret = process.env.SYNC_TOKEN;
  if (!secret?.trim()) return res.status(503).json({ ok: false, error: "Admin sync not configured" });
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const actual = Buffer.from(token);
  const expected = Buffer.from(secret);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}
