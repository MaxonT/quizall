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
// Otherwise, construct it from CORS_ORIGIN
const OAUTH_REDIRECT_URI = (process.env.OAUTH_REDIRECT_URI ||
  `${(process.env.CORS_ORIGIN || "http://localhost:8080").trim()}/api/auth/oauth/callback`).trim();

// Frontend URL for redirecting after OAuth callback
const FRONTEND_URL = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || "http://localhost:5173").trim();

// In-memory store for code_verifier (in production, use Redis or database)
const codeVerifierStore = new Map();

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

function findOrCreateUser(email, provider, providerId) {
  const normalizedEmail = normalizeEmail(email);
  
  // First, try to find existing user by email
  let user = db.prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail);
  
  if (user) {
    // Update OAuth provider info if not set or different
    if (!user.oauth_provider || user.oauth_provider !== provider || user.oauth_id !== providerId) {
      db.prepare(`
        UPDATE users 
        SET oauth_provider = ?, oauth_id = ?, updated_at = ?
        WHERE id = ?
      `).run(provider, providerId, new Date().toISOString(), user.id);
      // Reload user to get updated data
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    
    return user;
  }
  
  // Try to find user by OAuth provider and ID (in case email changed)
  user = db.prepare("SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?").get(provider, providerId);
  if (user) {
    // Update email if it changed
    if (user.email !== normalizedEmail) {
      db.prepare(`
        UPDATE users 
        SET email = ?, updated_at = ?
        WHERE id = ?
      `).run(normalizedEmail, new Date().toISOString(), user.id);
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
    }
    return user;
  }
  
  // Create new user
  const userId = nanoid(16);
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO users (id, email, oauth_provider, oauth_id, subscription_tier, subscription_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, normalizedEmail, provider, providerId, "free", 1, now, now);
  
  return db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

// =============================================
// OAuth Authorization Routes
// =============================================

/**
 * GET /api/auth/oauth/:provider/authorize
 * Initiates OAuth flow by generating authorization URL with PKCE
 */
oauthRouter.get("/:provider/authorize", (req, res) => {
  const { provider } = req.params;
  
  if (provider !== 'google' && provider !== 'github') {
    return res.status(400).json({ ok: false, error: "Invalid provider" });
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  
  // Store code_verifier (with expiration in 10 minutes)
  const state = nanoid(32);
  codeVerifierStore.set(state, {
    codeVerifier,
    provider,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
  
  // Clean up expired entries
  for (const [key, value] of codeVerifierStore.entries()) {
    if (value.expiresAt < Date.now()) {
      codeVerifierStore.delete(key);
    }
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

/**
 * GET /api/auth/oauth/callback
 * Handles OAuth callback and exchanges code for token
 */
oauthRouter.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  // Determine frontend URL dynamically if not set
  // PRIORITY 1: FRONTEND_URL env var (MUST be set for separate frontend/backend deployment)
  // PRIORITY 2: CORS_ORIGIN env var (fallback)
  // PRIORITY 3: Request host (only works if frontend/backend are same domain)
  let frontendBase = process.env.FRONTEND_URL;

  if (!frontendBase) {
    if (process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== "*") {
       frontendBase = process.env.CORS_ORIGIN;
    } else {
       frontendBase = `${req.protocol}://${req.get('host')}`;
    }
  }

  // Remove trailing slash if present to avoid double slashes in constructed URLs
  if (frontendBase.endsWith('/')) {
    frontendBase = frontendBase.slice(0, -1);
  }

  console.log(`[oauth] Callback received - code: ${code ? 'present' : 'missing'}, state: ${state ? 'present' : 'missing'}, error: ${error || 'none'}`);
  console.log(`[oauth] FRONTEND_URL (resolved): ${frontendBase}`);
  
  if (error) {
    const errorUrl = new URL(`${frontendBase}/index.html`);
    errorUrl.searchParams.set('oauth_error', encodeURIComponent(error));
    console.log('[oauth] Redirecting to frontend with error:', errorUrl.toString());
    return res.redirect(errorUrl.toString());
  }
  
  if (!code || !state) {
    const errorUrl = new URL(`${frontendBase}/index.html`);
    errorUrl.searchParams.set('oauth_error', encodeURIComponent('Missing code or state'));
    console.log('[oauth] Redirecting to frontend with error: Missing code or state');
    return res.redirect(errorUrl.toString());
  }

  // Retrieve code_verifier from store
  const stored = codeVerifierStore.get(state);
  if (!stored || stored.expiresAt < Date.now()) {
    codeVerifierStore.delete(state);
    const errorUrl = new URL(`${frontendBase}/index.html`);
    errorUrl.searchParams.set('oauth_error', encodeURIComponent('Invalid or expired state'));
    console.log('[oauth] Redirecting to frontend with error: Invalid or expired state');
    return res.redirect(errorUrl.toString());
  }
  
  const { codeVerifier, provider } = stored;
  codeVerifierStore.delete(state);

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
        throw new Error(tokenData.error || 'Failed to exchange code for token');
      }
      
      // Get user info from Google
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
      });
      
      const googleUser = await userResponse.json();
      userInfo = {
        email: googleUser.email,
        providerId: googleUser.id,
        name: googleUser.name
      };
    } else if (provider === 'github') {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code: code
        })
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
        providerId: githubUser.id.toString(),
        name: githubUser.name || githubUser.login
      };
    }
    
    if (!userInfo || !userInfo.email) {
      throw new Error('Failed to retrieve user information');
    }
    
    // Find or create user
    const userRow = findOrCreateUser(userInfo.email, provider, userInfo.providerId);
    const user = buildUserPayload(userRow);
    const token = createAuthToken(user);
    
    // Redirect to frontend with token
    // Explicitly use /index.html for Vercel compatibility
    const frontendUrl = new URL(`${frontendBase}/index.html`);
    frontendUrl.searchParams.set('oauth_token', token);
    frontendUrl.searchParams.set('oauth_success', 'true');
    
    console.log('[oauth] Redirecting to frontend:', frontendUrl.toString());
    return res.redirect(frontendUrl.toString());
  } catch (err) {
    console.error('[oauth] Callback error:', err);
    const errorUrl = new URL(`${frontendBase}/index.html`);
    errorUrl.searchParams.set('oauth_error', encodeURIComponent(err.message || 'OAuth authentication failed'));
    console.log('[oauth] Redirecting to frontend with error:', errorUrl.toString());
    return res.redirect(errorUrl.toString());
  }
});
