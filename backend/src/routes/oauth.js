/**
 * OAuth Routes
 * Handles Google and GitHub OAuth authentication using PKCE flow
 */

import { Router } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { db } from "../lib/db.js";
import { nanoid } from "nanoid";

export const oauthRouter = Router();

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

// 与 auth.js 一致：PG 下必须用异步 query，否则 oauth 回调拿到的是 Promise 而非用户行，导致 JWT 里 sub/email 为 undefined、/me 查不到用户
async function dbGet(sql, params = []) {
  if (USE_POSTGRES) return await db.get(sql, ...params);
  return db.prepare(sql).get(...params);
}
async function dbRun(sql, params = []) {
  if (USE_POSTGRES) return await db.run(sql, ...params);
  return db.prepare(sql).run(...params);
}

// OAuth Configuration
// Problem C: JWT_SECRET 必须显式设置，任何环境均不允许使用默认弱密钥
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

// OAuth redirect URI should be the backend callback URL
// If OAUTH_REDIRECT_URI is explicitly set, use it directly
// Otherwise, construct it from BACKEND_URL
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI
  ? process.env.OAUTH_REDIRECT_URI.trim().replace(/\/$/, "")
  : (
    process.env.BACKEND_URL ||
    `http://localhost:${process.env.PORT || 8080}`
  ).replace(/\/$/, "") + "/api/auth/oauth/callback";

// Frontend URL for redirecting after OAuth callback (fallback when no return_origin or not in allow list)
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").trim();

// Allowed origins for OAuth redirect (must match CORS_ORIGIN so "where you came from" is trusted)
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

// =============================================
// Helper Functions
// =============================================

function base64URLEncode(str) {
  return str.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest();
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
      isActive: !!row.subscription_active
    }
  };
}

function normalizeEmail(email = "") {
  return email.trim().toLowerCase();
}

async function findOrCreateUser(email, provider, providerId) {
  const normalizedEmail = normalizeEmail(email);
  const now = new Date().toISOString();
  
  // First, try to find existing user by email
  let user = await dbGet("SELECT * FROM users WHERE email = ?", [normalizedEmail]);
  
  if (user) {
    // Block OAuth takeover of password-only accounts
    if (user.password_hash && !user.oauth_provider) {
      const err = new Error("An account with this email already exists. Please sign in with your password.");
      err.code = "ACCOUNT_EXISTS_PASSWORD";
      throw err;
    }
    // Update OAuth provider info if not set or different
    if (!user.oauth_provider || user.oauth_provider !== provider || user.oauth_id !== providerId) {
      await dbRun(
        `UPDATE users SET oauth_provider = ?, oauth_id = ?, email_verified = 1, email_verified_at = COALESCE(email_verified_at, ?), updated_at = ? WHERE id = ?`,
        [provider, providerId, now, now, user.id]
      );
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    } else if (!user.email_verified) {
      await dbRun(
        `UPDATE users SET email_verified = 1, email_verified_at = ?, updated_at = ? WHERE id = ?`,
        [now, now, user.id]
      );
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    return user;
  }
  
  // Try to find user by OAuth provider and ID (in case email changed)
  user = await dbGet("SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?", [provider, providerId]);
  if (user) {
    if (user.email !== normalizedEmail) {
      await dbRun(`UPDATE users SET email = ?, updated_at = ? WHERE id = ?`, [normalizedEmail, new Date().toISOString(), user.id]);
      user = await dbGet("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    return user;
  }
  
  // Create new user (OAuth providers verify email)
  const userId = nanoid(16);
  await dbRun(
    `INSERT INTO users (id, email, oauth_provider, oauth_id, email_verified, email_verified_at, subscription_tier, subscription_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`,
    [userId, normalizedEmail, provider, String(providerId), now, "free", USE_POSTGRES ? true : 1, now, now]
  );
  return await dbGet("SELECT * FROM users WHERE id = ?", [userId]);
}

// =============================================
// OAuth Authorization Routes
// =============================================

/**
 * GET /api/auth/oauth/:provider/authorize
 * Initiates OAuth flow by generating authorization URL with PKCE
 */
oauthRouter.get("/:provider/authorize", async (req, res) => {
  const { provider } = req.params;
  
  if (provider !== 'google' && provider !== 'github') {
    return res.status(400).json({ ok: false, error: "Invalid provider" });
  }

  // Optional: frontend sends return_origin so we redirect back to the same origin (avoids cross-origin redirect)
  const returnOriginRaw = (req.query.return_origin || "").trim();
  const returnOrigin =
    returnOriginRaw && ALLOWED_REDIRECT_ORIGINS.length > 0 && ALLOWED_REDIRECT_ORIGINS.includes(returnOriginRaw)
      ? returnOriginRaw
      : null;
  if (returnOriginRaw && ALLOWED_REDIRECT_ORIGINS.length > 0 && !returnOrigin) {
    return res.status(400).json({ ok: false, error: "return_origin is not in CORS allow list" });
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Store code_verifier in DB (survives Render restarts / cold starts)
  const state = nanoid(32);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  try {
    await cleanupExpiredOAuthStates();
    await saveOAuthState(state, { codeVerifier, provider, returnOrigin, expiresAt });
  } catch (storeErr) {
    console.error("[oauth] Failed to persist OAuth state:", storeErr);
    return res.status(500).json({ ok: false, error: "Failed to start OAuth flow" });
  }

  let authUrl;
  
  console.log(`[oauth] Initiating ${provider} OAuth flow`);
  console.log(`[oauth] OAUTH_REDIRECT_URI: ${OAUTH_REDIRECT_URI}`);
  console.log(`[oauth] FRONTEND_URL: ${FRONTEND_URL}`);
  
  if (provider === 'google') {
    if (!GOOGLE_CLIENT_ID) {
      return res.status(500).json({ ok: false, error: "Google OAuth not configured" });
    }
    
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    
    authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    console.log(`[oauth] Google auth URL generated`);
  } else if (provider === 'github') {
    if (!GITHUB_CLIENT_ID) {
      return res.status(500).json({ ok: false, error: "GitHub OAuth not configured" });
    }
    
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      scope: 'user:email',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      allow_signup: 'true'
    });
    
    authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    console.log(`[oauth] GitHub auth URL generated`);
  }

  console.log(`[oauth] Returning auth URL to client`);
  res.json({
    ok: true,
    authUrl,
    state
  });
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

/**
 * GET /api/auth/oauth/callback
 * Handles OAuth callback and exchanges code for token
 */
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

  console.log(`[oauth] Callback received - code: ${code ? 'present' : 'missing'}, state: ${state ? 'present' : 'missing'}, error: ${error || 'none'}`);
  console.log(`[oauth] FRONTEND_URL (resolved): ${frontendBase}`);
  
  // 错误用 query 传（仅错误信息，无敏感 token）；成功用 fragment 传 token（不进入 Referer，符合 OAuth 安全实践）
  if (error) {
    return redirectOAuthError(res, frontendBase, String(error));
  }
  if (!code || !state) {
    return redirectOAuthError(res, frontendBase, "Missing code or state");
  }
  if (!stored || stored.expiresAt < Date.now()) {
    return redirectOAuthError(res, frontendBase, "Invalid or expired state");
  }
  
  const { codeVerifier, provider } = stored;

  try {
    let userInfo;
    
    if (provider === 'google') {
      // Exchange code for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: OAUTH_REDIRECT_URI,
          code_verifier: codeVerifier
        })
      });
      
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        const detail = tokenData.error_description || tokenData.error || 'Failed to exchange code for token';
        console.error("[oauth] Google token exchange failed:", detail, tokenData);
        throw new Error(detail);
      }
      
      // Get user info from Google
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      
      const googleUser = await userResponse.json();
      if (!userResponse.ok || !googleUser.email) {
        console.error("[oauth] Google userinfo failed:", googleUser);
        throw new Error('Failed to retrieve user information from Google');
      }
      userInfo = {
        email: googleUser.email,
        providerId: String(googleUser.id),
        name: googleUser.name
      };
    } else if (provider === 'github') {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
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
        throw new Error(tokenData.error_description || 'Failed to exchange code for token');
      }
      
      // Get user info from GitHub
      const userResponse = await fetch('https://api.github.com/user', {
        headers: { 'Authorization': `token ${tokenData.access_token}` }
      });
      
      const githubUser = await userResponse.json();
      
      // Get user email (may need to fetch from emails endpoint)
      let email = githubUser.email;
      if (!email) {
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: { 'Authorization': `token ${tokenData.access_token}` }
        });
        const emails = await emailsResponse.json();
        const primaryEmail = emails.find(e => e.primary) || emails[0];
        email = primaryEmail?.email;
      }
      
      userInfo = {
        email: email,
        providerId: String(githubUser.id),
        name: githubUser.name || githubUser.login
      };
    }
    
    if (!userInfo || !userInfo.email) {
      throw new Error('Failed to retrieve user information');
    }
    
    // Find or create user（必须 await：PG 下为异步，否则 userRow 为 Promise，JWT 会带 undefined）
    const userRow = await findOrCreateUser(userInfo.email, provider, userInfo.providerId);
    if (!userRow) {
      throw new Error('Failed to find or create user');
    }
    const user = buildUserPayload(userRow);
    const token = createAuthToken(user);
    
    // 用 fragment 传 token（不进入 Referer/服务器日志），符合 OAuth 2.0 安全实践
    const hash = new URLSearchParams({ oauth_token: token, oauth_success: 'true' }).toString();
    const frontendUrl = `${frontendBase}/index.html#${hash}`;
    return res.redirect(frontendUrl);
  } catch (err) {
    console.error('[oauth] Callback error:', err);
    return redirectOAuthError(res, frontendBase, oauthClientError(err));
  }
});
