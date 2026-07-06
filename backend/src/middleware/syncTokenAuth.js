/**
 * Protects /api/admin/* — requires SYNC_TOKEN (mandatory in production).
 */

export function requireSyncToken(req, res, next) {
  const syncToken = process.env.SYNC_TOKEN;
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && !syncToken) {
    return res.status(503).json({ ok: false, error: "Admin sync not configured" });
  }

  if (!syncToken) {
    if (!isProd) return next();
    return res.status(503).json({ ok: false, error: "Admin sync not configured" });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader.replace("Bearer ", "");
  if (token !== syncToken) {
    return res.status(401).json({ ok: false, error: "Unauthorized" });
  }
  return next();
}
