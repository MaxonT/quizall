/**
 * Billing Routes
 * 
 * API endpoints for subscription management:
 * - POST /api/billing/checkout-session
 * - POST /api/billing/portal-session
 * - POST /api/stripe/webhook
 * - GET  /api/billing/status
 * - GET  /api/billing/plans
 * - POST /api/billing/start-trial
 * 
 * Reference: PRD Section 15 - Minimal Backend Routes
 */

import { Router } from "express";
import { nanoid } from "nanoid";
import { requireAuth } from "./auth.js";
import { db } from "../lib/db.js";
import { stripeService } from "../lib/stripeService.js";
import { tokenLedger } from "../lib/tokenLedger.js";
import { trialAntiAbuse } from "../lib/trialAntiAbuse.js";
import { shouldInjectError, injectDelay, InjectedError } from "../lib/errorInjector.js";
import { getUserPlan, getDailyUsage } from "../lib/planLimits.js";
import { getNextLocalMidnightIso, normalizeTimeZone } from "../lib/timezone.js";
import {
  PLANS,
  FEATURES,
  isStripeConfigured,
  formatTokens,
  DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
  DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
} from "../lib/subscriptionConfig.js";

export const billingRouter = Router();
export const stripeWebhookRouter = Router();

// =============================================
// Plans Endpoint (Public)
// =============================================

/**
 * GET /api/billing/plans
 * Returns available subscription plans
 */
billingRouter.get("/plans", (req, res) => {
  const sanitizePlanForUi = (plan) => ({
    id: plan.id,
    name: plan.name,
    price: plan.price,
    currency: plan.currency,
    interval: plan.interval,
    days: plan.days,
    monthlyEquivalent: plan.monthlyEquivalent,
    savings: plan.savings,
    dailyLimits: plan.dailyLimits,
    features: plan.features,
  });

  res.json({
    ok: true,
    plans: {
      monthly: sanitizePlanForUi(PLANS.monthly),
      yearly: sanitizePlanForUi(PLANS.yearly),
      trial: sanitizePlanForUi(PLANS.trial),
    },
    features: {
      subscriptionsEnabled: FEATURES.subscriptionsEnabled,
      trialsEnabled: FEATURES.trialsEnabled,
    },
    stripeConfigured: isStripeConfigured(),
    subscriptionsAvailable: FEATURES.subscriptionsEnabled && isStripeConfigured(),
  });
});

// =============================================
// Status Endpoint
// =============================================

/**
 * GET /api/billing/status
 * Returns current subscription and token status for logged-in user
 */
billingRouter.get("/status", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    
    // Get subscription status
    const subscription = stripeService.getSubscriptionStatus(userId);
    
    // Ensure free users have daily tokens
    // For users without subscription, this will grant them daily tokens
    let balances;
    if (subscription.status === 'none' || !subscription.status) {
      balances = tokenLedger.ensureFreeUserTokens(userId);
    } else {
      balances = tokenLedger.getTokenBalances(userId);
    }
    
    // Get user plan and usage
    const plan = getUserPlan(userId);
    const promptUsage = getDailyUsage(userId, 'prompt_optimization');
    const wizardUsage = getDailyUsage(userId, 'question_wizard');
    
    // Get user info
    const user = db.prepare(`
      SELECT email, email_verified, trial_used, trial_started_at, created_at, timezone
      FROM users WHERE id = ?
    `).get(userId);
    
    // Calculate days remaining in trial
    let trialDaysRemaining = null;
    if (subscription.status === "trialing" && subscription.trialEnd) {
      const trialEnd = new Date(subscription.trialEnd);
      const now = new Date();
      trialDaysRemaining = Math.max(0, Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)));
    }
    
    const tz = normalizeTimeZone(user?.timezone);

    res.json({
      ok: true,
      plan: plan, // 'free', 'monthly', 'yearly', or 'trial'
      timezone: tz,
      nextResetAt: getNextLocalMidnightIso(tz),
      subscription: {
        status: subscription.status,
        plan: subscription.plan,
        periodEnd: subscription.periodEnd,
        trialEnd: subscription.trialEnd,
        trialDaysRemaining,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        canStartTrial: !user?.trial_used && FEATURES.trialsEnabled,
        emailVerified: !!user?.email_verified,
      },
      limits: {
        promptOptimization: {
          daily: plan === 'free' ? 8 : DAILY_PROMPT_OPTIMIZATIONS_PER_DAY
        },
        questionWizard: {
          daily: plan === 'free' ? 5 : DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY
        }
      },
      usage: {
        promptOptimization: promptUsage,
        questionWizard: wizardUsage
      },
      tokens: {
        total: balances.total,
        totalFormatted: formatTokens(balances.total),
        daily_free: balances.daily_free,
        monthly: balances.monthly,
        trial_base: balances.trial_base,
      },
      user: {
        email: user?.email,
        createdAt: user?.created_at,
      },
    });
  } catch (err) {
    console.error("[billing] Status error:", err);
    res.status(500).json({ ok: false, error: "Failed to get billing status" });
  }
});

// =============================================
// Checkout Session
// =============================================

/**
 * POST /api/billing/checkout-session
 * Creates a Stripe Checkout session for subscription
 */
billingRouter.post("/checkout-session", requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Stripe not configured",
        message: "Billing features are not available at this time",
      });
    }
    
    // Error injection for testing
    await injectDelay();
    if (shouldInjectError('fail_checkout_creation')) {
      throw new InjectedError('Injected checkout creation failure', 'fail_checkout_creation');
    }
    
    const userId = req.user.sub;
    const { plan, idempotencyKey } = req.body;
    
    if (!plan || !["monthly", "yearly"].includes(plan)) {
      return res.status(400).json({
        ok: false,
        error: "Invalid plan",
        message: "Plan must be 'monthly' or 'yearly'",
      });
    }
    
    // Generate idempotency key (1-hour window)
    const effectiveIdempotencyKey = idempotencyKey || 
      `checkout_${userId}_${plan}_${Math.floor(Date.now() / 3600000)}`;
    
    // Check for existing pending session (within 1 hour)
    const existingSession = db.prepare(`
      SELECT stripe_session_id, session_url, created_at 
      FROM checkout_sessions 
      WHERE user_id = ? AND plan = ? AND status = 'pending'
        AND created_at > datetime('now', '-1 hour')
      ORDER BY created_at DESC LIMIT 1
    `).get(userId, plan);
    
    if (existingSession) {
      console.log(`[billing] Reusing existing session for user ${userId}`);
      return res.json({
        ok: true,
        sessionId: existingSession.stripe_session_id,
        url: existingSession.session_url,
        reused: true,
      });
    }
    
    // Get user email
    const user = db.prepare("SELECT email, trial_used FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    
    // Create checkout session
    let session;
    if (user.trial_used) {
      session = await stripeService.createCheckoutSessionNoTrial({
        userId,
        email: user.email,
        plan,
      });
    } else {
      session = await stripeService.createCheckoutSession({
        userId,
        email: user.email,
        plan,
      });
    }
    
    // Save session to DB
    const sessionId = nanoid(16);
    db.prepare(`
      INSERT INTO checkout_sessions 
        (id, user_id, stripe_session_id, session_url, plan, status, idempotency_key, created_at)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
    `).run(sessionId, userId, session.sessionId, session.url, plan, effectiveIdempotencyKey);
    
    console.log(`[billing] Created checkout session ${session.sessionId} for user ${userId}`);
    
    res.json({
      ok: true,
      sessionId: session.sessionId,
      url: session.url,
    });
  } catch (err) {
    console.error("[billing] Checkout session error:", err);
    res.status(500).json({ 
      ok: false, 
      error: "Failed to create checkout session",
      message: err.message,
    });
  }
});

// =============================================
// Verify Checkout Session
// =============================================

/**
 * GET /api/billing/verify-session/:sessionId
 * Verifies checkout session completion and subscription activation
 */
billingRouter.get("/verify-session/:sessionId", requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Stripe not configured",
      });
    }
    
    const userId = req.user.sub;
    const { sessionId } = req.params;
    
    // Error injection for testing
    await injectDelay();
    if (shouldInjectError('fail_session_verification')) {
      throw new InjectedError('Injected verification failure', 'fail_session_verification');
    }
    
    // Check local DB session
    const dbSession = db.prepare(`
      SELECT status, stripe_session_id, plan 
      FROM checkout_sessions 
      WHERE stripe_session_id = ? AND user_id = ?
    `).get(sessionId, userId);
    
    if (!dbSession) {
      return res.status(404).json({
        ok: false,
        error: "Session not found",
      });
    }
    
    // If already completed, return success immediately
    if (dbSession.status === 'completed') {
      const subscription = stripeService.getSubscriptionStatus(userId);
      return res.json({
        ok: true,
        status: 'completed',
        subscriptionStatus: subscription?.status || 'inactive',
      });
    }
    
    // Query Stripe for session status
    const stripeSession = await stripeService.getCheckoutSession(sessionId);
    
    if (stripeSession.payment_status === 'paid' && stripeSession.status === 'complete') {
      // Update session status
      db.prepare(`
        UPDATE checkout_sessions 
        SET status = 'completed', completed_at = datetime('now')
        WHERE stripe_session_id = ?
      `).run(sessionId);
      
      // Verify subscription status
      const subscription = stripeService.getSubscriptionStatus(userId);
      
      return res.json({
        ok: true,
        status: 'completed',
        subscriptionStatus: subscription?.status || 'inactive',
      });
    } else if (stripeSession.status === 'expired') {
      db.prepare(`
        UPDATE checkout_sessions 
        SET status = 'expired'
        WHERE stripe_session_id = ?
      `).run(sessionId);
      
      return res.json({
        ok: false,
        status: 'expired',
        error: 'Session expired',
      });
    } else {
      // Still pending
      return res.json({
        ok: true,
        status: 'pending',
        paymentStatus: stripeSession.payment_status,
      });
    }
  } catch (err) {
    console.error("[billing] Verify session error:", err);
    res.status(500).json({
      ok: false,
      error: "Verification failed",
      message: err.message,
    });
  }
});

// =============================================
// Portal Session
// =============================================

/**
 * POST /api/billing/portal-session
 * Creates a Stripe Billing Portal session
 */
billingRouter.post("/portal-session", requireAuth, async (req, res) => {
  try {
    if (!isStripeConfigured()) {
      return res.status(503).json({
        ok: false,
        error: "Stripe not configured",
        message: "Billing features are not available at this time",
      });
    }
    
    const userId = req.user.sub;
    
    const session = await stripeService.createPortalSession(userId);
    
    res.json({
      ok: true,
      url: session.url,
    });
  } catch (err) {
    console.error("[billing] Portal session error:", err);
    
    if (err.message === "No Stripe customer found for user") {
      return res.status(400).json({
        ok: false,
        error: "No subscription found",
        message: "You don't have an active subscription to manage",
      });
    }
    
    res.status(500).json({ ok: false, error: "Failed to create portal session" });
  }
});

// =============================================
// Start Trial (Alternative to Stripe Checkout)
// =============================================

/**
 * POST /api/billing/start-trial
 * Starts a free trial for the user (no payment method required for low-risk users)
 */
billingRouter.post("/start-trial", requireAuth, async (req, res) => {
  try {
    if (!FEATURES.trialsEnabled) {
      return res.status(400).json({
        ok: false,
        error: "Trials disabled",
        message: "Free trials are not available at this time",
      });
    }
    
    const userId = req.user.sub;
    const { fingerprint } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    
    // Get user email
    const user = db.prepare("SELECT email, trial_used FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    
    // Check trial eligibility
    const eligibility = trialAntiAbuse.checkTrialEligibility({
      userId,
      email: user.email,
      ipAddress,
      fingerprint,
    });
    
    if (!eligibility.eligible) {
      return res.status(400).json({
        ok: false,
        error: eligibility.reason,
        message: eligibility.message,
      });
    }
    
    // If high risk, redirect to Stripe checkout with trial
    if (eligibility.requiresPaymentMethod) {
      if (!isStripeConfigured()) {
        return res.status(400).json({
          ok: false,
          error: "PAYMENT_METHOD_REQUIRED",
          message: eligibility.message,
          requiresPaymentMethod: true,
        });
      }
      
      const session = await stripeService.createCheckoutSession({
        userId,
        email: user.email,
        plan: "monthly", // Default to monthly for trial
      });
      
      return res.json({
        ok: true,
        requiresPaymentMethod: true,
        checkoutUrl: session.url,
        message: eligibility.message,
      });
    }
    
    // Low risk - grant trial directly
    tokenLedger.grantTrialTokens(userId);
    
    // Mark trial as used and record IP
    db.prepare(`
      UPDATE users 
      SET trial_used = 1, trial_started_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(userId);
    
    trialAntiAbuse.incrementTrialCount(ipAddress);
    trialAntiAbuse.recordFingerprint(userId, fingerprint, ipAddress);
    
    // Create a trial subscription record
    const now = new Date();
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 14);
    
    db.prepare(`
      INSERT INTO subscriptions (
        user_id, status, plan, trial_start, trial_end, created_at, updated_at
      ) VALUES (?, 'trialing', 'trial', ?, ?, ?, ?)
    `).run(
      userId,
      now.toISOString(),
      trialEnd.toISOString(),
      now.toISOString(),
      now.toISOString()
    );
    
    const balances = tokenLedger.getTokenBalances(userId);
    
    res.json({
      ok: true,
      message: "Trial started successfully!",
      trial: {
        startDate: now.toISOString(),
        endDate: trialEnd.toISOString(),
        daysRemaining: 14,
      },
      tokens: {
        total: balances.total,
        totalFormatted: formatTokens(balances.total),
        daily_free: balances.daily_free,
        trial_base: balances.trial_base,
      },
    });
  } catch (err) {
    console.error("[billing] Start trial error:", err);
    res.status(500).json({ ok: false, error: "Failed to start trial" });
  }
});

// =============================================
// Coupon Redemption
// =============================================

/**
 * POST /api/billing/redeem-coupon
 * Redeems a coupon code to activate a subscription without Stripe checkout.
 */
billingRouter.post("/redeem-coupon", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const { code } = req.body;

    if (!code || typeof code !== "string" || code.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Coupon code is required" });
    }

    const normalizedCode = code.trim().toUpperCase();

    // Look up the coupon
    const coupon = db.prepare(
      "SELECT * FROM coupons WHERE code = ? AND active = 1"
    ).get(normalizedCode);

    if (!coupon) {
      return res.status(404).json({ ok: false, error: "Invalid or expired coupon code" });
    }

    // Check expiry
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
      return res.status(400).json({ ok: false, error: "This coupon has expired" });
    }

    // Check max redemptions
    if (coupon.times_redeemed >= coupon.max_redemptions) {
      return res.status(400).json({ ok: false, error: "This coupon has reached its redemption limit" });
    }

    // Check if user already redeemed this coupon
    const existing = db.prepare(
      "SELECT id FROM coupon_redemptions WHERE coupon_id = ? AND user_id = ?"
    ).get(coupon.id, userId);

    if (existing) {
      return res.status(400).json({ ok: false, error: "You have already redeemed this coupon" });
    }

    // Check user exists
    const user = db.prepare("SELECT id, email FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }

    // --- All checks passed: activate the subscription ---
    const now = new Date();
    const periodEnd = new Date();
    periodEnd.setDate(periodEnd.getDate() + coupon.duration_days);

    // Record the redemption
    db.prepare(
      "INSERT INTO coupon_redemptions (coupon_id, user_id) VALUES (?, ?)"
    ).run(coupon.id, userId);

    // Increment coupon usage
    db.prepare(
      "UPDATE coupons SET times_redeemed = times_redeemed + 1 WHERE id = ?"
    ).run(coupon.id);

    // Upsert subscription record (bypass Stripe entirely)
    const existingSub = db.prepare(
      "SELECT id FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"
    ).get(userId);

    if (existingSub) {
      db.prepare(`
        UPDATE subscriptions
        SET status = 'active', plan = ?, period_start = ?, period_end = ?, updated_at = ?
        WHERE id = ?
      `).run(coupon.plan, now.toISOString(), periodEnd.toISOString(), now.toISOString(), existingSub.id);
    } else {
      db.prepare(`
        INSERT INTO subscriptions (user_id, status, plan, period_start, period_end, created_at, updated_at)
        VALUES (?, 'active', ?, ?, ?, ?, ?)
      `).run(userId, coupon.plan, now.toISOString(), periodEnd.toISOString(), now.toISOString(), now.toISOString());
    }

    // Update user tier
    db.prepare(
      "UPDATE users SET subscription_tier = ?, subscription_active = 1, updated_at = ? WHERE id = ?"
    ).run(coupon.plan, now.toISOString(), userId);

    // Grant tokens for the plan
    tokenLedger.grantSubscriptionTokens(userId, coupon.plan);

    const balances = tokenLedger.getTokenBalances(userId);

    console.log(`[billing] Coupon ${normalizedCode} redeemed by user ${userId} → plan: ${coupon.plan}`);

    res.json({
      ok: true,
      message: "Coupon redeemed successfully! Your subscription is now active.",
      plan: coupon.plan,
      periodEnd: periodEnd.toISOString(),
      tokens: {
        total: balances.total,
        totalFormatted: formatTokens(balances.total),
      },
    });
  } catch (err) {
    console.error("[billing] Redeem coupon error:", err);
    res.status(500).json({ ok: false, error: "Failed to redeem coupon" });
  }
});

// =============================================
// Token History
// =============================================

/**
 * GET /api/billing/token-history
 * Returns token usage history for the user
 */
billingRouter.get("/token-history", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;
    
    const history = tokenLedger.getTokenHistory(userId, limit, offset);
    
    res.json({
      ok: true,
      history: history.map(entry => ({
        id: entry.id,
        bucket: entry.bucket,
        change: entry.tokens_change,
        balanceAfter: entry.balance_after,
        source: entry.source,
        reason: entry.reason,
        runId: entry.run_id,
        createdAt: entry.created_at,
      })),
      pagination: {
        limit,
        offset,
        hasMore: history.length === limit,
      },
    });
  } catch (err) {
    console.error("[billing] Token history error:", err);
    res.status(500).json({ ok: false, error: "Failed to get token history" });
  }
});

// =============================================
// Stripe Webhook
// =============================================

/**
 * POST /api/stripe/webhook
 * Handles Stripe webhook events
 * 
 * Note: This endpoint needs raw body for signature verification
 */
stripeWebhookRouter.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["stripe-signature"];
    
    if (!signature) {
      return res.status(400).json({ ok: false, error: "Missing signature" });
    }
    
    // Verify signature and parse event
    let event;
    try {
      event = stripeService.verifyWebhookSignature(req.body, signature);
    } catch (err) {
      console.error("[stripe] Webhook signature verification failed:", err);
      return res.status(400).json({ ok: false, error: "Invalid signature" });
    }
    
    // Process the event
    const result = await stripeService.processWebhookEvent(event);
    
    res.json({ ok: true, received: true, ...result });
  } catch (err) {
    console.error("[stripe] Webhook processing error:", err);
    // Return 200 to prevent Stripe from retrying (we've logged the error)
    res.status(200).json({ ok: false, error: err.message });
  }
});

// =============================================
// Email Verification
// =============================================

/**
 * POST /api/billing/verify-email
 * Marks email as verified (in real implementation, this would validate a token)
 */
billingRouter.post("/verify-email", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    const { token } = req.body;
    
    // In a real implementation, you would:
    // 1. Validate the token against a stored verification token
    // 2. Check token expiration
    // For MVP, we'll just mark as verified
    
    trialAntiAbuse.markEmailVerified(userId);
    
    res.json({
      ok: true,
      message: "Email verified successfully",
    });
  } catch (err) {
    console.error("[billing] Email verification error:", err);
    res.status(500).json({ ok: false, error: "Failed to verify email" });
  }
});

/**
 * POST /api/billing/send-verification
 * Sends email verification (placeholder for actual email sending)
 */
billingRouter.post("/send-verification", requireAuth, (req, res) => {
  try {
    const userId = req.user.sub;
    
    // Get user email
    const user = db.prepare("SELECT email FROM users WHERE id = ?").get(userId);
    if (!user) {
      return res.status(404).json({ ok: false, error: "User not found" });
    }
    
    // In a real implementation, you would:
    // 1. Generate a verification token
    // 2. Store the token with expiration
    // 3. Send an email with the verification link
    
    console.log(`[billing] Verification email would be sent to ${user.email}`);
    
    res.json({
      ok: true,
      message: "Verification email sent",
      email: user.email,
    });
  } catch (err) {
    console.error("[billing] Send verification error:", err);
    res.status(500).json({ ok: false, error: "Failed to send verification email" });
  }
});

export default billingRouter;
