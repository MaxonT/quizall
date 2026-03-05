/**
 * Analytics Routes
 * 
 * Tracks user events and subscription funnel metrics
 */

import { Router } from "express";
import { db } from "../lib/db.js";

export const analyticsRouter = Router();

/**
 * POST /api/analytics/track
 * Receives frontend analytics events (non-blocking)
 */
analyticsRouter.post("/track", (req, res) => {
  try {
    const events = Array.isArray(req.body) ? req.body : [req.body];
    
    if (events.length === 0) {
      return res.status(204).end();
    }
    
    const stmt = db.prepare(`
      INSERT INTO analytics_events (event, user_id, session_id, properties, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    for (const event of events) {
      if (!event.event) continue;
      
      stmt.run(
        event.event,
        event.userId || null,
        event.sessionId || null,
        JSON.stringify(event.properties || {}),
        event.timestamp || new Date().toISOString()
      );
    }
    
    res.status(204).end();
  } catch (err) {
    console.error('[analytics] Track error:', err);
    // Always return 204 to avoid blocking frontend
    res.status(204).end();
  }
});

/**
 * GET /api/analytics/funnel
 * Returns subscription funnel metrics (for internal dashboards)
 */
analyticsRouter.get("/funnel", (req, res) => {
  try {
    const timeframe = req.query.timeframe || '24h';
    const hours = timeframe === '7d' ? 168 : timeframe === '30d' ? 720 : 24;
    
    const stats = db.prepare(`
      SELECT 
        SUM(CASE WHEN event = 'subscription_page_view' THEN 1 ELSE 0 END) as page_views,
        SUM(CASE WHEN event = 'click_subscribe' THEN 1 ELSE 0 END) as subscribe_clicks,
        SUM(CASE WHEN event = 'checkout_session_created' THEN 1 ELSE 0 END) as checkouts_created,
        SUM(CASE WHEN event = 'checkout_redirect_start' THEN 1 ELSE 0 END) as stripe_redirects,
        SUM(CASE WHEN event = 'payment_success' THEN 1 ELSE 0 END) as payments_success,
        SUM(CASE WHEN event = 'subscription_activated' THEN 1 ELSE 0 END) as subscriptions_activated,
        SUM(CASE WHEN event = 'payment_failed' THEN 1 ELSE 0 END) as payments_failed,
        SUM(CASE WHEN event = 'payment_canceled' THEN 1 ELSE 0 END) as payments_canceled
      FROM analytics_events
      WHERE created_at > datetime('now', '-${hours} hours')
    `).get();
    
    // Calculate conversion rates
    const funnel = {
      pageViews: stats.page_views || 0,
      subscribeClicks: stats.subscribe_clicks || 0,
      checkoutsCreated: stats.checkouts_created || 0,
      stripeRedirects: stats.stripe_redirects || 0,
      paymentsSuccess: stats.payments_success || 0,
      subscriptionsActivated: stats.subscriptions_activated || 0,
      paymentsFailed: stats.payments_failed || 0,
      paymentsCanceled: stats.payments_canceled || 0,
      conversionRates: {
        clickToCheckout: stats.subscribe_clicks > 0 
          ? (stats.checkouts_created / stats.subscribe_clicks * 100).toFixed(2) 
          : 0,
        checkoutToPayment: stats.stripe_redirects > 0 
          ? (stats.payments_success / stats.stripe_redirects * 100).toFixed(2) 
          : 0,
        paymentToActivation: stats.payments_success > 0 
          ? (stats.subscriptions_activated / stats.payments_success * 100).toFixed(2) 
          : 0,
      },
    };
    
    res.json({ ok: true, timeframe, funnel });
  } catch (err) {
    console.error('[analytics] Funnel error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get funnel metrics' });
  }
});

/**
 * Helper: Track webhook events
 */
export function trackWebhookEvent(event, result) {
  try {
    db.prepare(`
      INSERT INTO analytics_events (event, properties, created_at)
      VALUES (?, ?, datetime('now'))
    `).run(
      `webhook_${event.type}`,
      JSON.stringify({ 
        eventId: event.id, 
        result,
        customerId: event.data?.object?.customer,
      })
    );
  } catch (err) {
    console.error('[analytics] Webhook track error:', err);
  }
}
