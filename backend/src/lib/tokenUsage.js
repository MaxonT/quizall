/**
 * Token Usage Middleware
 * 
 * Middleware for checking and spending tokens on API calls.
 * Implements the runtime enforcement as per PRD Section 13.
 * 
 * Order:
 * 1. Pre-check: Read subscription + token buckets
 * 2. Allow run (pass to next middleware)
 * 3. Post-run: Compute credits and spend atomically
 */

import { tokenLedger } from "./tokenLedger.js";
import { stripeService } from "./stripeService.js";
import {
  calculateCreditsSpent,
  FEATURES,
  SUBSCRIPTION_STATUS,
} from "./subscriptionConfig.js";

// =============================================
// Pre-Run Check Middleware
// =============================================

/**
 * Middleware to check if user has tokens before allowing a run
 * Should be placed BEFORE the run handler
 */
export function requireTokens(estimatedTokens = 1000) {
  return async (req, res, next) => {
    if (!FEATURES.enforceTokenLimits) return next();

    const userId = req.user?.sub;
    if (!userId) {
      return res.status(401).json({ ok: false, error: "UNAUTHORIZED", message: "Authentication required" });
    }

    const subscription = await stripeService.getSubscriptionStatus(userId);
    const allowedStatuses = [SUBSCRIPTION_STATUS.ACTIVE, SUBSCRIPTION_STATUS.TRIALING];

    if (!allowedStatuses.includes(subscription.status)) {
      const balances = await tokenLedger.getTokenBalances(userId);
      if (balances.total < estimatedTokens) {
        return res.status(402).json({
          ok: false,
          error: "SUBSCRIPTION_REQUIRED",
          message: "Please subscribe or start a free trial to continue",
          subscription: { status: subscription.status, currentBalance: balances.total, estimatedUsage: estimatedTokens },
          upgradeUrl: "/subscription",
        });
      }
    }

    if (!(await tokenLedger.hasEnoughTokens(userId, estimatedTokens))) {
      const balances = await tokenLedger.getTokenBalances(userId);
      return res.status(402).json({
        ok: false,
        error: "INSUFFICIENT_TOKENS",
        message: "Not enough tokens. Please wait for daily refresh or upgrade your plan.",
        subscription: { status: subscription.status, plan: subscription.plan },
        tokens: {
          available: balances.total,
          estimated: estimatedTokens,
          daily_free: balances.daily_free,
          monthly: balances.monthly,
          trial_base: balances.trial_base,
        },
        upgradeUrl: "/subscription",
      });
    }

    req.tokenBalances = await tokenLedger.getTokenBalances(userId);
    req.subscription = subscription;
    next();
  };
}

// =============================================
// Post-Run Token Spending
// =============================================

/**
 * Spend tokens after a successful run
 * Call this after getting the actual token usage from the model
 */
export async function spendTokensForRun({
  userId,
  runId,
  inputTokens,
  outputTokens,
  options = {},
}) {
  // Calculate credits with multipliers
  const usage = calculateCreditsSpent(inputTokens, outputTokens, options);
  
  // Attempt to spend tokens
  const result = await tokenLedger.spendTokens({
    userId,
    creditsToSpend: usage.creditsSpent,
    runId,
    reason: `Run ${runId}: ${usage.totalTokens} tokens${usage.multiplierReason ? ` (${usage.multiplierReason})` : ""}`,
  });
  
  if (!result.success) {
    console.error(`[tokenUsage] Failed to spend tokens for run ${runId}:`, result.error);
  }
  
  return {
    ...usage,
    success: result.success,
    balances: result.balances,
    breakdown: result.breakdown,
    error: result.error,
  };
}

// =============================================
// Token Info Helpers
// =============================================

/**
 * Get full token status for a user (for API response)
 */
export async function getTokenStatus(userId) {
  const subscription = await stripeService.getSubscriptionStatus(userId);
  const balances = await tokenLedger.getTokenBalances(userId);
  
  return {
    subscription: {
      status: subscription.status,
      plan: subscription.plan,
      periodEnd: subscription.periodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      trialEnd: subscription.trialEnd,
    },
    tokens: {
      total: balances.total,
      daily_free: balances.daily_free,
      monthly: balances.monthly,
      trial_base: balances.trial_base,
    },
    canRun: balances.total > 0,
  };
}

/**
 * Build token breakdown for UI display
 */
export function buildTokenBreakdown(usage) {
  if (!FEATURES.showTokenBreakdown) {
    return null;
  }
  
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    creditsSpent: usage.creditsSpent,
    multiplier: usage.multiplier,
    multiplierReason: usage.multiplierReason,
  };
}

/**
 * Attach token info to run response
 */
export async function attachTokenInfo(response, userId, usage) {
  const balances = await tokenLedger.getTokenBalances(userId);
  
  response.tokenUsage = buildTokenBreakdown(usage);
  response.creditsRemaining = balances.total;
  
  return response;
}

// =============================================
// Usage Tracking
// =============================================

/**
 * Track usage in runs table
 */
export function updateRunWithUsage(runId, usage) {
  const { db } = require("./db.js");
  
  db.prepare(`
    UPDATE runs SET
      input_tokens = ?,
      output_tokens = ?,
      total_tokens = ?,
      credits_spent = ?,
      multiplier = ?,
      multiplier_reason = ?
    WHERE id = ?
  `).run(
    usage.inputTokens,
    usage.outputTokens,
    usage.totalTokens,
    usage.creditsSpent,
    usage.multiplier,
    usage.multiplierReason,
    runId
  );
}

// =============================================
// Exports
// =============================================

export const tokenUsage = {
  requireTokens,
  spendTokensForRun,
  getTokenStatus,
  buildTokenBreakdown,
  attachTokenInfo,
  updateRunWithUsage,
};

export default tokenUsage;
