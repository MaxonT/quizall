/**
 * Trial Anti-Abuse Service
 *
 * Implements safety controls to prevent trial farming.
 */

import { dbGet, dbRun, DB_TRUE } from "./dbHelpers.js";
import {
  DISPOSABLE_EMAIL_DOMAINS,
  MAX_REGISTRATIONS_PER_IP_DAY,
  MAX_TRIALS_PER_IP_MONTH,
  RISK_THRESHOLD_REQUIRE_PAYMENT,
} from "./subscriptionConfig.js";

export function isDisposableEmail(email) {
  if (!email) return false;
  const domain = email.toLowerCase().split("@")[1];
  return DISPOSABLE_EMAIL_DOMAINS.includes(domain);
}

export async function isEmailVerified(userId) {
  const user = await dbGet(`SELECT email_verified FROM users WHERE id = ?`, [userId]);
  return user?.email_verified === 1 || user?.email_verified === true;
}

export async function markEmailVerified(userId) {
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE users SET email_verified = ?, email_verified_at = ?, updated_at = ? WHERE id = ?`,
    [DB_TRUE, now, now, userId]
  );
  console.log(`[antiAbuse] Email verified for user ${userId}`);
}

export async function getIpRateLimit(ipAddress) {
  return await dbGet(`SELECT * FROM ip_rate_limits WHERE ip_address = ?`, [ipAddress]);
}

export async function incrementRegistrationCount(ipAddress) {
  const now = new Date().toISOString();
  const today = now.split("T")[0];
  const existing = await getIpRateLimit(ipAddress);

  if (existing) {
    const lastDate = existing.last_registration?.split("T")[0];
    if (lastDate === today) {
      await dbRun(
        `UPDATE ip_rate_limits SET registration_count = registration_count + 1, last_registration = ?, updated_at = ? WHERE ip_address = ?`,
        [now, now, ipAddress]
      );
    } else {
      await dbRun(
        `UPDATE ip_rate_limits SET registration_count = 1, last_registration = ?, updated_at = ? WHERE ip_address = ?`,
        [now, now, ipAddress]
      );
    }
  } else {
    await dbRun(
      `INSERT INTO ip_rate_limits (ip_address, registration_count, last_registration, created_at, updated_at) VALUES (?, 1, ?, ?, ?)`,
      [ipAddress, now, now, now]
    );
  }
}

export async function incrementTrialCount(ipAddress) {
  const now = new Date().toISOString();
  const existing = await getIpRateLimit(ipAddress);

  if (existing) {
    const lastMonth = existing.last_trial?.substring(0, 7);
    const currentMonth = now.substring(0, 7);
    if (lastMonth === currentMonth) {
      await dbRun(
        `UPDATE ip_rate_limits SET trial_count = trial_count + 1, last_trial = ?, updated_at = ? WHERE ip_address = ?`,
        [now, now, ipAddress]
      );
    } else {
      await dbRun(
        `UPDATE ip_rate_limits SET trial_count = 1, last_trial = ?, updated_at = ? WHERE ip_address = ?`,
        [now, now, ipAddress]
      );
    }
  } else {
    await dbRun(
      `INSERT INTO ip_rate_limits (ip_address, trial_count, last_trial, created_at, updated_at) VALUES (?, 1, ?, ?, ?)`,
      [ipAddress, now, now, now]
    );
  }
}

export async function isRegistrationRateLimited(ipAddress) {
  const record = await getIpRateLimit(ipAddress);
  if (!record) return false;
  const today = new Date().toISOString().split("T")[0];
  const lastDate = record.last_registration?.split("T")[0];
  if (lastDate !== today) return false;
  return record.registration_count >= MAX_REGISTRATIONS_PER_IP_DAY;
}

export async function isTrialRateLimited(ipAddress) {
  const record = await getIpRateLimit(ipAddress);
  if (!record) return false;
  const currentMonth = new Date().toISOString().substring(0, 7);
  const lastMonth = record.last_trial?.substring(0, 7);
  if (lastMonth !== currentMonth) return false;
  return record.trial_count >= MAX_TRIALS_PER_IP_MONTH;
}

export async function isFingerprintUsed(fingerprint) {
  if (!fingerprint) return false;
  const existing = await dbGet(
    `SELECT COUNT(*) as count FROM trial_abuse_checks WHERE device_fingerprint = ? AND trial_blocked = 0`,
    [fingerprint]
  );
  return Number(existing?.count) > 0;
}

export async function recordFingerprint(userId, fingerprint, ipAddress) {
  const now = new Date().toISOString();
  const existing = await dbGet(`SELECT id FROM trial_abuse_checks WHERE user_id = ?`, [userId]);
  if (existing) {
    await dbRun(
      `UPDATE trial_abuse_checks SET device_fingerprint = ?, ip_address = ?, updated_at = ? WHERE user_id = ?`,
      [fingerprint, ipAddress, now, userId]
    );
    return;
  }
  await dbRun(
    `INSERT INTO trial_abuse_checks (user_id, device_fingerprint, ip_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [userId, fingerprint, ipAddress, now, now]
  );
}

export async function calculateRiskScore({ email, ipAddress, fingerprint, userId }) {
  let score = 0;
  const flags = [];

  if (isDisposableEmail(email)) {
    score += 40;
    flags.push("disposable_email");
  }
  if (await isTrialRateLimited(ipAddress)) {
    score += 30;
    flags.push("ip_rate_limited");
  }
  if (await isRegistrationRateLimited(ipAddress)) {
    score += 20;
    flags.push("high_registration_velocity");
  }
  if (await isFingerprintUsed(fingerprint)) {
    score += 25;
    flags.push("duplicate_fingerprint");
  }

  const user = await dbGet(`SELECT trial_used FROM users WHERE id = ?`, [userId]);
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

export async function recordRiskAssessment({
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

  const existing = await dbGet(`SELECT id FROM trial_abuse_checks WHERE user_id = ?`, [userId]);
  if (existing) {
    await dbRun(
      `UPDATE trial_abuse_checks SET
        ip_address = ?, device_fingerprint = ?, email_domain = ?,
        risk_score = ?, is_disposable_email = ?, is_high_velocity_ip = ?,
        is_duplicate_fingerprint = ?, requires_payment_method = ?,
        trial_blocked = ?, blocked_reason = ?, updated_at = ?
      WHERE user_id = ?`,
      [
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
        userId,
      ]
    );
    return;
  }

  await dbRun(
    `INSERT INTO trial_abuse_checks (
      user_id, ip_address, device_fingerprint, email_domain,
      risk_score, is_disposable_email, is_high_velocity_ip,
      is_duplicate_fingerprint, requires_payment_method,
      trial_blocked, blocked_reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
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
      now,
    ]
  );
}

export async function checkTrialEligibility({ userId, email, ipAddress, fingerprint }) {
  if (!(await isEmailVerified(userId))) {
    return {
      eligible: false,
      reason: "EMAIL_NOT_VERIFIED",
      message: "Please verify your email to start a trial",
    };
  }

  const user = await dbGet(`SELECT trial_used FROM users WHERE id = ?`, [userId]);
  if (user?.trial_used) {
    return {
      eligible: false,
      reason: "TRIAL_ALREADY_USED",
      message: "You have already used your free trial. Please subscribe to continue.",
    };
  }

  const risk = await calculateRiskScore({ email, ipAddress, fingerprint, userId });

  await recordRiskAssessment({
    userId,
    email,
    ipAddress,
    fingerprint,
    riskScore: risk.score,
    flags: risk.flags,
    blocked: false,
    blockedReason: null,
  });

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

  return {
    eligible: true,
    requiresPaymentMethod: false,
    reason: "ELIGIBLE",
    message: "You are eligible for a free trial",
    riskScore: risk.score,
    flags: risk.flags,
  };
}

export async function blockTrial(userId, reason) {
  const now = new Date().toISOString();
  await dbRun(
    `UPDATE trial_abuse_checks SET trial_blocked = ?, blocked_reason = ?, updated_at = ? WHERE user_id = ?`,
    [DB_TRUE, reason, now, userId]
  );
  console.log(`[antiAbuse] Trial blocked for user ${userId}: ${reason}`);
}

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
