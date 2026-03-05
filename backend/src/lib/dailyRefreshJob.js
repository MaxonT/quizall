/**
 * Daily Token Refresh Job
 * 
 * Cron job to refresh daily tokens for all active users.
 * Each user's tokens refresh based on their local timezone midnight, not UTC.
 * 
 * Reference: PRD Section 14 - Daily Refresh Job Definition
 */

import { db } from "./db.js";
import { tokenLedger } from "./tokenLedger.js";
import { stripeService } from "./stripeService.js";
import { getLocalDateKey, normalizeTimeZone } from "./timezone.js";
import {
  DAILY_REFRESH_HOUR_UTC,
  SUBSCRIPTION_STATUS,
} from "./subscriptionConfig.js";

/**
 * Get all users who need daily token refresh
 * Now includes their timezone information
 */
function getActiveUsers() {
  // Get users with active subscriptions or active trials, including their timezone
  const users = db.prepare(`
    SELECT DISTINCT u.id, u.email, u.timezone, s.status, s.plan
    FROM users u
    LEFT JOIN subscriptions s ON u.id = s.user_id
    WHERE s.status IN ('active', 'trialing')
    ORDER BY u.id
  `).all();
  
  return users;
}

/**
 * Check if a user's local daily refresh should happen now
 * Returns true if the user's local date has changed since last refresh
 */
function shouldRefreshUserToday(userId, userTimezone) {
  const tz = normalizeTimeZone(userTimezone);
  const now = new Date();
  const userLocalDate = getLocalDateKey(tz, now);
  
  // Check last refresh date for this user
  const lastRefresh = db.prepare(`
    SELECT last_daily_refresh_date FROM user_daily_refresh_tracker
    WHERE user_id = ?
  `).get(userId);
  
  // If no record or date has changed, user needs refresh
  if (!lastRefresh || lastRefresh.last_daily_refresh_date !== userLocalDate) {
    return true;
  }
  
  return false;
}

/**
 * Mark a user as refreshed for their local date
 */
function markUserRefreshedToday(userId, userTimezone) {
  const tz = normalizeTimeZone(userTimezone);
  const now = new Date();
  const userLocalDate = getLocalDateKey(tz, now);
  const timestamp = now.toISOString();
  
  db.prepare(`
    INSERT INTO user_daily_refresh_tracker (user_id, last_daily_refresh_date, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      last_daily_refresh_date = excluded.last_daily_refresh_date,
      updated_at = excluded.updated_at
  `).run(userId, userLocalDate, timestamp);
}

/**
 * Refresh tokens for a single user
 */
function refreshUserTokens(user) {
  try {
    // Check if this user's local day has changed
    if (!shouldRefreshUserToday(user.id, user.timezone)) {
      return {
        userId: user.id,
        success: true,
        skipped: true,
        reason: `Already refreshed for local date in timezone ${user.timezone}`,
      };
    }
    
    const isPaid = user.status === SUBSCRIPTION_STATUS.ACTIVE;
    const result = tokenLedger.refreshDailyTokens(user.id, isPaid);
    
    // Mark as refreshed for this user's local date
    markUserRefreshedToday(user.id, user.timezone);
    
    return {
      userId: user.id,
      success: true,
      newTotal: result.total,
    };
  } catch (err) {
    console.error(`[dailyRefresh] Error refreshing tokens for user ${user.id}:`, err);
    return {
      userId: user.id,
      success: false,
      error: err.message,
    };
  }
}

/**
 * Run the daily refresh job
 * Checks all users and refreshes those whose local date has changed
 */
export function runDailyRefresh() {
  console.log("[dailyRefresh] Starting daily token refresh (checking all users' local timezones)...");
  
  const users = getActiveUsers();
  const results = {
    timestamp: new Date().toISOString(),
    totalUsers: users.length,
    successful: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  
  for (const user of users) {
    const result = refreshUserTokens(user);
    
    if (result.success) {
      if (result.skipped) {
        results.skipped++;
      } else {
        results.successful++;
      }
    } else {
      results.failed++;
      results.errors.push({
        userId: result.userId,
        error: result.error,
      });
    }
  }
  
  console.log(`[dailyRefresh] Completed: ${results.successful} refreshed, ${results.skipped} skipped, ${results.failed} failed`);
  
  return results;
}

/**
 * Check if it's time to run the daily refresh
 * Now runs continuously since users have different timezones
 */
export function shouldRunRefresh() {
  // Always return true - let runDailyRefresh handle timezone logic for each user
  return true;
}

/**
 * Start the refresh scheduler
 * Now checks every hour to see if any user's local date has changed
 */
let schedulerInterval = null;

export function startScheduler() {
  if (schedulerInterval) {
    console.log("[dailyRefresh] Scheduler already running");
    return;
  }
  
  console.log("[dailyRefresh] Starting scheduler (checking hourly for users with timezone changes)");
  
  // Check immediately on start
  if (shouldRunRefresh()) {
    runDailyRefresh();
  }
  
  // Check every hour - since timezones vary, we need frequent checks
  schedulerInterval = setInterval(() => {
    if (shouldRunRefresh()) {
      runDailyRefresh();
    }
  }, 60 * 60 * 1000); // 1 hour
}

export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("[dailyRefresh] Scheduler stopped");
  }
}

/**
 * Manual trigger for testing/admin
 * Resets all users' refresh trackers to force refresh
 */
export function forceRefresh() {
  // Clear all refresh trackers to force refresh for all users
  db.prepare(`DELETE FROM user_daily_refresh_tracker`).run();
  return runDailyRefresh();
}

// =============================================
// Period End Processing
// =============================================

/**
 * Process subscription period ends
 * Called daily to handle:
 * - Expired trials
 * - Subscription renewals (token clearing)
 */
export function processPeriodEnds() {
  const now = new Date().toISOString();
  
  // Find trials that have expired
  const expiredTrials = db.prepare(`
    SELECT user_id FROM subscriptions
    WHERE status = 'trialing'
      AND trial_end IS NOT NULL
      AND trial_end < ?
  `).all(now);
  
  for (const trial of expiredTrials) {
    try {
      // Expire trial tokens
      tokenLedger.expireTrialTokens(trial.user_id);
      
      // Update status (Stripe webhook should handle this, but backup)
      db.prepare(`
        UPDATE subscriptions 
        SET status = 'canceled', updated_at = datetime('now')
        WHERE user_id = ? AND status = 'trialing'
      `).run(trial.user_id);
      
      console.log(`[periodEnd] Expired trial for user ${trial.user_id}`);
    } catch (err) {
      console.error(`[periodEnd] Error expiring trial for user ${trial.user_id}:`, err);
    }
  }
  
  // Find subscriptions at period end (for no-rollover clearing)
  // This is mainly handled by Stripe webhooks, but this is a safety net
  const periodEnds = db.prepare(`
    SELECT user_id, plan FROM subscriptions
    WHERE status = 'active'
      AND period_end IS NOT NULL
      AND period_end < ?
      AND period_end > datetime(?, '-1 day')
  `).all(now, now);
  
  for (const sub of periodEnds) {
    try {
      // Clear old tokens (new tokens will be granted by webhook on payment)
      tokenLedger.clearMonthlyTokens(sub.user_id, "Period end - awaiting renewal");
      console.log(`[periodEnd] Cleared tokens for user ${sub.user_id} at period end`);
    } catch (err) {
      console.error(`[periodEnd] Error clearing tokens for user ${sub.user_id}:`, err);
    }
  }
  
  return {
    expiredTrials: expiredTrials.length,
    periodEnds: periodEnds.length,
  };
}

// =============================================
// Exports
// =============================================

export const dailyRefreshJob = {
  runDailyRefresh,
  shouldRunRefresh,
  startScheduler,
  stopScheduler,
  forceRefresh,
  processPeriodEnds,
};

export default dailyRefreshJob;
