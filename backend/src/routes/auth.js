import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { dbGet, dbRun, DB_TRUE } from "../lib/dbHelpers.js";
import { getNextLocalMidnightIso, normalizeTimeZone } from "../lib/timezone.js";
import {
  isDisposableEmail,
  isRegistrationRateLimited,
  incrementRegistrationCount,
} from "../lib/trialAntiAbuse.js";

export const authRouter = Router();

const TOKEN_SECRET = process.env.JWT_SECRET;
if (!TOKEN_SECRET) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[quizall] WARNING: JWT_SECRET not set. Set JWT_SECRET before deploying.");
    throw new Error("[quizall] FATAL: JWT_SECRET must be set (even in development).");
  } else {
    throw new Error("[quizall] FATAL: JWT_SECRET must be set in production.");
  }
}
const JWT_VERIFY_OPTIONS = { algorithms: ["HS256"] };
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-attack-prevention", BCRYPT_ROUNDS);
const EMAIL_REGEX = /^[a-zA-Z0-9_%+-]+(\.[a-zA-Z0-9_%+-]+)*@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}$/;

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function buildUserPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone || "UTC",
    subscription: {
      tier: row.subscription_tier || "free",
      isActive: row.subscription_active === 1 || row.subscription_active === true
    }
  };
}

function createAuthToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    TOKEN_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
}

function sendAuthResponse(res, row) {
  const user = buildUserPayload(row);
  if (!user) return res.status(500).json({ ok: false, error: "User data unavailable" });
  const token = createAuthToken(user);
  return res.json({ ok: true, token, user });
}

function clientIp(req) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

authRouter.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "Email is required" });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "Email is invalid" });
    }
    if (isDisposableEmail(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "Disposable email addresses are not allowed" });
    }
    const ipAddress = clientIp(req);
    if (await isRegistrationRateLimited(ipAddress)) {
      return res.status(429).json({ ok: false, error: "Too many registrations from this network. Try again tomorrow." });
    }
    if (!password || typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    const existing = await dbGet("SELECT id FROM users WHERE email = ?", [normalizedEmail]);
    if (existing) {
      return res.status(409).json({ ok: false, error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = nanoid(16);
    const now = new Date().toISOString();

    await dbRun(
      `INSERT INTO users (id, email, password_hash, subscription_tier, subscription_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, normalizedEmail, passwordHash, "free", DB_TRUE, now, now]
    );

    const row = await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
    await incrementRegistrationCount(ipAddress);
    return sendAuthResponse(res, row);
  } catch (err) {
    console.error("[quizall] register error", err);
    return res.status(500).json({ ok: false, error: "Registration failed" });
  }
});

authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, error: "Email is required" });
    }
    const normalizedEmail = normalizeEmail(email);
    if (!EMAIL_REGEX.test(normalizedEmail)) {
      return res.status(400).json({ ok: false, error: "Email is invalid" });
    }
    if (!password || typeof password !== "string") {
      return res.status(400).json({ ok: false, error: "Password is required" });
    }

    const row = await dbGet("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
    const hashToCompare = row?.password_hash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);
    const credentialsValid = !!row && valid;

    if (!credentialsValid) {
      return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    return sendAuthResponse(res, row);
  } catch (err) {
    console.error("[quizall] login error", err);
    return res.status(500).json({ ok: false, error: "Login failed" });
  }
});

authRouter.post("/logout", requireAuth, (_req, res) => {
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const row = await dbGet("SELECT * FROM users WHERE id = ?", [req.user.sub]);
    if (!row) {
      // 返回 404 而非 401，避免前端误清 token 导致 OAuth 用户被登出
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    return res.json({ ok: true, user: buildUserPayload(row) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to get user" });
  }
});

authRouter.put("/timezone", requireAuth, async (req, res) => {
  const userId = req.user.sub;
  const requested = req.body?.timezone;
  const source = req.body?.source === "auto" ? "auto" : "manual";
  const tz = normalizeTimeZone(requested);
  if (!requested || typeof requested !== "string" || (tz === "UTC" && requested.trim() !== "UTC")) {
    return res.status(400).json({ ok: false, error: "Invalid timezone" });
  }

  try {
    const row = await dbGet("SELECT timezone, timezone_updated_at FROM users WHERE id = ?", [userId]);
    const currentTz = normalizeTimeZone(row?.timezone);
    if (currentTz === tz) {
      return res.json({ ok: true, timezone: currentTz, nextResetAt: getNextLocalMidnightIso(currentTz) });
    }
    const now = Date.now();
    // Auto-detect from the browser may correct UTC/default anytime.
    // Manual changes stay rate-limited to avoid gaming daily resets.
    if (source !== "auto") {
      const lastUpdatedAt = row?.timezone_updated_at ? new Date(row.timezone_updated_at).getTime() : null;
      const CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
      if (lastUpdatedAt && now - lastUpdatedAt < CHANGE_WINDOW_MS) {
        return res.status(429).json({ ok: false, error: "Timezone can only be changed every 30 days" });
      }
    }
    const nowIso = new Date(now).toISOString();
    await dbRun(
      "UPDATE users SET timezone = ?, timezone_updated_at = ?, updated_at = ? WHERE id = ?",
      [tz, nowIso, nowIso, userId]
    );
    return res.json({ ok: true, timezone: tz, nextResetAt: getNextLocalMidnightIso(tz) });
  } catch (err) {
    return res.status(500).json({ ok: false, error: "Failed to update timezone" });
  }
});

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: "Missing token" });
  try {
    req.user = jwt.verify(token, TOKEN_SECRET, JWT_VERIFY_OPTIONS);
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return next();
  try {
    req.user = jwt.verify(token, TOKEN_SECRET, JWT_VERIFY_OPTIONS);
  } catch (_) {}
  next();
}

export { TOKEN_SECRET, JWT_VERIFY_OPTIONS };
