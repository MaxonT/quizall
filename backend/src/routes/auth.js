import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "../lib/db.js";
import { nanoid } from "nanoid";
import { getNextLocalMidnightIso, normalizeTimeZone } from "../lib/timezone.js";

export const authRouter = Router();

let TOKEN_SECRET = process.env.JWT_SECRET;
if (!TOKEN_SECRET) {
  if (process.env.NODE_ENV === "development") {
    console.warn("[quizall] WARNING: JWT_SECRET is not set. Using default insecure development secret.");
    TOKEN_SECRET = "dev";
  } else {
    throw new Error("[quizall] FATAL: JWT_SECRET environment variable must be set in production.");
  }
}
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const PASSWORD_MIN_LENGTH = 8;
const BCRYPT_ROUNDS = 10;
// Dummy hash generated with same cost factor to ensure constant-time comparison (prevents timing attacks)
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-attack-prevention", BCRYPT_ROUNDS);

// Email validation regex pattern (more restrictive per RFC standards)
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
      isActive: !!row.subscription_active
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
  const token = createAuthToken(user);
  return res.json({ ok: true, token, user });
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
    if (!password || typeof password !== "string" || password.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        ok: false,
        error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
      });
    }

    const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(normalizedEmail);
    if (existing) {
      return res.status(409).json({ ok: false, error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = nanoid(16);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, subscription_tier, subscription_active, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, normalizedEmail, passwordHash, "free", 1, now, now);

    const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
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

    const row = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
    
    // Always perform bcrypt.compare() to prevent timing attacks
    // Use dummy hash when user not found to ensure constant-time comparison
    const hashToCompare = row?.password_hash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);
    
    // Combine conditions using bitwise AND to avoid short-circuit evaluation and timing leaks
    const userExists = !!row;
    const credentialsValid = userExists & valid;
    
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
  // Stateless JWT logout handled on client by discarding token.
  return res.json({ ok: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.sub);
  if (!row) {
    return res.status(404).json({ ok: false, error: "User not found" });
  }
  return res.json({
    ok: true,
    user: buildUserPayload(row)
  });
});

authRouter.put("/timezone", requireAuth, (req, res) => {
  const userId = req.user.sub;
  const requested = req.body?.timezone;
  const tz = normalizeTimeZone(requested);
  if (!requested || typeof requested !== "string" || tz === "UTC" && requested.trim() !== "UTC") {
    return res.status(400).json({ ok: false, error: "Invalid timezone" });
  }

  const row = db.prepare("SELECT timezone, timezone_updated_at FROM users WHERE id = ?").get(userId);
  const currentTz = normalizeTimeZone(row?.timezone);
  if (currentTz === tz) {
    return res.json({
      ok: true,
      timezone: currentTz,
      nextResetAt: getNextLocalMidnightIso(currentTz)
    });
  }
  const now = Date.now();
  const lastUpdatedAt = row?.timezone_updated_at ? new Date(row.timezone_updated_at).getTime() : null;
  const CHANGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
  if (lastUpdatedAt && now - lastUpdatedAt < CHANGE_WINDOW_MS) {
    return res.status(429).json({ ok: false, error: "Timezone can only be changed every 30 days" });
  }

  const nowIso = new Date(now).toISOString();
  db.prepare(
    "UPDATE users SET timezone = ?, timezone_updated_at = ?, updated_at = ? WHERE id = ?"
  ).run(tz, nowIso, nowIso, userId);

  return res.json({
    ok: true,
    timezone: tz,
    nextResetAt: getNextLocalMidnightIso(tz)
  });
});

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ ok: false, error: "Missing token" });
  }
  try {
    const payload = jwt.verify(token, TOKEN_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, error: "Invalid token" });
  }
}

export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return next();
  }
  try {
    req.user = jwt.verify(token, TOKEN_SECRET);
  } catch (err) {
    console.log("[optionalAuth] Invalid token provided:", err.message);
  }
  next();
}
