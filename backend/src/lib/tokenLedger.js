/**
 * Token Ledger Service
 * 
 * Handles all token-related operations:
 * - Granting tokens (trial, subscription, daily refresh, admin adjustment)
 * - Spending tokens (API usage)
 * - Balance queries
 * - Cache management
 * 
 * Reference: PRD Section 7 - Token Ledger & Backend Enforcement
 */

import { db } from "./db.js";
import {
  BUCKET_TYPES,
  TOKEN_SOURCES,
  TRIAL_BASE_TOKENS,
  TRIAL_DAILY_TOKENS,
  DAILY_CARRY_CAP_TOKENS,
  MONTHLY_PLAN_TOKENS,
  YEARLY_PLAN_TOKENS,
  PAID_DAILY_TOKENS,
  FREE_USER_DAILY_TOKENS,
  TRIAL_DAYS,
} from "./subscriptionConfig.js";

// =============================================
// Balance Queries
// =============================================

/**
 * Get user's token balances from ledger
 * Groups by bucket type and sums non-expired tokens
 */
export function getTokenBalances(userId) {
  const now = new Date().toISOString();
  
  // Get balance for each bucket type
  const balances = {
    daily_free: 0,
    monthly: 0,
    trial_base: 0,
    total: 0,
  };
  
  // Sum all non-expired tokens per bucket
  const rows = db.prepare(`
    SELECT bucket, SUM(tokens_change) as balance
    FROM token_ledger
    WHERE user_id = ?
      AND (expires_at IS NULL OR expires_at > ?)
    GROUP BY bucket
  `).all(userId, now);
  
  for (const row of rows) {
    if (balances.hasOwnProperty(row.bucket)) {
      balances[row.bucket] = Math.max(0, row.balance);
    }
  }
  
  balances.total = balances.daily_free + balances.monthly + balances.trial_base;
  
  return balances;
}

/**
 * Get cached token balances (fast read)
 * Falls back to ledger calculation if cache miss
 */
export function getCachedBalances(userId) {
  const cached = db.prepare(`
    SELECT * FROM token_balances_cache WHERE user_id = ?
  `).get(userId);
  
  if (cached) {
    return {
      daily_free: cached.daily_free_remaining,
      monthly: cached.monthly_remaining,
      trial_base: cached.trial_base_remaining,
      total: cached.total_remaining,
      updatedAt: cached.updated_at,
    };
  }
  
  // Cache miss - calculate from ledger and cache
  const balances = getTokenBalances(userId);
  updateBalanceCache(userId, balances);
  return balances;
}

/**
 * Update the balance cache for a user
 */
export function updateBalanceCache(userId, balances) {
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO token_balances_cache 
      (user_id, daily_free_remaining, monthly_remaining, trial_base_remaining, total_remaining, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      daily_free_remaining = excluded.daily_free_remaining,
      monthly_remaining = excluded.monthly_remaining,
      trial_base_remaining = excluded.trial_base_remaining,
      total_remaining = excluded.total_remaining,
      updated_at = excluded.updated_at
  `).run(
    userId,
    balances.daily_free,
    balances.monthly,
    balances.trial_base,
    balances.total,
    now
  );
}

// =============================================
// Token Grants
// =============================================

/**
 * Grant tokens to a user
 */
export function grantTokens({
  userId,
  bucket,
  tokens,
  source,
  reason,
  expiresAt = null,
  runId = null,
  subscriptionId = null,
  stripeEventId = null,
  adminActor = null,
}) {
  const now = new Date().toISOString();
  
  // Get current balance for this bucket
  const currentBalance = getTokenBalances(userId)[bucket] || 0;
  const newBalance = currentBalance + tokens;
  
  // Insert ledger entry
  const result = db.prepare(`
    INSERT INTO token_ledger (
      user_id, bucket, tokens_change, balance_after,
      expires_at, source, reason, run_id, subscription_id,
      stripe_event_id, admin_actor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    userId,
    bucket,
    tokens,
    newBalance,
    expiresAt,
    source,
    reason,
    runId,
    subscriptionId,
    stripeEventId,
    adminActor,
    now
  );
  
  // Update cache
  const balances = getTokenBalances(userId);
  updateBalanceCache(userId, balances);
  
  console.log(`[tokenLedger] Granted ${tokens} tokens to user ${userId} (bucket: ${bucket}, reason: ${reason})`);
  
  return {
    ledgerId: result.lastInsertRowid,
    newBalance,
    totalBalance: balances.total,
  };
}

/**
 * Grant trial tokens to a new trial user
 */
export function grantTrialTokens(userId, stripeEventId = null) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const expiresAt = trialEnd.toISOString();
  
  // Grant base trial tokens
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.TRIAL_BASE,
    tokens: TRIAL_BASE_TOKENS,
    source: TOKEN_SOURCES.TRIAL_START,
    reason: `Trial started - ${TRIAL_BASE_TOKENS} base tokens`,
    expiresAt,
    stripeEventId,
  });
  
  // Grant initial daily tokens
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: TRIAL_DAILY_TOKENS,
    source: TOKEN_SOURCES.TRIAL_START,
    reason: 'Trial daily tokens - initial grant',
    expiresAt,
    stripeEventId,
  });
  
  console.log(`[tokenLedger] Trial tokens granted to user ${userId}`);
  
  return getTokenBalances(userId);
}

/**
 * Grant subscription tokens for a new billing period
 */
export function grantSubscriptionTokens(userId, plan, stripeEventId = null, subscriptionId = null) {
  const tokens = plan === 'yearly' ? YEARLY_PLAN_TOKENS : MONTHLY_PLAN_TOKENS;
  
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.MONTHLY,
    tokens,
    source: TOKEN_SOURCES.WEBHOOK,
    reason: `${plan} subscription renewal`,
    subscriptionId,
    stripeEventId,
  });
  
  // Also grant daily tokens
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: PAID_DAILY_TOKENS,
    source: TOKEN_SOURCES.WEBHOOK,
    reason: `${plan} subscription daily tokens`,
    subscriptionId,
    stripeEventId,
  });
  
  console.log(`[tokenLedger] Subscription tokens granted to user ${userId} (plan: ${plan})`);
  
  return getTokenBalances(userId);
}

/**
 * Ensure free user has daily tokens
 * Called when checking balance for users without subscriptions
 * Grants initial daily tokens if user has never received any
 */
export function ensureFreeUserTokens(userId) {
  // Check if user has any token records
  const hasRecords = db.prepare(`
    SELECT 1 FROM token_ledger WHERE user_id = ? LIMIT 1
  `).get(userId);
  
  if (hasRecords) {
    // User already has token records, check if needs daily refresh
    const balances = getTokenBalances(userId);
    const today = new Date().toISOString().split('T')[0];
    
    // Check if user got daily tokens today
    const todayGrant = db.prepare(`
      SELECT 1 FROM token_ledger 
      WHERE user_id = ? 
        AND bucket = ? 
        AND source IN (?, ?)
        AND date(created_at) = ?
      LIMIT 1
    `).get(userId, BUCKET_TYPES.DAILY_FREE, TOKEN_SOURCES.CRON, TOKEN_SOURCES.SYSTEM, today);
    
    if (!todayGrant && balances.daily_free < FREE_USER_DAILY_TOKENS) {
      // Grant daily tokens
      const tokensToGrant = FREE_USER_DAILY_TOKENS - balances.daily_free;
      grantTokens({
        userId,
        bucket: BUCKET_TYPES.DAILY_FREE,
        tokens: tokensToGrant,
        source: TOKEN_SOURCES.SYSTEM,
        reason: 'Free user daily tokens',
      });
      console.log(`[tokenLedger] Granted ${tokensToGrant} daily tokens to free user ${userId}`);
      return getTokenBalances(userId);
    }
    
    return balances;
  }
  
  // First time user - grant initial daily tokens
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: FREE_USER_DAILY_TOKENS,
    source: TOKEN_SOURCES.SYSTEM,
    reason: 'Free user initial daily tokens',
  });
  
  console.log(`[tokenLedger] Initialized ${FREE_USER_DAILY_TOKENS} daily tokens for new free user ${userId}`);
  return getTokenBalances(userId);
}

/**
 * Daily token refresh - top up to carry cap
 * Called by daily cron job
 */
export function refreshDailyTokens(userId, isPaid = false) {
  const balances = getTokenBalances(userId);
  const currentDaily = balances.daily_free;
  const dailyAllowance = isPaid ? PAID_DAILY_TOKENS : TRIAL_DAILY_TOKENS;
  
  // Calculate how much to grant (top up to cap, not exceed)
  const tokensToGrant = Math.max(0, Math.min(
    dailyAllowance,
    DAILY_CARRY_CAP_TOKENS - currentDaily
  ));
  
  if (tokensToGrant <= 0) {
    console.log(`[tokenLedger] User ${userId} already at daily cap, no refresh needed`);
    return balances;
  }
  
  grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: tokensToGrant,
    source: TOKEN_SOURCES.CRON,
    reason: `Daily refresh - topped up ${tokensToGrant} tokens`,
  });
  
  console.log(`[tokenLedger] Daily tokens refreshed for user ${userId}: +${tokensToGrant}`);
  
  return getTokenBalances(userId);
}

/**
 * Admin adjustment (with audit trail)
 */
export function adminAdjustment(userId, tokens, reason, adminActor) {
  if (!adminActor) {
    throw new Error('Admin actor is required for adjustments');
  }
  
  return grantTokens({
    userId,
    bucket: BUCKET_TYPES.ADJUSTMENT,
    tokens,
    source: TOKEN_SOURCES.ADMIN,
    reason: `Admin adjustment: ${reason}`,
    adminActor,
  });
}

// =============================================
// Token Spending
// =============================================

/**
 * Check if user has enough tokens (pre-check before run)
 */
export function hasEnoughTokens(userId, estimatedTokens) {
  const balances = getTokenBalances(userId);
  return balances.total >= estimatedTokens;
}

/**
 * Spend tokens - atomic operation with deterministic bucket order
 * Order: daily_free → monthly/trial_base
 * 
 * Returns: { success, creditsSpent, balances, error }
 */
export function spendTokens({
  userId,
  creditsToSpend,
  runId,
  reason = 'API usage',
}) {
  const now = new Date().toISOString();
  const balances = getTokenBalances(userId);
  
  // Check total available
  if (balances.total < creditsToSpend) {
    return {
      success: false,
      error: 'INSUFFICIENT_TOKENS',
      message: `Insufficient tokens. Required: ${creditsToSpend}, Available: ${balances.total}`,
      balances,
    };
  }
  
  // Spend in order: daily_free → monthly → trial_base
  let remaining = creditsToSpend;
  const spendOrder = [
    { bucket: BUCKET_TYPES.DAILY_FREE, available: balances.daily_free },
    { bucket: BUCKET_TYPES.MONTHLY, available: balances.monthly },
    { bucket: BUCKET_TYPES.TRIAL_BASE, available: balances.trial_base },
  ];
  
  const spendRecords = [];
  
  for (const { bucket, available } of spendOrder) {
    if (remaining <= 0) break;
    if (available <= 0) continue;
    
    const toSpend = Math.min(remaining, available);
    remaining -= toSpend;
    
    spendRecords.push({
      bucket,
      tokens: -toSpend,
    });
  }
  
  // Use transaction for atomicity
  const transaction = db.transaction(() => {
    for (const record of spendRecords) {
      const currentBalance = getTokenBalances(userId)[record.bucket] || 0;
      
      db.prepare(`
        INSERT INTO token_ledger (
          user_id, bucket, tokens_change, balance_after,
          source, reason, run_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        record.bucket,
        record.tokens,
        currentBalance + record.tokens,
        TOKEN_SOURCES.API_USAGE,
        reason,
        runId,
        now
      );
    }
  });
  
  try {
    transaction();
  } catch (err) {
    console.error(`[tokenLedger] Error spending tokens for user ${userId}:`, err);
    return {
      success: false,
      error: 'TRANSACTION_FAILED',
      message: 'Failed to process token spend',
      balances,
    };
  }
  
  // Update cache
  const newBalances = getTokenBalances(userId);
  updateBalanceCache(userId, newBalances);
  
  console.log(`[tokenLedger] Spent ${creditsToSpend} tokens for user ${userId} (run: ${runId})`);
  
  return {
    success: true,
    creditsSpent: creditsToSpend,
    balances: newBalances,
    breakdown: spendRecords.map(r => ({
      bucket: r.bucket,
      spent: Math.abs(r.tokens),
    })),
  };
}

// =============================================
// Period End / Cleanup
// =============================================

/**
 * Clear monthly tokens at period end (no rollover)
 */
export function clearMonthlyTokens(userId, reason = 'Period end - no rollover') {
  const balances = getTokenBalances(userId);
  
  if (balances.monthly > 0) {
    grantTokens({
      userId,
      bucket: BUCKET_TYPES.MONTHLY,
      tokens: -balances.monthly,
      source: TOKEN_SOURCES.CRON,
      reason,
    });
  }
  
  console.log(`[tokenLedger] Cleared monthly tokens for user ${userId}`);
  
  return getTokenBalances(userId);
}

/**
 * Expire trial tokens
 */
export function expireTrialTokens(userId) {
  const balances = getTokenBalances(userId);
  
  if (balances.trial_base > 0) {
    grantTokens({
      userId,
      bucket: BUCKET_TYPES.TRIAL_BASE,
      tokens: -balances.trial_base,
      source: TOKEN_SOURCES.CRON,
      reason: 'Trial expired',
    });
  }
  
  console.log(`[tokenLedger] Expired trial tokens for user ${userId}`);
  
  return getTokenBalances(userId);
}

// =============================================
// Audit & History
// =============================================

/**
 * Get token history for a user
 */
export function getTokenHistory(userId, limit = 50, offset = 0) {
  const rows = db.prepare(`
    SELECT *
    FROM token_ledger
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(userId, limit, offset);
  
  return rows;
}

/**
 * Get usage summary for a period
 */
export function getUsageSummary(userId, startDate, endDate) {
  const row = db.prepare(`
    SELECT 
      SUM(CASE WHEN tokens_change < 0 THEN ABS(tokens_change) ELSE 0 END) as total_spent,
      SUM(CASE WHEN tokens_change > 0 THEN tokens_change ELSE 0 END) as total_granted,
      COUNT(CASE WHEN source = 'api_usage' THEN 1 END) as api_calls
    FROM token_ledger
    WHERE user_id = ?
      AND created_at >= ?
      AND created_at <= ?
  `).get(userId, startDate, endDate);
  
  return {
    totalSpent: row?.total_spent || 0,
    totalGranted: row?.total_granted || 0,
    apiCalls: row?.api_calls || 0,
  };
}

// =============================================
// Exports
// =============================================

export const tokenLedger = {
  getTokenBalances,
  getCachedBalances,
  grantTokens,
  grantTrialTokens,
  grantSubscriptionTokens,
  ensureFreeUserTokens,
  refreshDailyTokens,
  adminAdjustment,
  hasEnoughTokens,
  spendTokens,
  clearMonthlyTokens,
  expireTrialTokens,
  getTokenHistory,
  getUsageSummary,
};

export default tokenLedger;
