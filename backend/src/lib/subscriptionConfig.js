/**
 * Subscription Configuration
 * 
 * All configurable parameters for the subscription system.
 * These can be overridden via environment variables.
 * 
 * Reference: PRD Section 10 - Config Table
 */

// =============================================
// Pricing Configuration
// =============================================

export const MONTHLY_PRICE_USD = Number(process.env.MONTHLY_PRICE_USD || 9);
export const YEARLY_PRICE_USD = Number(process.env.YEARLY_PRICE_USD || 84);

// Stripe Price IDs (must be set in production)
export const STRIPE_PRICE_MONTHLY = process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_9usd';
export const STRIPE_PRICE_YEARLY = process.env.STRIPE_PRICE_YEARLY || 'price_yearly_84usd';

// =============================================
// Trial Configuration
// =============================================

export const TRIAL_DAYS = Number(process.env.TRIAL_DAYS || 14);

// One-time trial base tokens (granted at trial start)
export const TRIAL_BASE_TOKENS = Number(process.env.TRIAL_BASE_TOKENS || 200000);

// Daily free tokens for trial users
export const TRIAL_DAILY_TOKENS = Number(process.env.TRIAL_DAILY_TOKENS || 20000);

// Maximum daily tokens that can accumulate (carry cap)
export const DAILY_CARRY_CAP_TOKENS = Number(process.env.DAILY_CARRY_CAP_TOKENS || 40000);

// =============================================
// Plan Token Allocations
// =============================================

// Monthly plan token allocation
export const MONTHLY_PLAN_TOKENS = Number(process.env.MONTHLY_PLAN_TOKENS || 1000000);

// Yearly plan token allocation (can be same as monthly*12 or bonus)
export const YEARLY_PLAN_TOKENS = Number(process.env.YEARLY_PLAN_TOKENS || 12000000);

// Daily free tokens for paid users
export const PAID_DAILY_TOKENS = Number(process.env.PAID_DAILY_TOKENS || 50000);

// Daily free tokens for free users (no subscription) — 80 credits @ ratio 1000
export const FREE_USER_DAILY_TOKENS = Number(process.env.FREE_USER_DAILY_TOKENS || 80000);

// =============================================
// Credits (user-facing billing unit)
// =============================================

export const CREDIT_RATIO = Number(process.env.CREDIT_RATIO || 1000);

export const CREDIT_ALLOWANCE = {
  free: Number(process.env.CREDIT_ALLOWANCE_FREE || 80),
  trial: Number(process.env.CREDIT_ALLOWANCE_TRIAL || 120),
  paid: Number(process.env.CREDIT_ALLOWANCE_PAID || 150),
  teacher: Number(process.env.CREDIT_ALLOWANCE_TEACHER || 400),
};

// =============================================
// Teacher / Classroom (B2B) tier
// =============================================

export const TEACHER_PRICE_USD = Number(process.env.TEACHER_PRICE_USD || 29);
export const STRIPE_PRICE_TEACHER = process.env.STRIPE_PRICE_TEACHER || "price_teacher_29usd";
// Daily free tokens for teacher-tier accounts
export const TEACHER_DAILY_TOKENS = Number(process.env.TEACHER_DAILY_TOKENS || 120000);

export const CREDIT_COSTS = {
  fileUpload: Number(process.env.CREDIT_COST_FILE_UPLOAD || 3),
  studyPlan: Number(process.env.CREDIT_COST_STUDY_PLAN || 12),
  examMap: Number(process.env.CREDIT_COST_EXAM_MAP || 15),
  quizTesting: Number(process.env.CREDIT_COST_QUIZ_TESTING || 20),
  trainingBatch: Number(process.env.CREDIT_COST_TRAINING_BATCH || 10),
  trainingRefill: Number(process.env.CREDIT_COST_TRAINING_REFILL || 8),
  studyNote: Number(process.env.CREDIT_COST_STUDY_NOTE || 10),
};

export const CREDIT_ACTION_LABELS = {
  fileUpload: "File upload",
  studyPlan: "Study plan",
  examMap: "Exam map",
  quizTesting: "Quiz round",
  trainingBatch: "Training pack",
  trainingRefill: "Training refill",
  studyNote: "Study note",
};

export function tokensToCredits(tokens) {
  return Math.floor(Math.max(0, Number(tokens) || 0) / CREDIT_RATIO);
}

export function creditsToTokens(credits) {
  return Math.ceil(Math.max(0, Number(credits) || 0) * CREDIT_RATIO);
}

// =============================================
// Daily Usage Limits (UI + enforcement)
// =============================================

export const DAILY_PROMPT_OPTIMIZATIONS_PER_DAY = Number(
  process.env.DAILY_PROMPT_OPTIMIZATIONS_PER_DAY || 50
);

export const DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY = Number(
  process.env.DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY || 30
);

// =============================================
// Multiplier Configuration
// =============================================

// Default multiplier for token costs
export const PLAN_MULTIPLIER = Number(process.env.PLAN_MULTIPLIER || 1.0);

// Feature-specific multipliers
export const MULTIPLIERS = {
  default: 1.0,
  bestOfN: 1.3,          // Best-of-N candidate generation
  rerank: 1.2,           // Reranking enabled
  longContext: 1.5,      // Long context (>32k tokens)
  multiAgent: 1.4,       // Multi-agent pipeline
};

// =============================================
// Daily Refresh Configuration
// =============================================

// UTC hour for daily token refresh (0-23)
export const DAILY_REFRESH_HOUR_UTC = Number(process.env.DAILY_REFRESH_HOUR_UTC || 0);

// Whether rollover is enabled (MVP: false)
export const ENABLE_ROLLOVER = process.env.ENABLE_ROLLOVER === 'true';

// =============================================
// Anti-Abuse Configuration
// =============================================

// Maximum registrations per IP per day
export const MAX_REGISTRATIONS_PER_IP_DAY = Number(process.env.MAX_REGISTRATIONS_PER_IP_DAY || 3);

// Maximum trials per IP per month
export const MAX_TRIALS_PER_IP_MONTH = Number(process.env.MAX_TRIALS_PER_IP_MONTH || 2);

// Risk score threshold to require payment method for trial
export const RISK_THRESHOLD_REQUIRE_PAYMENT = Number(process.env.RISK_THRESHOLD_REQUIRE_PAYMENT || 70);

// Disposable email domains (common ones, extend as needed)
export const DISPOSABLE_EMAIL_DOMAINS = [
  'tempmail.com', 'throwaway.com', 'guerrillamail.com', 'mailinator.com',
  '10minutemail.com', 'yopmail.com', 'fakeinbox.com', 'trashmail.com',
  'temp-mail.org', 'sharklasers.com', 'maildrop.cc', 'getairmail.com',
  'dispostable.com', 'mailnesia.com', 'tempail.com'
];

// =============================================
// Stripe Configuration
// =============================================

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
export const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY || '';

// Stripe mode (test/live)
export const STRIPE_MODE = process.env.STRIPE_MODE || 'test';

// =============================================
// URLs Configuration
// =============================================

export const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
export const SUCCESS_URL = process.env.SUCCESS_URL || `${FRONTEND_URL}/checkout-success.html`;
export const CANCEL_URL = process.env.CANCEL_URL || `${FRONTEND_URL}/checkout-cancel.html`;
export const ACCOUNT_URL = process.env.ACCOUNT_URL || `${FRONTEND_URL}/settings.html#accountPanel`;

// =============================================
// Feature Flags
// =============================================

export const FEATURES = {
  // Whether subscriptions are enabled at all
  subscriptionsEnabled: process.env.SUBSCRIPTIONS_ENABLED !== 'false',
  
  // Whether trials are enabled
  trialsEnabled: process.env.TRIALS_ENABLED !== 'false',
  
  // Whether to require email verification for trial
  requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
  
  // Whether to show token breakdown in UI
  showTokenBreakdown: process.env.SHOW_TOKEN_BREAKDOWN !== 'false',
  
  // Whether to enforce token limits (can disable for testing)
  enforceTokenLimits: process.env.ENFORCE_TOKEN_LIMITS !== 'false',
};

// =============================================
// Subscription Status Constants
// =============================================

export const SUBSCRIPTION_STATUS = {
  NONE: 'none',
  TRIALING: 'trialing',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELED: 'canceled',
  UNPAID: 'unpaid',
};

export const BUCKET_TYPES = {
  DAILY_FREE: 'daily_free',
  MONTHLY: 'monthly',
  TRIAL_BASE: 'trial_base',
  ADJUSTMENT: 'adjustment',
};

export const TOKEN_SOURCES = {
  WEBHOOK: 'webhook',
  CRON: 'cron',
  ADMIN: 'admin',
  API_USAGE: 'api_usage',
  TRIAL_START: 'trial_start',
  SYSTEM: 'system',  // Auto-granted by system (e.g., free user daily tokens)
};

// =============================================
// Plan Definitions (for UI display)
// =============================================

export const PLANS = {
  monthly: {
    id: 'monthly',
    name: 'Monthly',
    priceId: STRIPE_PRICE_MONTHLY,
    price: MONTHLY_PRICE_USD,
    currency: 'USD',
    interval: 'month',
    tokens: MONTHLY_PLAN_TOKENS,
    dailyTokens: PAID_DAILY_TOKENS,
    dailyLimits: {
      promptOptimizationsPerDay: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
      questionWizardSessionsPerDay: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
    features: [
      'Full access to all features',
      `${CREDIT_ALLOWANCE.paid} credits per day`,
      '3000 credit monthly pool',
      'Priority support',
      'Cancel anytime',
    ],
  },
  yearly: {
    id: 'yearly',
    name: 'Annual',
    priceId: STRIPE_PRICE_YEARLY,
    price: YEARLY_PRICE_USD,
    currency: 'USD',
    interval: 'year',
    tokens: YEARLY_PLAN_TOKENS,
    dailyTokens: PAID_DAILY_TOKENS,
    dailyLimits: {
      promptOptimizationsPerDay: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
      questionWizardSessionsPerDay: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
    monthlyEquivalent: Math.round(YEARLY_PRICE_USD / 12),
    savings: (MONTHLY_PRICE_USD * 12) - YEARLY_PRICE_USD,
    features: [
      'Full access to all features',
      `${CREDIT_ALLOWANCE.paid} credits per day`,
      '3000 credit monthly pool',
      'Priority support',
      `Save $${(MONTHLY_PRICE_USD * 12) - YEARLY_PRICE_USD}/year`,
    ],
  },
  trial: {
    id: 'trial',
    name: 'Free Trial',
    price: 0,
    currency: 'USD',
    interval: 'once',
    days: TRIAL_DAYS,
    tokens: TRIAL_BASE_TOKENS,
    dailyTokens: TRIAL_DAILY_TOKENS,
    dailyLimits: {
      promptOptimizationsPerDay: DAILY_PROMPT_OPTIMIZATIONS_PER_DAY,
      questionWizardSessionsPerDay: DAILY_QUESTION_WIZARD_SESSIONS_PER_DAY,
    },
    features: [
      `${TRIAL_DAYS} days free`,
      `${CREDIT_ALLOWANCE.trial} credits per day`,
      '500 credit starter pool',
      'No credit card required',
      'Cancel anytime',
    ],
  },
};

// =============================================
// Helper Functions
// =============================================

/**
 * Check if Stripe is properly configured
 */
export function isStripeConfigured() {
  return !!(STRIPE_SECRET_KEY && STRIPE_PUBLISHABLE_KEY);
}

/**
 * Get plan by price ID
 */
export function getPlanByPriceId(priceId) {
  if (priceId === STRIPE_PRICE_MONTHLY) return PLANS.monthly;
  if (priceId === STRIPE_PRICE_YEARLY) return PLANS.yearly;
  return null;
}

/**
 * Calculate credits spent for a given token usage
 */
export function calculateCreditsSpent(inputTokens, outputTokens, options = {}) {
  const totalTokens = inputTokens + outputTokens;
  let multiplier = PLAN_MULTIPLIER;
  let reasons = [];
  
  if (options.bestOfN && options.candidateCount > 1) {
    multiplier *= MULTIPLIERS.bestOfN;
    reasons.push(`Best-of-${options.candidateCount} enabled`);
  }
  
  if (options.rerank) {
    multiplier *= MULTIPLIERS.rerank;
    reasons.push('Reranking enabled');
  }
  
  if (totalTokens > 32000) {
    multiplier *= MULTIPLIERS.longContext;
    reasons.push('Long context mode');
  }
  
  if (options.multiAgent) {
    multiplier *= MULTIPLIERS.multiAgent;
    reasons.push('Multi-agent pipeline');
  }
  
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    multiplier: Math.round(multiplier * 100) / 100,
    multiplierReason: reasons.length > 0 ? reasons.join(', ') : null,
    creditsSpent: Math.ceil(totalTokens * multiplier),
  };
}

/**
 * Format token count for display
 */
export function formatTokens(tokens) {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K`;
  }
  return tokens.toString();
}

console.log("[quizall] Subscription config loaded");
console.log(`[quizall]   Monthly: $${MONTHLY_PRICE_USD}/mo (${formatTokens(MONTHLY_PLAN_TOKENS)} tokens)`);
console.log(`[quizall]   Yearly: $${YEARLY_PRICE_USD}/yr (${formatTokens(YEARLY_PLAN_TOKENS)} tokens)`);
console.log(`[quizall]   Trial: ${TRIAL_DAYS} days (${formatTokens(TRIAL_BASE_TOKENS)} base + ${formatTokens(TRIAL_DAILY_TOKENS)}/day)`);
