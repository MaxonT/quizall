/**
 * QuizAll Analytics Dashboard API
 *
 * Shows real metrics from actual quiz activity.
 * Fully async, PostgreSQL + SQLite compatible.
 */

import { Router } from "express";
import { db } from "../lib/db.js";

export const analyticsDashboardRouter = Router();

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

// ─── Unified DB helpers ────────────────────────────────────────────────────

function dbGet(sql, params = []) {
  if (USE_POSTGRES) return db.get(sql, ...params);
  return Promise.resolve(db.prepare(sql).get(...params));
}

function dbAll(sql, params = []) {
  if (USE_POSTGRES) return db.all(sql, ...params);
  return Promise.resolve(db.prepare(sql).all(...params));
}

// Compute ISO string for N days ago
function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ─── Routes ────────────────────────────────────────────────────────────────

/**
 * GET /api/analytics/dashboard/summary
 * Core dashboard metrics — all real data from quiz activity
 */
analyticsDashboardRouter.get("/summary", async (req, res) => {
  try {
    const now = new Date().toISOString();
    const last24h = daysAgo(1);
    const last7d  = daysAgo(7);
    const last30d = daysAgo(30);

    // Total users
    const usersTotal    = await dbGet(`SELECT COUNT(*) as c FROM users`);
    const usersLast24h  = await dbGet(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, [last24h]);
    const usersLast7d   = await dbGet(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, [last7d]);
    const usersLast30d  = await dbGet(`SELECT COUNT(*) as c FROM users WHERE created_at >= ?`, [last30d]);

    // Quiz metrics (quiz_results table created by quiz.js)
    let quizzesTotal = { c: 0 }, quizzesLast7d = { c: 0 }, quizzesLast30d = { c: 0 };
    let avgScore = { avg: 0 }, avgQuestions = { avg: 0 };
    let recentQuizzes = [];

    try {
      quizzesTotal   = await dbGet(`SELECT COUNT(*) as c FROM quiz_results`) || { c: 0 };
      quizzesLast7d  = await dbGet(`SELECT COUNT(*) as c FROM quiz_results WHERE created_at >= ?`, [last7d]) || { c: 0 };
      quizzesLast30d = await dbGet(`SELECT COUNT(*) as c FROM quiz_results WHERE created_at >= ?`, [last30d]) || { c: 0 };
      avgScore       = await dbGet(`SELECT AVG(CAST(score AS REAL) / NULLIF(total, 0) * 100) as avg FROM quiz_results`) || { avg: 0 };
      avgQuestions   = await dbGet(`SELECT AVG(total) as avg FROM quiz_results`) || { avg: 0 };
      recentQuizzes  = await dbAll(`SELECT subject, score, total, created_at FROM quiz_results ORDER BY created_at DESC LIMIT 10`) || [];
    } catch (_e) {
      // quiz_results table may not exist yet on fresh deploy
    }

    // Score distribution
    let scoreDistrib = { excellent: 0, good: 0, needsWork: 0 };
    try {
      const excellent = await dbGet(`SELECT COUNT(*) as c FROM quiz_results WHERE CAST(score AS REAL) / NULLIF(total, 0) >= 0.8`) || { c: 0 };
      const good      = await dbGet(`SELECT COUNT(*) as c FROM quiz_results WHERE CAST(score AS REAL) / NULLIF(total, 0) >= 0.5 AND CAST(score AS REAL) / NULLIF(total, 0) < 0.8`) || { c: 0 };
      const needs     = await dbGet(`SELECT COUNT(*) as c FROM quiz_results WHERE CAST(score AS REAL) / NULLIF(total, 0) < 0.5`) || { c: 0 };
      scoreDistrib = { excellent: Number(excellent.c), good: Number(good.c), needsWork: Number(needs.c) };
    } catch (_e) {}
    
    res.json({
      ok: true,
      users: {
        total:      Number(usersTotal?.c   || 0),
        last24h:    Number(usersLast24h?.c || 0),
        last7d:     Number(usersLast7d?.c  || 0),
        last30d:    Number(usersLast30d?.c || 0),
      },
      quizzes: {
        total:      Number(quizzesTotal?.c   || 0),
        last7d:     Number(quizzesLast7d?.c  || 0),
        last30d:    Number(quizzesLast30d?.c || 0),
        avgScore:   Number((avgScore?.avg   || 0)).toFixed(1),
        avgQuestions: Number((avgQuestions?.avg || 0)).toFixed(1),
      },
      scoreDistribution: scoreDistrib,
      recentQuizzes: recentQuizzes.map(q => ({
        subject: q.subject,
        score: q.score,
        total: q.total,
        pct: q.total > 0 ? ((q.score / q.total) * 100).toFixed(1) : '0.0',
        createdAt: q.created_at,
      })),
      timestamp: now,
    });
  } catch (err) {
    console.error("[analytics-dashboard] summary error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to get analytics summary" });
  }
});

/**
 * GET /api/analytics/dashboard/timeseries
 * Daily quiz count over the past N days (default 30)
 */
analyticsDashboardRouter.get("/timeseries", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '30'), 1), 365);
    const since = daysAgo(days);

    let data = [];
    try {
      if (USE_POSTGRES) {
        data = await dbAll(
          `SELECT DATE(created_at) as date, COUNT(*) as quizzes, COUNT(DISTINCT user_id) as active_users
           FROM quiz_results
           WHERE created_at >= $1
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [since]
        ) || [];
    } else {
        data = await dbAll(
          `SELECT date(created_at) as date, COUNT(*) as quizzes, COUNT(DISTINCT user_id) as active_users
           FROM quiz_results
           WHERE created_at >= ?
           GROUP BY date(created_at)
           ORDER BY date ASC`,
          [since]
        ) || [];
      }
    } catch (_e) {}

    res.json({ ok: true, days, data });
  } catch (err) {
    console.error("[analytics-dashboard] timeseries error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to get timeseries" });
  }
});

/**
 * GET /api/analytics/dashboard/growth
 * User registration growth
 */
analyticsDashboardRouter.get("/growth", async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days || '30'), 1), 365);
    const since = daysAgo(days);

    let data = [];
    try {
      if (USE_POSTGRES) {
        data = await dbAll(
          `SELECT DATE(created_at) as date, COUNT(*) as new_users
           FROM users WHERE created_at >= $1
           GROUP BY DATE(created_at)
           ORDER BY date ASC`,
          [since]
        ) || [];
      } else {
        data = await dbAll(
          `SELECT date(created_at) as date, COUNT(*) as new_users
           FROM users WHERE created_at >= ?
           GROUP BY date(created_at)
           ORDER BY date ASC`,
          [since]
        ) || [];
      }
    } catch (_e) {}

    res.json({ ok: true, days, data });
  } catch (err) {
    console.error("[analytics-dashboard] growth error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to get growth data" });
  }
});

/**
 * GET /api/analytics/dashboard/top-subjects
 * Most popular quiz subjects
 */
analyticsDashboardRouter.get("/top-subjects", async (req, res) => {
  try {
    let data = [];
    try {
      data = await dbAll(
        `SELECT subject, COUNT(*) as count, AVG(CAST(score AS REAL) / NULLIF(total, 0) * 100) as avg_score
         FROM quiz_results
         WHERE subject IS NOT NULL AND subject != ''
         GROUP BY subject
         ORDER BY count DESC
         LIMIT 20`
      ) || [];
    } catch (_e) {}
    
    res.json({
      ok: true,
      subjects: data.map(d => ({
        subject: d.subject,
        count: Number(d.count),
        avgScore: Number(d.avg_score || 0).toFixed(1),
      })),
    });
  } catch (err) {
    console.error("[analytics-dashboard] top-subjects error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to get top subjects" });
  }
});

/**
 * GET /api/analytics/dashboard/users
 * User list for admin
 */
analyticsDashboardRouter.get("/users", async (req, res) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '20')));
    const offset = (page - 1) * limit;

    const total = await dbGet(`SELECT COUNT(*) as c FROM users`);
    const users = await dbAll(
      `SELECT id, email, subscription_tier, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    ) || [];

    // Quiz count per user
    let quizCounts = {};
    try {
      const counts = await dbAll(
        `SELECT user_id, COUNT(*) as c FROM quiz_results GROUP BY user_id`
      ) || [];
      counts.forEach(r => { quizCounts[r.user_id] = Number(r.c); });
    } catch (_e) {}
    
    res.json({
      ok: true,
      users: users.map(u => ({
        id: u.id,
        email: u.email,
        plan: u.subscription_tier || 'free',
        quizCount: quizCounts[u.id] || 0,
        createdAt: u.created_at,
      })),
      pagination: {
        page,
        limit,
        total: Number(total?.c || 0),
        pages: Math.ceil(Number(total?.c || 0) / limit),
      },
    });
  } catch (err) {
    console.error("[analytics-dashboard] users error:", err.message);
    res.status(500).json({ ok: false, error: "Failed to get users" });
  }
});
