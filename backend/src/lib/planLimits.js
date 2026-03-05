/**
 * Plan Limits Enforcement
 * 
 * Enforces subscription plan limits:
 * - Free Plan: 
 *   - Prompt optimization: 8 times/day
 *   - Question Wizard: 5 times/day
 *   - Only Standard/Fast modes allowed (not deep/ultra)
 * - Monthly/Yearly/Trial:
 *   - Prompt optimization: 50 times/day
 *   - Question Wizard: 30 times/day
 */

import { db } from "./db.js";
import { stripeService } from "./stripeService.js";
import { getLocalDateKey, normalizeTimeZone } from "./timezone.js";
import {
  SUBSCRIPTION_STATUS,
  DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
  DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
} from "./subscriptionConfig.js";

// Plan limits configuration
const PLAN_LIMITS = {
  free: {
    promptOptimization: {
      daily: 8,
      allowedModes: ['fast', 'standard'] // Only fast and standard modes (not deep/ultra)
    },
    questionWizard: {
      daily: 5
    }
  },
  monthly: {
    promptOptimization: {
      daily: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
    },
    questionWizard: {
      daily: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
  },
  yearly: {
    promptOptimization: {
      daily: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
    },
    questionWizard: {
      daily: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
  },
  trial: {
    promptOptimization: {
      daily: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
    },
    questionWizard: {
      daily: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
  }
};

/**
 * Get user's effective plan
 * Returns: 'free', 'monthly', 'yearly', or 'trial'
 */
export function getUserPlan(userId) {
  if (!userId) {
    return 'free';
  }
  
  const subscription = stripeService.getSubscriptionStatus(userId);
  
  // Check subscription status
  if (subscription.status === SUBSCRIPTION_STATUS.TRIALING || 
      subscription.status === SUBSCRIPTION_STATUS.ACTIVE) {
    // Map plan to our internal plan types
    if (subscription.plan === 'monthly') return 'monthly';
    if (subscription.plan === 'yearly') return 'yearly';
    // Trial users get paid plan limits
    if (subscription.status === SUBSCRIPTION_STATUS.TRIALING) return 'trial';
  }
  
  return 'free';
}

/**
 * Check if user can use a specific mode
 * Free plan users can only use 'fast' or 'standard' modes
 */
export function canUseMode(userId, mode) {
  const plan = getUserPlan(userId);
  
  // Pro plans can use any mode
  if (!PLAN_LIMITS[plan]) {
    return true;
  }
  
  // Free plan has mode restrictions
  const limits = PLAN_LIMITS[plan];
  if (limits?.promptOptimization?.allowedModes) {
    // Normalize mode name: 'deep' -> 'deep', 'ultra' -> 'ultra', 'fast' -> 'fast', 'standard' -> 'standard'
    const normalizedMode = mode?.toLowerCase();
    
    // Map common mode names
    const modeMap = {
      'fast': 'fast',
      'standard': 'standard',
      'deep': 'deep',
      'ultra': 'ultra',
      'deep thinking': 'deep',
      'ultra thinking': 'ultra'
    };
    
    const actualMode = modeMap[normalizedMode] || normalizedMode;
    
    return limits.promptOptimization.allowedModes.includes(actualMode);
  }
  
  return true;
}

/**
 * Get daily usage count for a feature
 * @param {string} userId - User ID
 * @param {string} featureType - 'prompt_optimization' or 'question_wizard'
 * @param {string} date - Date in YYYY-MM-DD format (defaults to today)
 */
export function getDailyUsage(userId, featureType, date = null) {
  if (!userId) return 0;

  if (!date) {
    const row = db.prepare("SELECT timezone FROM users WHERE id = ?").get(userId);
    const tz = normalizeTimeZone(row?.timezone);
    date = getLocalDateKey(tz, new Date());
  }
  
  try {
    const result = db.prepare(`
      SELECT COUNT(*) as count
      FROM plan_usage
      WHERE user_id = ? 
        AND feature_type = ? 
        AND date = ?
    `).get(userId, featureType, date);
    
    const count = result?.count || 0;
    console.log(`[planLimits] Daily usage for user ${userId}, feature ${featureType}, date ${date}: ${count}`);
    return count;
  } catch (err) {
    console.error(`[planLimits] ❌ Failed to get daily usage:`, err);
    return 0;
  }
}

/**
 * Record usage of a feature
 * @param {string} userId - User ID
 * @param {string} featureType - 'prompt_optimization' or 'question_wizard'
 */
export function recordUsage(userId, featureType) {
  if (!userId) return;

  const row = db.prepare("SELECT timezone FROM users WHERE id = ?").get(userId);
  const tz = normalizeTimeZone(row?.timezone);
  const today = getLocalDateKey(tz, new Date());
  const now = new Date().toISOString();
  
  console.log(`[planLimits] Recording usage for user ${userId}, feature: ${featureType}, date: ${today}`);
  
  try {
    db.prepare(`
      INSERT INTO plan_usage (id, user_id, feature_type, date, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      `usage_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      featureType,
      today,
      now
    );
    console.log(`[planLimits] ✅ Usage recorded successfully`);
  } catch (err) {
    console.error(`[planLimits] ❌ Failed to record usage:`, err);
  }
}

/**
 * Check if user can use prompt optimization
 * @param {string} userId - User ID
 * @returns {object} { allowed: boolean, reason?: string, usage?: number, limit?: number }
 */
export function canUsePromptOptimization(userId) {
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  
  if (!limits) return { allowed: true };
  
  const dailyUsage = getDailyUsage(userId, 'prompt_optimization');
  const limit = limits.promptOptimization.daily;
  
  if (dailyUsage >= limit) {
    return {
      allowed: false,
      reason: `Daily limit reached. This plan allows ${limit} prompt optimizations per day.`,
      usage: dailyUsage,
      limit: limit
    };
  }
  
  return {
    allowed: true,
    usage: dailyUsage,
    limit: limit
  };
}

/**
 * Check if user can use question wizard
 * @param {string} userId - User ID
 * @returns {object} { allowed: boolean, reason?: string, usage?: number, limit?: number }
 */
export function canUseQuestionWizard(userId) {
  const plan = getUserPlan(userId);
  const limits = PLAN_LIMITS[plan];
  
  if (!limits) return { allowed: true };
  
  const dailyUsage = getDailyUsage(userId, 'question_wizard');
  const limit = limits.questionWizard.daily;
  
  if (dailyUsage >= limit) {
    return {
      allowed: false,
      reason: `Daily limit reached. This plan allows ${limit} Question Wizard sessions per day.`,
      usage: dailyUsage,
      limit: limit
    };
  }
  
  return {
    allowed: true,
    usage: dailyUsage,
    limit: limit
  };
}

/**
 * Check and enforce prompt optimization limits
 * This should be called before processing the request
 * @param {string} userId - User ID
 * @param {string} mode - The mode being used (for free plan validation)
 * @returns {object} { allowed: boolean, reason?: string }
 */
export function checkPromptOptimizationLimit(userId, mode = null) {
  // Check mode restrictions first (for free plan)
  if (mode && !canUseMode(userId, mode)) {
    return {
      allowed: false,
      reason: 'Free plan only supports Standard and Fast modes. Please upgrade to use Deep or Ultra Thinking modes.'
    };
  }
  
  // Check usage limits
  return canUsePromptOptimization(userId);
}

/**
 * Check and enforce question wizard limits
 * This should be called before processing the request
 * @param {string} userId - User ID
 * @returns {object} { allowed: boolean, reason?: string }
 */
export function checkQuestionWizardLimit(userId) {
  return canUseQuestionWizard(userId);
}

console.log("[quizall] Plan limits module loaded");
