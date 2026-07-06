/**
 * User-facing Credits layer over internal token ledger.
 * 1 Credit = CREDIT_RATIO internal tokens.
 */

import { tokenLedger } from "./tokenLedger.js";
import {
  CREDIT_RATIO,
  CREDIT_ALLOWANCE,
  CREDIT_COSTS,
  CREDIT_ACTION_LABELS,
  tokensToCredits,
  creditsToTokens,
} from "./subscriptionConfig.js";

export { CREDIT_COSTS, CREDIT_ACTION_LABELS, tokensToCredits, creditsToTokens };

export function getCreditAllowanceForPlan(plan, subscriptionStatus) {
  if (subscriptionStatus === "trialing") return CREDIT_ALLOWANCE.trial;
  if (plan === "monthly" || plan === "yearly") return CREDIT_ALLOWANCE.paid;
  return CREDIT_ALLOWANCE.free;
}

export async function getCreditsStatus(userId, { plan = "free", subscriptionStatus = "none" } = {}) {
  const balances = await tokenLedger.getTokenBalances(userId);
  const balance = tokensToCredits(balances.total);
  const dailyAllowance = getCreditAllowanceForPlan(plan, subscriptionStatus);
  const poolRemaining = tokensToCredits(balances.monthly + balances.trial_base);
  const dailyBucket = tokensToCredits(balances.daily_free);

  return {
    balance,
    dailyAllowance,
    dailyRemaining: Math.min(balance, dailyBucket),
    poolRemaining,
    internalTokens: balances.total,
    creditCosts: { ...CREDIT_COSTS },
  };
}

/**
 * Debit fixed credits for a named action.
 * @returns {{ success: boolean, creditsDebited?: number, balances?: object, error?: string }}
 */
export async function debitCredits(userId, action, meta = {}) {
  const cost = CREDIT_COSTS[action];
  if (cost == null) {
    return { success: false, error: "UNKNOWN_ACTION", message: `Unknown credit action: ${action}` };
  }
  if (cost === 0) {
    const balances = await tokenLedger.getTokenBalances(userId);
    return { success: true, creditsDebited: 0, balances, action };
  }

  const tokensNeeded = creditsToTokens(cost);
  const label = CREDIT_ACTION_LABELS[action] || action;
  const reason = meta.reason || `${label} (−${cost} credits)`;
  const runId = meta.runId || meta.projectId || null;

  const result = await tokenLedger.spendTokens({
    userId,
    creditsToSpend: tokensNeeded,
    runId,
    reason,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error || "INSUFFICIENT_CREDITS",
      message: result.message || "Not enough credits",
      balances: result.balances,
      creditsRequired: cost,
    };
  }

  return {
    success: true,
    creditsDebited: cost,
    action,
    label,
    balances: result.balances,
  };
}

export async function hasEnoughCredits(userId, action) {
  const cost = CREDIT_COSTS[action] ?? 0;
  if (cost === 0) return true;
  return tokenLedger.hasEnoughTokens(userId, creditsToTokens(cost));
}

export async function getCreditHistory(userId, limit = 20) {
  const rows = await tokenLedger.getTokenHistory(userId, limit);
  return rows
    .filter((r) => (r.tokens_change || 0) < 0)
    .map((r) => ({
      id: r.id,
      credits: -tokensToCredits(Math.abs(r.tokens_change || 0)),
      reason: r.reason || "API usage",
      createdAt: r.created_at,
    }));
}
