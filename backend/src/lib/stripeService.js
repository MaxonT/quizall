/**
 * Stripe Service
 * 
 * Handles all Stripe interactions:
 * - Checkout Session creation
 * - Billing Portal session creation
 * - Webhook processing with signature verification
 * - Customer management
 * 
 * Reference: PRD Section 6 - Stripe Integration Requirements
 */

import Stripe from "stripe";
import { dbGet, dbRun, dbAll } from "./dbHelpers.js";
import { tokenLedger } from "./tokenLedger.js";
import {
  STRIPE_SECRET_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY,
  STRIPE_PRICE_YEARLY,
  SUCCESS_URL,
  CANCEL_URL,
  ACCOUNT_URL,
  SUBSCRIPTION_STATUS,
  TRIAL_DAYS,
  getPlanByPriceId,
} from "./subscriptionConfig.js";

// Initialize Stripe client
let stripe = null;

if (STRIPE_SECRET_KEY) {
  stripe = new Stripe(STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16",
  });
  console.log("[quizall] ✅ Stripe client initialized");
} else {
  console.warn("[quizall] ⚠️ STRIPE_SECRET_KEY not set - billing features disabled");
}

/**
 * Check if Stripe is enabled
 */
export function isStripeEnabled() {
  return !!stripe;
}

// =============================================
// Customer Management
// =============================================

/**
 * Get or create Stripe customer for a user
 */
export async function getOrCreateCustomer(userId, email) {
  if (!stripe) throw new Error("Stripe not configured");

  const existing = await dbGet(
    `SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ?`,
    [userId]
  );

  if (existing) {
    return existing.stripe_customer_id;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId, source: "quizall" },
  });

  const now = new Date().toISOString();
  await dbRun(
    `INSERT INTO stripe_customers (user_id, stripe_customer_id, email, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
    [userId, customer.id, email, now, now]
  );

  console.log(`[stripe] Created customer ${customer.id} for user ${userId}`);
  return customer.id;
}

export async function getUserIdFromCustomer(stripeCustomerId) {
  const row = await dbGet(
    `SELECT user_id FROM stripe_customers WHERE stripe_customer_id = ?`,
    [stripeCustomerId]
  );
  return row?.user_id || null;
}

// =============================================
// Checkout Session
// =============================================

/**
 * Create a Stripe Checkout session for subscription
 */
export async function createCheckoutSession({
  userId,
  email,
  plan,
  successUrl = SUCCESS_URL,
  cancelUrl = CANCEL_URL,
}) {
  if (!stripe) throw new Error("Stripe not configured");
  
  const customerId = await getOrCreateCustomer(userId, email);
  
  const priceId = plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: TRIAL_DAYS,
      metadata: {
        userId,
        plan,
      },
    },
    metadata: {
      userId,
      plan,
    },
  });
  
  console.log(`[stripe] Created checkout session ${session.id} for user ${userId}`);
  
  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Create checkout session without trial (for users who used trial)
 */
export async function createCheckoutSessionNoTrial({
  userId,
  email,
  plan,
  successUrl = SUCCESS_URL,
  cancelUrl = CANCEL_URL,
}) {
  if (!stripe) throw new Error("Stripe not configured");
  
  const customerId = await getOrCreateCustomer(userId, email);
  const priceId = plan === "yearly" ? STRIPE_PRICE_YEARLY : STRIPE_PRICE_MONTHLY;
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ["card"],
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    mode: "subscription",
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    metadata: {
      userId,
      plan,
    },
  });
  
  console.log(`[stripe] Created checkout session (no trial) ${session.id} for user ${userId}`);
  
  return {
    sessionId: session.id,
    url: session.url,
  };
}

/**
 * Retrieve a Stripe Checkout Session by ID
 */
export async function getCheckoutSession(sessionId) {
  if (!stripe) throw new Error("Stripe not configured");
  
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  return session;
}

// =============================================
// Billing Portal
// =============================================

/**
 * Create a Stripe Billing Portal session
 */
export async function createPortalSession(userId, returnUrl = ACCOUNT_URL) {
  if (!stripe) throw new Error("Stripe not configured");

  const customer = await dbGet(
    `SELECT stripe_customer_id FROM stripe_customers WHERE user_id = ?`,
    [userId]
  );

  if (!customer) {
    throw new Error("No Stripe customer found for user");
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: customer.stripe_customer_id,
    return_url: returnUrl,
  });
  
  console.log(`[stripe] Created portal session for user ${userId}`);
  
  return {
    url: session.url,
  };
}

// =============================================
// Subscription Management
// =============================================

/**
 * Get subscription status for a user
 */
export async function getSubscriptionStatus(userId) {
  const sub = await dbGet(
    `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (!sub) {
    return {
      status: SUBSCRIPTION_STATUS.NONE,
      plan: null,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  return {
    status: sub.status,
    plan: sub.plan,
    priceId: sub.price_id,
    periodStart: sub.period_start,
    periodEnd: sub.period_end,
    trialStart: sub.trial_start,
    trialEnd: sub.trial_end,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    canceledAt: sub.canceled_at,
    stripeSubscriptionId: sub.stripe_subscription_id,
  };
}

export async function updateSubscription({
  userId,
  stripeSubscriptionId,
  stripeCustomerId,
  status,
  plan,
  priceId,
  periodStart,
  periodEnd,
  trialStart,
  trialEnd,
  cancelAtPeriodEnd,
  canceledAt,
}) {
  const now = new Date().toISOString();

  const existing = await dbGet(
    `SELECT id FROM subscriptions WHERE stripe_subscription_id = ?`,
    [stripeSubscriptionId]
  );

  if (existing) {
    await dbRun(
      `UPDATE subscriptions SET
        status = ?, plan = ?, price_id = ?,
        period_start = ?, period_end = ?, trial_start = ?, trial_end = ?,
        cancel_at_period_end = ?, canceled_at = ?, updated_at = ?
       WHERE stripe_subscription_id = ?`,
      [
        status,
        plan,
        priceId,
        periodStart,
        periodEnd,
        trialStart,
        trialEnd,
        !!cancelAtPeriodEnd,
        canceledAt,
        now,
        stripeSubscriptionId,
      ]
    );
  } else {
    await dbRun(
      `INSERT INTO subscriptions (
        user_id, stripe_subscription_id, stripe_customer_id,
        status, plan, price_id,
        period_start, period_end, trial_start, trial_end,
        cancel_at_period_end, canceled_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        stripeSubscriptionId,
        stripeCustomerId,
        status,
        plan,
        priceId,
        periodStart,
        periodEnd,
        trialStart,
        trialEnd,
        !!cancelAtPeriodEnd,
        canceledAt,
        now,
        now,
      ]
    );
  }

  console.log(`[stripe] Updated subscription ${stripeSubscriptionId} for user ${userId} (status: ${status})`);
}

// =============================================
// Webhook Processing
// =============================================

/**
 * Verify webhook signature
 */
export function verifyWebhookSignature(payload, signature) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    throw new Error("Stripe webhook not configured");
  }
  
  return stripe.webhooks.constructEvent(payload, signature, STRIPE_WEBHOOK_SECRET);
}

/**
 * Check if event has already been processed (idempotency)
 */
export async function isEventProcessed(eventId) {
  const existing = await dbGet(`SELECT status FROM stripe_events WHERE event_id = ?`, [eventId]);
  return existing?.status === "processed";
}

export async function recordEvent(eventId, eventType, status = "processed", error = null, payload = null) {
  const now = new Date().toISOString();

  const existing = await dbGet(`SELECT retry_count FROM stripe_events WHERE event_id = ?`, [eventId]);

  if (existing) {
    await dbRun(
      `UPDATE stripe_events SET status = ?, error = ?, processed_at = ?, retry_count = COALESCE(retry_count, 0) + 1
       WHERE event_id = ?`,
      [status, error, status === "processed" ? now : null, eventId]
    );
  } else {
    await dbRun(
      `INSERT INTO stripe_events (event_id, event_type, status, error, payload, created_at, processed_at, retry_count)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        eventId,
        eventType,
        status,
        error,
        payload ? JSON.stringify(payload) : null,
        now,
        status === "processed" ? now : null,
      ]
    );
  }
}

/**
 * Handle checkout.session.completed event
 */
async function handleCheckoutCompleted(event) {
  const session = event.data.object;
  const userId = session.metadata?.userId;
  const customerId = session.customer;
  const sessionId = session.id;
  
  if (!userId) {
    console.error("[stripe] No userId in checkout session metadata");
    throw new Error("Missing userId in checkout session metadata");
  }
  
  // Ensure customer mapping exists
  const existingCustomer = await dbGet(
    `SELECT id FROM stripe_customers WHERE stripe_customer_id = ?`,
    [customerId]
  );

  if (!existingCustomer) {
    const now = new Date().toISOString();
    await dbRun(
      `INSERT INTO stripe_customers (user_id, stripe_customer_id, email, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, customerId, session.customer_email, now, now]
    );
  }

  const now = new Date().toISOString();
  await dbRun(
    `UPDATE checkout_sessions SET status = 'completed', completed_at = ? WHERE stripe_session_id = ? AND user_id = ?`,
    [now, sessionId, userId]
  );
  
  console.log(`[stripe] Checkout completed for user ${userId}`);
}

/**
 * Handle customer.subscription.created/updated event
 */
async function handleSubscriptionChange(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  
  // Get user ID from customer
  const userId = await getUserIdFromCustomer(customerId);
  if (!userId) {
    console.error(`[stripe] No user found for customer ${customerId}`);
    return;
  }
  
  // Determine plan from price ID
  const priceId = subscription.items.data[0]?.price?.id;
  const plan = getPlanByPriceId(priceId);
  const planName = plan?.id || "unknown";
  
  // Map Stripe status to our status
  let status = subscription.status;
  if (status === "active" && subscription.trial_end && new Date(subscription.trial_end * 1000) > new Date()) {
    status = SUBSCRIPTION_STATUS.TRIALING;
  }
  
  // Update subscription
  await updateSubscription({
    userId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status,
    plan: planName,
    priceId,
    periodStart: subscription.current_period_start 
      ? new Date(subscription.current_period_start * 1000).toISOString() 
      : null,
    periodEnd: subscription.current_period_end 
      ? new Date(subscription.current_period_end * 1000).toISOString() 
      : null,
    trialStart: subscription.trial_start 
      ? new Date(subscription.trial_start * 1000).toISOString() 
      : null,
    trialEnd: subscription.trial_end 
      ? new Date(subscription.trial_end * 1000).toISOString() 
      : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    canceledAt: subscription.canceled_at 
      ? new Date(subscription.canceled_at * 1000).toISOString() 
      : null,
  });
  
  // If this is a new trial, grant trial tokens
  if (status === SUBSCRIPTION_STATUS.TRIALING && event.type === "customer.subscription.created") {
    await tokenLedger.grantTrialTokens(userId, event.id);

    await dbRun(`UPDATE users SET trial_used = true, trial_started_at = ? WHERE id = ?`, [
      new Date().toISOString(),
      userId,
    ]);
  }
  
  console.log(`[stripe] Subscription ${event.type.split('.')[2]} for user ${userId} (status: ${status})`);
}

/**
 * Handle customer.subscription.deleted event
 */
async function handleSubscriptionDeleted(event) {
  const subscription = event.data.object;
  const customerId = subscription.customer;
  
  const userId = await getUserIdFromCustomer(customerId);
  if (!userId) {
    console.error(`[stripe] No user found for customer ${customerId}`);
    return;
  }
  
  // Update subscription status to canceled
  await updateSubscription({
    userId,
    stripeSubscriptionId: subscription.id,
    stripeCustomerId: customerId,
    status: SUBSCRIPTION_STATUS.CANCELED,
    plan: null,
    priceId: null,
    periodStart: null,
    periodEnd: null,
    trialStart: null,
    trialEnd: null,
    cancelAtPeriodEnd: false,
    canceledAt: new Date().toISOString(),
  });
  
  // Clear any remaining tokens (optional - could let them expire naturally)
  await tokenLedger.clearMonthlyTokens(userId, "Subscription canceled");
  
  console.log(`[stripe] Subscription deleted for user ${userId}`);
}

/**
 * Handle invoice.payment_succeeded event
 */
async function handlePaymentSucceeded(event) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;
  
  const userId = await getUserIdFromCustomer(customerId);
  if (!userId) {
    console.error(`[stripe] No user found for customer ${customerId}`);
    return;
  }
  
  // Only grant tokens for subscription invoices (not one-time)
  if (!subscriptionId) {
    console.log(`[stripe] Invoice ${invoice.id} is not a subscription invoice`);
    return;
  }
  
  // Skip if this is the first invoice (trial period - tokens already granted)
  if (invoice.billing_reason === "subscription_create") {
    console.log(`[stripe] Skipping initial invoice for subscription ${subscriptionId}`);
    return;
  }
  
  // Get subscription to determine plan
  const sub = await getSubscriptionStatus(userId);
  if (!sub.plan) {
    console.error(`[stripe] No plan found for user ${userId}`);
    return;
  }
  
  // Clear old tokens and grant new ones for the new period
  await tokenLedger.clearMonthlyTokens(userId, "New billing period");
  await tokenLedger.grantSubscriptionTokens(userId, sub.plan, event.id, subscriptionId);
  
  console.log(`[stripe] Payment succeeded for user ${userId}, tokens granted for ${sub.plan}`);
}

/**
 * Handle invoice.payment_failed event
 */
async function handlePaymentFailed(event) {
  const invoice = event.data.object;
  const customerId = invoice.customer;
  
  const userId = await getUserIdFromCustomer(customerId);
  if (!userId) {
    console.error(`[stripe] No user found for customer ${customerId}`);
    return;
  }
  
  // Update subscription status to past_due
  const sub = await dbGet(
    `SELECT * FROM subscriptions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );

  if (sub) {
    await dbRun(`UPDATE subscriptions SET status = ?, updated_at = ? WHERE stripe_subscription_id = ?`, [
      SUBSCRIPTION_STATUS.PAST_DUE,
      new Date().toISOString(),
      sub.stripe_subscription_id,
    ]);
  }
  
  console.log(`[stripe] Payment failed for user ${userId}`);
}

/**
 * Process webhook event
 */
export async function processWebhookEvent(event) {
  const eventId = event.id;
  const eventType = event.type;
  
  // Idempotency check
  if (await isEventProcessed(eventId)) {
    console.log(`[stripe] Event ${eventId} already processed, skipping`);
    return { skipped: true };
  }

  await recordEvent(eventId, eventType, "pending", null, event.data.object);
  
  try {
    switch (eventType) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event);
        break;
      
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await handleSubscriptionChange(event);
        break;
      
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event);
        break;
      
      case "invoice.payment_succeeded":
        await handlePaymentSucceeded(event);
        break;
      
      case "invoice.payment_failed":
        await handlePaymentFailed(event);
        break;
      
      default:
        console.log(`[stripe] Unhandled event type: ${eventType}`);
    }
    
    // Mark as processed
    await recordEvent(eventId, eventType, "processed", null, event.data.object);
    return { processed: true };
  } catch (err) {
    console.error(`[stripe] Error processing event ${eventId}:`, err);
    await recordEvent(eventId, eventType, "failed", err.message, event.data.object);
    throw err;
  }
}

// =============================================
// Exports
// =============================================

export const stripeService = {
  isStripeEnabled,
  getOrCreateCustomer,
  getUserIdFromCustomer,
  createCheckoutSession,
  createCheckoutSessionNoTrial,
  getCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  updateSubscription,
  verifyWebhookSignature,
  isEventProcessed,
  recordEvent,
  processWebhookEvent,
};

export default stripeService;
