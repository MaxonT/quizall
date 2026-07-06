/**
 * OAuth Routes
 * Handles Google and GitHub OAuth authentication using PKCE flow
 */

import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { dbGet, dbRun, DB_TRUE } from "../lib/dbHelpers.js";

export const oauthRouter = Router();

// OAuth Configuration
const TOKEN_SECRET = process.env.JWT_SECRET;
if (!TOKEN_SECRET) {
  throw new Error(
    "[quizall] FATAL: JWT_SECRET environment variable must be set. " +
    "OAuth authentication cannot start without a secure secret."
  );
}
const TOKEN_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;

const OAUTH_CALLBACK_PATH = "/api/auth/oauth/callback";
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
  ? process.env.OAUTH_REDIRECT_URI.trim().replace(/\/$/, "")
  : (
    process.env.BACKEND_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    `http://localhost:${process.env.PORT || 8080}`
  ).replace(/\/$/, "") + OAUTH_CALLBACK_PATH;

const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").trim();
const CORS_ORIGIN_RAW = (process.env.CORS_ORIGIN || "").trim();
const ALLOWED_REDIRECT_ORIGINS = CORS_ORIGIN_RAW === "*" ? [] : CORS_ORIGIN_RAW.split(",").map((o) => o.trim()).filter(Boolean);

async function saveOAuthState(state, data) {
  await dbRun(
    `INSERT INTO oauth_pkce_states (state, code_verifier, provider, return_origin, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [state, data.codeVerifier, data.provider, data.returnOrigin || null, new Date(data.expiresAt).toISOString()]
  );
}

async function consumeOAuthState(state) {
  const row = await dbGet(
    `SELECT * FROM oauth_pkce_states WHERE state = ? AND expires_at > ?`,
    [state, new Date().toISOString()]
  );
  if (!row) return null;
  await dbRun(`DELETE FROM oauth_pkce_states WHERE state = ?`, [state]);
  return {
    codeVerifier: row.code_verifier,
    provider: row.provider,
    returnOrigin: row.return_origin,
    expiresAt: new Date(row.expires_at).getTime()
  };
}

async function cleanupExpiredOAuthStates() {
  await dbRun(`DELETE FROM oauth_pkce_states WHERE expires_at <= ?`, [new Date().toISOString()]);
}

function oauthClientError(err, fallback = "OAuth authentication failed") {
  if (err?.code === "ACCOUNT_EXISTS_PASSWORD") return err.message;
  return err?.message || fallback;
}

function redirectOAuthError(res, frontendBase, message) {
  const errorUrl = new URL(`${frontendBase}/index.html`);
  errorUrl.searchParams.set("oauth_error", message);
  return res.redirect(errorUrl.toString());
}

function base64URLEncode(str) {
  return str.toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest();
}

function generateCodeVerifier() {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(verifier) {
  return base64URLEncode(sha256(Buffer.from(verifier)));
}

function createAuthToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    TOKEN_SECRET,
    { expiresIn: TOKEN_EXPIRES_IN }
  );
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

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

function isEmailVerified(user) {
  return user?.email_verified === 1 || user?.email_verified === true;
}

async function markUserEmailVerified(userId, now) {
  await dbRun(
    `UPDATE users SET email_verified = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`,
    [DB_TRUE, now, now, userId]
  );
}

async function findOrCreateUser(email, provider, providerId) {
  const normalizedEmail = normalizeEmail(email);
  const providerIdStr = String(providerId);
  const now = new Date().toISOString();

  let user = await dbGet("SELECT * FROM users WHERE email = ?", [normalizedEmail]);

  if (user) {
    if (user.password_hash && !user.oauth_provider) {
      const err = new Error("An account with this email already exists. Please sign in with your password.");
      err.code = "ACCOUNT_EXISTS_PASSWORD";
      throw err;
    }

    const needsProviderLink =
      !user.oauth_provider ||
      user.oauth_provider !== provider ||
      String(user.oauth_id) !== providerIdStr;

    if (needsProviderLink) {
      await dbRun(
        `UPDATE users SET oauth_provider = ?, oauth_id = ?, email_verified = ?, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`,
        [provider, providerIdStr, DB_TRUE, now, now, user.id]
      );
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    } else if (!isEmailVerified(user)) {
      await markUserEmailVerified(user.id, now);
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    return user;
  }

  user = await dbGet("SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?", [provider, providerIdStr]);
  if (user) {
    if (user.email !== normalizedEmail) {
      await dbRun(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, [normalizedEmail, now, user.id]);
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    if (!isEmailVerified(user)) {
      await markUserEmailVerified(user.id, now);
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    return user;
  }

  const userId = nanoid(16);
  await dbRun(
    `INSERT INTO users (id, email, oauth_provider, oauth_id, email_verified, email_verified_at, subscription_tier, subscription_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, normalizedEmail, provider, providerIdStr, DB_TRUE, now, "free", DB_TRUE, now, now]
  );
  return await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
}

oauthRouter.get("/:provider/authorize", async (req, res) => {
  const { provider } = req.params;

  if (provider !== "google" && provider !== "github") {
    return res.status(400).json({ ok: false, error: "Invalid provider" });
  }

  const returnOriginRaw = (req.query.return_origin || "").trim();
  const returnOrigin =
    returnOriginRaw && ALLOWED_REDIRECT_ORIGINS.length > 0 && ALLOWED_REDIRECT_ORIGINS.includes(returnOriginRaw)
      ? returnOriginRaw
      : null;
  if (returnOriginRaw && ALLOWED_REDIRECT_ORIGINS.length > 0 && !returnOrigin) {
    return res.status(400).json({ ok: false, error: "return_origin is not in CORS allow list" });
  }

  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = nanoid(32);
  const expiresAt = Date.now() + 10 * 60 * 1000;

  try {
    await cleanupExpiredOAuthStates();
    await saveOAuthState(state, { codeVerifier, provider, returnOrigin, expiresAt });
  } catch (storeErr) {
    console.error("[oauth] Failed to persist OAuth state:", storeErr);
    return res.status(500).json({ ok: false, error: "Failed to start OAuth flow" });
  }

  console.log(`[oauth] Initiating ${provider} OAuth flow`);
  console.log(`[oauth] OAUTH_REDIRECT_URI: ${OAUTH_REDIRECT_URI}`);
  console.log(`[oauth] FRONTEND_URL: ${FRONTEND_URL}`);

  if (provider === "google" && !GOOGLE_CLIENT_ID) {
    return res.status(500).json({ ok: false, error: "Google OAuth not configured" });
  }
  if (provider === "github" && !GITHUB_CLIENT_ID) {
    return res.status(500).json({ ok: false, error: "GitHub OAuth not configured" });
  }

  const clientId = provider === "google" ? GOOGLE_CLIENT_ID : GITHUB_CLIENT_ID;
  const scope = provider === "google" ? "openid email profile" : "user:email";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });
  if (provider === "github") {
    params.set("allow_signup", "true");
  }

  const authBase = provider === "google"
    ? "https://accounts.google.com/o/oauth2/v2/auth"
    : "https://github.com/login/oauth/authorize";

  res.json({ ok: true, authUrl: `${authBase}?${params.toString()}`, state });
});

function resolveFrontendBase(stored, req) {
  const returnOrigin = stored?.returnOrigin;
  if (returnOrigin && ALLOWED_REDIRECT_ORIGINS.includes(returnOrigin)) {
    return returnOrigin.replace(/\/$/, "");
  }

  const configured = (process.env.FRONTEND_URL || "").replace(/\/$/, "");
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error("FRONTEND_URL must be configured in production");
  }

  if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== "*") {
    const first = process.env.CORS_ORIGIN.split(",").map((o) => o.trim()).filter(Boolean)[0];
    if (first) return first.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`.replace(/\/$/, "");
}

oauthRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  const stored = state ? await consumeOAuthState(state) : null;

  let frontendBase;
  try {
    frontendBase = resolveFrontendBase(stored, req);
  } catch (resolveErr) {
    console.error("[oauth] Frontend URL resolution failed:", resolveErr.message);
    return res.status(500).send("OAuth misconfigured: FRONTEND_URL required");
  }

  console.log(`[oauth] Callback received - code: ${code ? "present" : "missing"}, state: ${state ? "present" : "missing"}, error: ${error || "none"}`);
  console.log(`[oauth] FRONTEND_URL (resolved): ${frontendBase}`);

  if (error) {
    return redirectOAuthError(res, frontendBase, String(error));
  }
  if (!code || !state) {
    return redirectOAuthError(res, frontendBase, "Missing code or state");
  }
  if (!stored || stored.expiresAt < Date.now()) {
    return redirectOAuthError(res, frontendBase, "Invalid or expired state. Please try signing in again.");
  }

  const { codeVerifier, provider } = stored;

  try {
    let userInfo;

    if (provider === "google") {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code: code,
          grant_type: "authorization_code",
          redirect_uri: OAUTH_REDIRECT_URI,
          code_verifier: codeVerifier
        })
      });

      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        const detail = tokenData.error_description || tokenData.error || "Failed to exchange code for token";
        console.error("[oauth] Google token exchange failed:", detail, tokenData);
        throw new Error(detail);
      }

      const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` }
      });
      const googleUser = await userResponse.json();
      if (!userResponse.ok || !googleUser.email) {
        console.error("[oauth] Google userinfo failed:", googleUser);
        throw new Error("Failed to retrieve user information from Google");
      }
      userInfo = {
        email: googleUser.email,
        providerId: String(googleUser.id),
        name: googleUser.name
      };
    } else if (provider === "github") {
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code: code,
          redirect_uri: OAUTH_REDIRECT_URI,
          code_verifier: codeVerifier
        }).toString()
      });

      const tokenData = await tokenResponse.json();
      if (tokenData.error) {
        throw new Error(tokenData.error_description || tokenData.error || "Failed to exchange code for token");
      }

      const userResponse = await fetch("https://api.github.com/user", {
        headers: { Authorization: `token ${tokenData.access_token}` }
      });
      const githubUser = await userResponse.json();

      let email = githubUser.email;
      if (!email) {
        const emailsResponse = await fetch("https://api.github.com/user/emails", {
          headers: { Authorization: `token ${tokenData.access_token}` }
        });
        const emails = await emailsResponse.json();
        const primaryEmail = Array.isArray(emails) ? emails.find((e) => e.primary) || emails[0] : null;
        email = primaryEmail?.email;
      }

      userInfo = {
        email,
        providerId: String(githubUser.id),
        name: githubUser.name || githubUser.login
      };
    }

    if (!userInfo?.email) {
      throw new Error("Failed to retrieve user information");
    }

    const userRow = await findOrCreateUser(userInfo.email, provider, userInfo.providerId);
    if (!userRow?.id || !userRow?.email) {
      throw new Error("Failed to find or create user");
    }

    const user = buildUserPayload(userRow);
    const token = createAuthToken(user);
    const hash = new URLSearchParams({ oauth_token: token, oauth_success: "true" }).toString();
    return res.redirect(`${frontendBase}/index.html#${hash}`);
  } catch (err) {
    console.error("[oauth] Callback error:", err);
    return redirectOAuthError(res, frontendBase, oauthClientError(err));
  }
});
