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

import { db, ensureColumn } from "./db.js";
import { dbGet, dbRun, dbAll, USE_POSTGRES } from "./dbHelpers.js";
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
export async function getTokenBalances(userId) {
  const now = new Date().toISOString();

  const balances = {
    daily_free: 0,
    monthly: 0,
    trial_base: 0,
    total: 0,
  };

  const rows = await dbAll(
    `SELECT bucket, SUM(tokens_change) as balance
     FROM token_ledger
     WHERE user_id = ? AND (expires_at IS NULL OR expires_at > ?)
     GROUP BY bucket`,
    [userId, now]
  );

  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(balances, row.bucket)) {
      balances[row.bucket] = Math.max(0, Number(row.balance) || 0);
    }
  }

  balances.total = balances.daily_free + balances.monthly + balances.trial_base;
  return balances;
}

export async function getCachedBalances(userId) {
  const cached = await dbGet(`SELECT * FROM token_balances_cache WHERE user_id = ?`, [userId]);

  if (cached) {
    return {
      daily_free: cached.daily_free_remaining,
      monthly: cached.monthly_remaining,
      trial_base: cached.trial_base_remaining,
      total: cached.total_remaining,
      updatedAt: cached.updated_at,
    };
  }

  const balances = await getTokenBalances(userId);
  await updateBalanceCache(userId, balances);
  return balances;
}

export async function updateBalanceCache(userId, balances) {
  const now = new Date().toISOString();

  if (USE_POSTGRES) {
    await dbRun(
      `INSERT INTO token_balances_cache
        (user_id, daily_free_remaining, monthly_remaining, trial_base_remaining, total_remaining, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id) DO UPDATE SET
        daily_free_remaining = EXCLUDED.daily_free_remaining,
        monthly_remaining = EXCLUDED.monthly_remaining,
        trial_base_remaining = EXCLUDED.trial_base_remaining,
        total_remaining = EXCLUDED.total_remaining,
        updated_at = EXCLUDED.updated_at`,
      [userId, balances.daily_free, balances.monthly, balances.trial_base, balances.total, now]
    );
    return;
  }

  await dbRun(
    `INSERT INTO token_balances_cache
      (user_id, daily_free_remaining, monthly_remaining, trial_base_remaining, total_remaining, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
      daily_free_remaining = excluded.daily_free_remaining,
      monthly_remaining = excluded.monthly_remaining,
      trial_base_remaining = excluded.trial_base_remaining,
      total_remaining = excluded.total_remaining,
      updated_at = excluded.updated_at`,
    [userId, balances.daily_free, balances.monthly, balances.trial_base, balances.total, now]
  );
}

// =============================================
// Token Grants
// =============================================

/**
 * Grant tokens to a user
 */
export async function grantTokens({
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
  const currentBalance = (await getTokenBalances(userId))[bucket] || 0;
  const newBalance = currentBalance + tokens;

  const result = await dbRun(
    `INSERT INTO token_ledger (
      user_id, bucket, tokens_change, balance_after,
      expires_at, source, reason, run_id, subscription_id,
      stripe_event_id, admin_actor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      now,
    ]
  );

  const balances = await getTokenBalances(userId);
  await updateBalanceCache(userId, balances);
  
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
export async function grantTrialTokens(userId, stripeEventId = null) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);
  const expiresAt = trialEnd.toISOString();
  
  // Grant base trial tokens
  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.TRIAL_BASE,
    tokens: TRIAL_BASE_TOKENS,
    source: TOKEN_SOURCES.TRIAL_START,
    reason: `Trial started - ${TRIAL_BASE_TOKENS} base tokens`,
    expiresAt,
    stripeEventId,
  });
  
  // Grant initial daily tokens
  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: TRIAL_DAILY_TOKENS,
    source: TOKEN_SOURCES.TRIAL_START,
    reason: 'Trial daily tokens - initial grant',
    expiresAt,
    stripeEventId,
  });
  
  console.log(`[tokenLedger] Trial tokens granted to user ${userId}`);
  
  return await getTokenBalances(userId);
}

export async function grantSubscriptionTokens(userId, plan, stripeEventId = null, subscriptionId = null) {
  const tokens = plan === 'yearly' ? YEARLY_PLAN_TOKENS : MONTHLY_PLAN_TOKENS;
  
  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.MONTHLY,
    tokens,
    source: TOKEN_SOURCES.WEBHOOK,
    reason: `${plan} subscription renewal`,
    subscriptionId,
    stripeEventId,
  });
  
  // Also grant daily tokens
  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: PAID_DAILY_TOKENS,
    source: TOKEN_SOURCES.WEBHOOK,
    reason: `${plan} subscription daily tokens`,
    subscriptionId,
    stripeEventId,
  });
  
  console.log(`[tokenLedger] Subscription tokens granted to user ${userId} (plan: ${plan})`);
  
  return await getTokenBalances(userId);
}

export async function ensureFreeUserTokens(userId) {
  const hasRecords = await dbGet(`SELECT 1 AS ok FROM token_ledger WHERE user_id = ? LIMIT 1`, [userId]);

  if (hasRecords) {
    const balances = await getTokenBalances(userId);
    const today = new Date().toISOString().split("T")[0];
    const todayStart = `${today}T00:00:00.000Z`;

    const todayGrant = await dbGet(
      `SELECT 1 AS ok FROM token_ledger
       WHERE user_id = ? AND bucket = ?
         AND source IN (?, ?)
         AND created_at >= ?
       LIMIT 1`,
      [userId, BUCKET_TYPES.DAILY_FREE, TOKEN_SOURCES.CRON, TOKEN_SOURCES.SYSTEM, todayStart]
    );

    if (!todayGrant && balances.daily_free < FREE_USER_DAILY_TOKENS) {
      const tokensToGrant = FREE_USER_DAILY_TOKENS - balances.daily_free;
      await grantTokens({
        userId,
        bucket: BUCKET_TYPES.DAILY_FREE,
        tokens: tokensToGrant,
        source: TOKEN_SOURCES.SYSTEM,
        reason: "Free user daily tokens",
      });
      return await getTokenBalances(userId);
    }

    return balances;
  }

  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: FREE_USER_DAILY_TOKENS,
    source: TOKEN_SOURCES.SYSTEM,
    reason: "Free user initial daily tokens",
  });

  return await getTokenBalances(userId);
}

export async function refreshDailyTokens(userId, isPaid = false) {
  const balances = await getTokenBalances(userId);
  const currentDaily = balances.daily_free;
  const dailyAllowance = isPaid ? PAID_DAILY_TOKENS : TRIAL_DAILY_TOKENS;
  const tokensToGrant = Math.max(0, Math.min(dailyAllowance, DAILY_CARRY_CAP_TOKENS - currentDaily));

  if (tokensToGrant <= 0) return balances;

  await grantTokens({
    userId,
    bucket: BUCKET_TYPES.DAILY_FREE,
    tokens: tokensToGrant,
    source: TOKEN_SOURCES.CRON,
    reason: `Daily refresh - topped up ${tokensToGrant} tokens`,
  });

  return await getTokenBalances(userId);
}

export async function adminAdjustment(userId, tokens, reason, adminActor) {
  if (!adminActor) throw new Error("Admin actor is required for adjustments");
  return await grantTokens({
    userId,
    bucket: BUCKET_TYPES.ADJUSTMENT,
    tokens,
    source: TOKEN_SOURCES.ADMIN,
    reason: `Admin adjustment: ${reason}`,
    adminActor,
  });
}

export async function hasEnoughTokens(userId, estimatedTokens) {
  const balances = await getTokenBalances(userId);
  return balances.total >= estimatedTokens;
}

export async function spendTokens({ userId, creditsToSpend, runId, reason = "API usage" }) {
  const now = new Date().toISOString();
  const balances = await getTokenBalances(userId);

  if (balances.total < creditsToSpend) {
    return {
      success: false,
      error: "INSUFFICIENT_TOKENS",
      message: `Insufficient tokens. Required: ${creditsToSpend}, Available: ${balances.total}`,
      balances,
    };
  }

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
    spendRecords.push({ bucket, tokens: -toSpend });
  }

  try {
    if (USE_POSTGRES) {
      await db.transaction(async () => {
        for (const record of spendRecords) {
          const currentBalance = (await getTokenBalances(userId))[record.bucket] || 0;
          await dbRun(
            `INSERT INTO token_ledger (user_id, bucket, tokens_change, balance_after, source, reason, run_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              record.bucket,
              record.tokens,
              currentBalance + record.tokens,
              TOKEN_SOURCES.API_USAGE,
              reason,
              runId,
              now,
            ]
          );
        }
      });
    } else {
      const transaction = db.transaction(() => {
        for (const record of spendRecords) {
          const bucketBalances = db.prepare(
            `SELECT bucket, SUM(tokens_change) as balance FROM token_ledger
             WHERE user_id = ? AND bucket = ? GROUP BY bucket`
          ).get(userId, record.bucket);
          const currentBalance = bucketBalances?.balance || 0;
          db.prepare(
            `INSERT INTO token_ledger (user_id, bucket, tokens_change, balance_after, source, reason, run_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).run(
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
      transaction();
    }
  } catch (err) {
    console.error(`[tokenLedger] Error spending tokens for user ${userId}:`, err);
    return { success: false, error: "TRANSACTION_FAILED", message: "Failed to process token spend", balances };
  }

  const newBalances = await getTokenBalances(userId);
  await updateBalanceCache(userId, newBalances);
  return {
    success: true,
    creditsSpent: creditsToSpend,
    balances: newBalances,
    breakdown: spendRecords.map((r) => ({ bucket: r.bucket, spent: Math.abs(r.tokens) })),
  };
}

export async function clearMonthlyTokens(userId, reason = "Period end - no rollover") {
  const balances = await getTokenBalances(userId);
  if (balances.monthly > 0) {
    await grantTokens({
      userId,
      bucket: BUCKET_TYPES.MONTHLY,
      tokens: -balances.monthly,
      source: TOKEN_SOURCES.CRON,
      reason,
    });
  }
  return await getTokenBalances(userId);
}

export async function expireTrialTokens(userId) {
  const balances = await getTokenBalances(userId);
  if (balances.trial_base > 0) {
    await grantTokens({
      userId,
      bucket: BUCKET_TYPES.TRIAL_BASE,
      tokens: -balances.trial_base,
      source: TOKEN_SOURCES.CRON,
      reason: "Trial expired",
    });
  }
  return await getTokenBalances(userId);
}

export async function getTokenHistory(userId, limit = 50, offset = 0) {
  return await dbAll(
    `SELECT * FROM token_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [userId, limit, offset]
  );
}

export async function getUsageSummary(userId, startDate, endDate) {
  const row = await dbGet(
    `SELECT
      SUM(CASE WHEN tokens_change < 0 THEN ABS(tokens_change) ELSE 0 END) as total_spent,
      SUM(CASE WHEN tokens_change > 0 THEN tokens_change ELSE 0 END) as total_granted,
      COUNT(CASE WHEN source = 'api_usage' THEN 1 END) as api_calls
     FROM token_ledger
     WHERE user_id = ? AND created_at >= ? AND created_at <= ?`,
    [userId, startDate, endDate]
  );

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
