/**
 * Trial Anti-Abuse Service
 * 
 * Implements safety controls to prevent trial farming:
 * - Email verification requirements
 * - Disposable email detection
 * - IP rate limiting
 * - Device fingerprint tracking
 * - Risk scoring
 * 
 * Reference: PRD Section 8.3 - Trial anti-farming
 */

import { db } from "./db.js";
import {
  DISPOSABLE_EMAIL_DOMAINS,
  MAX_REGISTRATIONS_PER_IP_DAY,
  MAX_TRIALS_PER_IP_MONTH,
  RISK_THRESHOLD_REQUIRE_PAYMENT,
} from "./subscriptionConfig.js";

// =============================================
// Email Verification
// =============================================

/**
 * Check if email is from a disposable email domain
 */
export function isDisposableEmail(email) {
  if (!email) return false;
  
  const domain = email.toLowerCase().split("@")[1];
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

/**
 * Check if user has verified email
 */
export function isEmailVerified(userId) {
  const user = db.prepare(`
    SELECT email_verified FROM users WHERE id = ?
  `).get(userId);
  
  return user?.email_verified === 1;
}

/**
 * Mark email as verified
 */
export function markEmailVerified(userId) {
  db.prepare(`
    UPDATE users 
    SET email_verified = 1, email_verified_at = datetime('now'), updated_at = datetime('now')
    WHERE id = ?
  `).run(userId);
  
  console.log(`[antiAbuse] Email verified for user ${userId}`);
}

// =============================================
// IP Rate Limiting
// =============================================

/**
 * Get IP rate limit record
 */
export function getIpRateLimit(ipAddress) {
  return db.prepare(`
    SELECT * FROM ip_rate_limits WHERE ip_address = ?
  `).get(ipAddress);
}

/**
 * Increment registration count for IP
 */
export function incrementRegistrationCount(ipAddress) {
  const now = new Date().toISOString();
  const today = now.split("T")[0];
  
  const existing = getIpRateLimit(ipAddress);
  
  if (existing) {
    const lastDate = existing.last_registration?.split("T")[0];
    
    if (lastDate === today) {
      // Same day - increment
      db.prepare(`
        UPDATE ip_rate_limits 
        SET registration_count = registration_count + 1, 
            last_registration = ?,
            updated_at = ?
        WHERE ip_address = ?
      `).run(now, now, ipAddress);
    } else {
      // New day - reset to 1
      db.prepare(`
        UPDATE ip_rate_limits 
        SET registration_count = 1, 
            last_registration = ?,
            updated_at = ?
        WHERE ip_address = ?
      `).run(now, now, ipAddress);
    }
  } else {
    // New IP
    db.prepare(`
      INSERT INTO ip_rate_limits (ip_address, registration_count, last_registration, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?)
    `).run(ipAddress, now, now, now);
  }
}

/**
 * Increment trial count for IP
 */
export function incrementTrialCount(ipAddress) {
  const now = new Date().toISOString();
  
  const existing = getIpRateLimit(ipAddress);
  
  if (existing) {
    // Check if within same month
    const lastMonth = existing.last_trial?.substring(0, 7);
    const currentMonth = now.substring(0, 7);
    
    if (lastMonth === currentMonth) {
      db.prepare(`
        UPDATE ip_rate_limits 
        SET trial_count = trial_count + 1, 
            last_trial = ?,
            updated_at = ?
        WHERE ip_address = ?
      `).run(now, now, ipAddress);
    } else {
      // New month - reset
      db.prepare(`
        UPDATE ip_rate_limits 
        SET trial_count = 1, 
            last_trial = ?,
            updated_at = ?
        WHERE ip_address = ?
      `).run(now, now, ipAddress);
    }
  } else {
    db.prepare(`
      INSERT INTO ip_rate_limits (ip_address, trial_count, last_trial, created_at, updated_at)
      VALUES (?, 1, ?, ?, ?)
    `).run(ipAddress, now, now, now);
  }
}

/**
 * Check if IP has exceeded registration rate limit
 */
export function isRegistrationRateLimited(ipAddress) {
  const record = getIpRateLimit(ipAddress);
  if (!record) return false;
  
  const today = new Date().toISOString().split("T")[0];
  const lastDate = record.last_registration?.split("T")[0];
  
  if (lastDate !== today) return false;
  
  return record.registration_count >= MAX_REGISTRATIONS_PER_IP_DAY;
}

/**
 * Check if IP has exceeded trial rate limit
 */
export function isTrialRateLimited(ipAddress) {
  const record = getIpRateLimit(ipAddress);
  if (!record) return false;
  
  const currentMonth = new Date().toISOString().substring(0, 7);
  const lastMonth = record.last_trial?.substring(0, 7);
  
  if (lastMonth !== currentMonth) return false;
  
  return record.trial_count >= MAX_TRIALS_PER_IP_MONTH;
}

// =============================================
// Device Fingerprint Tracking
// =============================================

/**
 * Check if fingerprint has been used for trial
 */
export function isFingerprintUsed(fingerprint) {
  if (!fingerprint) return false;
  
  const existing = db.prepare(`
    SELECT COUNT(*) as count 
    FROM trial_abuse_checks 
    WHERE device_fingerprint = ? AND trial_blocked = 0
  `).get(fingerprint);
  
  return existing?.count > 0;
}

/**
 * Record fingerprint for trial
 */
export function recordFingerprint(userId, fingerprint, ipAddress) {
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT INTO trial_abuse_checks (
      user_id, device_fingerprint, ip_address, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      device_fingerprint = excluded.device_fingerprint,
      ip_address = excluded.ip_address,
      updated_at = excluded.updated_at
  `).run(userId, fingerprint, ipAddress, now, now);
}

// =============================================
// Risk Scoring
// =============================================

/**
 * Calculate risk score for a trial request
 */
export function calculateRiskScore({
  email,
  ipAddress,
  fingerprint,
  userId,
}) {
  let score = 0;
  const flags = [];
  
  // Check disposable email (+40 points)
  if (isDisposableEmail(email)) {
    score += 40;
    flags.push("disposable_email");
  }
  
  // Check IP rate limit (+30 points)
  if (isTrialRateLimited(ipAddress)) {
    score += 30;
    flags.push("ip_rate_limited");
  }
  
  // Check high registration velocity (+20 points)
  if (isRegistrationRateLimited(ipAddress)) {
    score += 20;
    flags.push("high_registration_velocity");
  }
  
  // Check duplicate fingerprint (+25 points)
  if (isFingerprintUsed(fingerprint)) {
    score += 25;
    flags.push("duplicate_fingerprint");
  }
  
  // Check if user already used trial (+50 points)
  const user = db.prepare(`
    SELECT trial_used FROM users WHERE id = ?
  `).get(userId);
  
  if (user?.trial_used) {
    score += 50;
    flags.push("trial_already_used");
  }
  
  return {
    score: Math.min(100, score),
    flags,
    requiresPaymentMethod: score >= RISK_THRESHOLD_REQUIRE_PAYMENT,
  };
}

/**
 * Record risk assessment
 */
export function recordRiskAssessment({
  userId,
  email,
  ipAddress,
  fingerprint,
  riskScore,
  flags,
  blocked,
  blockedReason,
}) {
  const now = new Date().toISOString();
  const domain = email?.toLowerCase().split("@")[1];
  
  db.prepare(`
    INSERT INTO trial_abuse_checks (
      user_id, ip_address, device_fingerprint, email_domain,
      risk_score, is_disposable_email, is_high_velocity_ip,
      is_duplicate_fingerprint, requires_payment_method,
      trial_blocked, blocked_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      ip_address = excluded.ip_address,
      device_fingerprint = excluded.device_fingerprint,
      email_domain = excluded.email_domain,
      risk_score = excluded.risk_score,
      is_disposable_email = excluded.is_disposable_email,
      is_high_velocity_ip = excluded.is_high_velocity_ip,
      is_duplicate_fingerprint = excluded.is_duplicate_fingerprint,
      requires_payment_method = excluded.requires_payment_method,
      trial_blocked = excluded.trial_blocked,
      blocked_reason = excluded.blocked_reason,
      updated_at = excluded.updated_at
  `).run(
    userId,
    ipAddress,
    fingerprint,
    domain,
    riskScore,
    flags.includes("disposable_email") ? 1 : 0,
    flags.includes("high_registration_velocity") ? 1 : 0,
    flags.includes("duplicate_fingerprint") ? 1 : 0,
    riskScore >= RISK_THRESHOLD_REQUIRE_PAYMENT ? 1 : 0,
    blocked ? 1 : 0,
    blockedReason,
    now,
    now
  );
}

// =============================================
// Trial Eligibility Check
// =============================================

/**
 * Check if user is eligible for trial
 * Returns: { eligible, reason, requiresPaymentMethod }
 */
export function checkTrialEligibility({
  userId,
  email,
  ipAddress,
  fingerprint,
}) {
  // Check if email is verified (if required)
  if (!isEmailVerified(userId)) {
    return {
      eligible: false,
      reason: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email to start a trial",
    };
  }
  
  // Check if user already used trial
  const user = db.prepare(`
    SELECT trial_used FROM users WHERE id = ?
  `).get(userId);
  
  if (user?.trial_used) {
    return {
      eligible: false,
      reason: "TRIAL_ALREADY_USED",
      message: "You have already used your free trial. Please subscribe to continue.",
    };
  }
  
  // Calculate risk score
  const risk = calculateRiskScore({
    email,
    ipAddress,
    fingerprint,
    userId,
  });
  
  // Record assessment
  recordRiskAssessment({
    userId,
    email,
    ipAddress,
    fingerprint,
    riskScore: risk.score,
    flags: risk.flags,
    blocked: false,
    blockedReason: null,
  });
  
  // If high risk, require payment method
  if (risk.requiresPaymentMethod) {
    return {
      eligible: true,
      requiresPaymentMethod: true,
      reason: "HIGH_RISK",
      message: "Please add a payment method to start your trial (you won't be charged until the trial ends)",
      riskScore: risk.score,
      flags: risk.flags,
    };
  }
  
  // Low risk - eligible for trial
  return {
    eligible: true,
    requiresPaymentMethod: false,
    reason: "ELIGIBLE",
    message: "You are eligible for a free trial",
    riskScore: risk.score,
    flags: risk.flags,
  };
}

/**
 * Block trial and record reason
 */
export function blockTrial(userId, reason) {
  const now = new Date().toISOString();
  
  db.prepare(`
    UPDATE trial_abuse_checks 
    SET trial_blocked = 1, blocked_reason = ?, updated_at = ?
    WHERE user_id = ?
  `).run(reason, now, userId);
  
  console.log(`[antiAbuse] Trial blocked for user ${userId}: ${reason}`);
}

// =============================================
// Exports
// =============================================

export const trialAntiAbuse = {
  isDisposableEmail,
  isEmailVerified,
  markEmailVerified,
  getIpRateLimit,
  incrementRegistrationCount,
  incrementTrialCount,
  isRegistrationRateLimited,
  isTrialRateLimited,
  isFingerprintUsed,
  recordFingerprint,
  calculateRiskScore,
  recordRiskAssessment,
  checkTrialEligibility,
  blockTrial,
};

export default trialAntiAbuse;
