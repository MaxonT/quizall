/**
 * Daily State Compensation Job
 * 
 * Purpose: Reconcile checkout sessions that are stuck in "pending" state
 * 
 * This job runs daily to:
 * 1. Find checkout_sessions stuck in "pending" for >24 hours
 * 2. Query Stripe API for actual session status
 * 3. Update local DB to match Stripe's truth
 * 4. Log discrepancies for monitoring
 * 
 * Handles edge cases:
 * - Webhook delivery failures
 * - Network timeouts
 * - Payment abandonment
 * - Race conditions
 */

import { db } from "./db.js";
import stripeService from "./stripeService.js";

/**
 * Run daily compensation for checkout sessions
 */
export async function runDailyCompensation() {
  console.log("[dailyJob] Starting daily state compensation...");
  
  const startTime = Date.now();
  let processed = 0;
  let updated = 0;
  let errors = 0;
  
  try {
    // Find pending sessions older than 24 hours
    const pendingSessions = db.prepare(`
      SELECT 
        id, 
        user_id, 
        stripe_session_id, 
        plan, 
        created_at,
        julianday('now') - julianday(created_at) as days_old
      FROM checkout_sessions
      WHERE status = 'pending'
        AND created_at < datetime('now', '-24 hours')
      ORDER BY created_at ASC
    `).all();
    
    console.log(`[dailyJob] Found ${pendingSessions.length} pending sessions to check`);
    
    if (pendingSessions.length === 0) {
      console.log("[dailyJob] No pending sessions found. All good!");
      return {
        processed: 0,
        updated: 0,
        errors: 0,
        duration: Date.now() - startTime
      };
    }
    
    // Process each pending session
    for (const session of pendingSessions) {
      processed++;
      
      try {
        console.log(`[dailyJob] Checking session ${session.stripe_session_id} (${session.days_old.toFixed(1)} days old)`);
        
        // Query Stripe API
        const stripeSession = await stripeService.getCheckoutSession(session.stripe_session_id);
        
        if (!stripeSession) {
          console.error(`[dailyJob] Session ${session.stripe_session_id} not found in Stripe`);
          errors++;
          continue;
        }
        
        // Determine new status
        let newStatus = session.status;
        
        if (stripeSession.payment_status === 'paid' && stripeSession.status === 'complete') {
          newStatus = 'completed';
          console.log(`[dailyJob] ✅ Session ${session.stripe_session_id} should be completed`);
        } else if (stripeSession.status === 'expired') {
          newStatus = 'expired';
          console.log(`[dailyJob] ⏰ Session ${session.stripe_session_id} has expired`);
        } else if (stripeSession.status === 'open') {
          // Still open - user might return
          console.log(`[dailyJob] ⏳ Session ${session.stripe_session_id} still open`);
        } else {
          console.log(`[dailyJob] ℹ️ Session ${session.stripe_session_id} status: ${stripeSession.status}, payment: ${stripeSession.payment_status}`);
        }
        
        // Update if status changed
        if (newStatus !== 'pending') {
          const result = db.prepare(`
            UPDATE checkout_sessions
            SET 
              status = ?,
              completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END
            WHERE id = ?
          `).run(newStatus, newStatus, session.id);
          
          if (result.changes > 0) {
            updated++;
            console.log(`[dailyJob] Updated session ${session.stripe_session_id} to status: ${newStatus}`);
            
            // Log to analytics if available
            try {
              db.prepare(`
                INSERT INTO analytics_events (event, user_id, session_id, properties, created_at)
                VALUES ('DAILY_COMPENSATION_UPDATE', ?, ?, ?, datetime('now'))
              `).run(
                session.user_id,
                session.stripe_session_id,
                JSON.stringify({ 
                  oldStatus: 'pending', 
                  newStatus,
                  daysOld: session.days_old.toFixed(1)
                })
              );
            } catch (err) {
              // Analytics is optional - don't fail the job
              console.warn("[dailyJob] Failed to log analytics:", err.message);
            }
          }
        }
        
      } catch (err) {
        console.error(`[dailyJob] Error processing session ${session.stripe_session_id}:`, err.message);
        errors++;
      }
    }
    
    const duration = Date.now() - startTime;
    const summary = {
      processed,
      updated,
      errors,
      duration
    };
    
    console.log(`[dailyJob] ✅ Daily compensation completed:`, summary);
    return summary;
    
  } catch (err) {
    console.error("[dailyJob] Daily compensation job failed:", err);
    throw err;
  }
}

/**
 * Run daily compensation for failed webhook events
 * Retry events that failed but might succeed on retry
 */
export async function retryFailedWebhookEvents() {
  console.log("[dailyJob] Retrying failed webhook events...");
  
  const failedEvents = db.prepare(`
    SELECT 
      event_id, 
      event_type, 
      retry_count,
      payload,
      created_at
    FROM stripe_events
    WHERE status = 'failed'
      AND retry_count < 3
      AND created_at > datetime('now', '-7 days')
    ORDER BY created_at ASC
    LIMIT 100
  `).all();
  
  console.log(`[dailyJob] Found ${failedEvents.length} failed events to retry`);
  
  let retried = 0;
  let succeeded = 0;
  
  for (const eventRecord of failedEvents) {
    try {
      retried++;
      
      // Reconstruct event object
      const event = {
        id: eventRecord.event_id,
        type: eventRecord.event_type,
        data: {
          object: eventRecord.payload ? JSON.parse(eventRecord.payload) : {}
        }
      };
      
      console.log(`[dailyJob] Retrying event ${event.id} (attempt ${eventRecord.retry_count + 1})`);
      
      // Process event again
      await stripeService.processWebhookEvent(event);
      succeeded++;
      
    } catch (err) {
      console.error(`[dailyJob] Retry failed for event ${eventRecord.event_id}:`, err.message);
    }
  }
  
  console.log(`[dailyJob] Retry completed: ${succeeded}/${retried} succeeded`);
  
  return { retried, succeeded };
}

/**
 * Schedule daily job to run at specified time
 * @param {string} time - Time in HH:MM format (24-hour)
 */
export function scheduleDailyJob(time = "02:00") {
  const [hour, minute] = time.split(":").map(Number);
  
  const runJob = async () => {
    console.log(`[dailyJob] Running scheduled job at ${new Date().toISOString()}`);
    
    try {
      const compensationResult = await runDailyCompensation();
      const retryResult = await retryFailedWebhookEvents();
      
      console.log("[dailyJob] All jobs completed successfully");
      console.log("  - Compensation:", compensationResult);
      console.log("  - Retry:", retryResult);
    } catch (err) {
      console.error("[dailyJob] Job failed:", err);
    }
  };
  
  const scheduleNext = () => {
    const now = new Date();
    const scheduled = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );
    
    // If time has passed today, schedule for tomorrow
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const msUntilRun = scheduled.getTime() - now.getTime();
    
    console.log(`[dailyJob] Next run scheduled for ${scheduled.toISOString()} (in ${(msUntilRun / 1000 / 60 / 60).toFixed(1)} hours)`);
    
    setTimeout(() => {
      runJob().then(scheduleNext);
    }, msUntilRun);
  };
  
  scheduleNext();
}

export default {
  runDailyCompensation,
  retryFailedWebhookEvents,
  scheduleDailyJob
};
