/**
 * Analytics Dashboard API Routes
 * 
 * Comprehensive analytics endpoints for the QuizAll dashboard:
 * - Summary metrics (DAU, WAU, MAU, stickiness)
 * - User growth timeseries
 * - Timezone/geographic distribution
 * - Behavior metrics
 * - Admin data generation endpoints
 */

import { Router } from "express";
import { db } from "../lib/db.js";
import crypto from 'crypto';

export const analyticsDashboardRouter = Router();

// Configuration
const CONFIG = {
  goals: {
    totalUsers: 5000,
    dailyActiveUsers: 500,
  }
};

/**
 * GET /api/analytics/dashboard/debug-tables
 * Debug endpoint to check table existence
 */
analyticsDashboardRouter.get("/debug-tables", async (req, res) => {
  try {
    const tables = await db.all(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name LIKE 'analytics%'
    `);
    res.json({ ok: true, tables, database: 'PostgreSQL' });
  } catch (err) {
    res.json({ ok: false, error: err.message, database: 'unknown' });
  }
});

/**
 * GET /api/analytics/dashboard/summary
 * Returns comprehensive analytics summary for the dashboard
 */
analyticsDashboardRouter.get("/summary", (req, res) => {
  try {
    // Check if analytics tables exist
    let tableCheck;
    try {
      tableCheck = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_daily'
      `).get();
    } catch (e) {
      console.error('[analytics-dashboard] 表检查失败:', e.message);
      return res.status(500).json({ ok: false, error: `表检查失败: ${e.message}` });
    }
    
    if (!tableCheck) {
      return res.json({
        ok: true,
        users: { total: 0, newLast24h: 0, newLast7d: 0, newLast30d: 0 },
        today: { activeUsers: 0, sessions: 0, pageViews: 0 },
        activity: { dau: 0, wau: 0, mau: 0, dau_mau_ratio: 0 },
        behavior: { bounceRate: 0, avgReturnFrequency: "0" },
        timezones: [],
        engagement: { avgMouseMovements: "0", avgScrolls: "0", avgClicks: "0", avgTypingEvents: "0" },
        goals: CONFIG.goals,
        timestamp: new Date().toISOString()
      });
    }

    // Get the most recent date in database to use as reference point
    const mostRecentDate = db.prepare(`
      SELECT MAX(date) as maxDate FROM analytics_daily
    `).get()?.maxDate;
    
    // Get the most recent user created_at timestamp
    const mostRecentUserTime = db.prepare(`
      SELECT MAX(created_at) as maxTime FROM analytics_users
    `).get()?.maxTime;

    // Total users - 使用 analytics_daily 的 cumulative_users（最可靠的指标）
    // 因为 analytics_users 表记录可能因服务器重启而丢失，
    // 但 cumulative_users 是线性累加的，更能反映真实增长
    const cumulativeFromDaily = db.prepare(`
      SELECT cumulative_users FROM analytics_daily ORDER BY date DESC LIMIT 1
    `).get()?.cumulative_users || 0;
    const countFromUsers = db.prepare(`
      SELECT COUNT(*) as count FROM analytics_users
    `).get()?.count || 0;
    // 使用两者中较大的值，确保不因数据库重置而丢失已有增长
    const totalUsers = Math.max(cumulativeFromDaily, countFromUsers);
    
    // New users relative to NOW (not the most recent data date)
    // ✅ 修复：使用当前时间作为锚点，而不是最后一个用户注册时间
    const now = new Date().toISOString();
    const newLast24h = db.prepare(`
      SELECT COUNT(*) as count FROM analytics_users
      WHERE created_at >= datetime('now', '-24 hours')
    `).get()?.count || 0;
    
    const newLast7d = db.prepare(`
      SELECT COUNT(*) as count FROM analytics_users
      WHERE created_at >= datetime('now', '-7 days')
    `).get()?.count || 0;
    
    const newLast30d = db.prepare(`
      SELECT COUNT(*) as count FROM analytics_users
      WHERE created_at >= datetime('now', '-30 days')
    `).get()?.count || 0;
    
    // Most recent day's metrics (use most recent date in DB)
    const today = db.prepare(`
      SELECT 
        unique_users,
        total_sessions,
        total_page_views,
        bounce_rate
      FROM analytics_daily
      WHERE date = ?
    `).get(mostRecentDate) || { unique_users: 0, total_sessions: 0, total_page_views: 0, bounce_rate: 0.15 };
    
    // ============================================================
    // DAU / WAU / MAU - 完全按照Glossary的SQL定义计算
    // ============================================================
    
    // DAU (Daily Active Users)
    // 定义: COUNT(DISTINCT user_id) FROM analytics_sessions WHERE date = [target_date]
    // 特定日期启动至少一个会话的唯一用户
    const dau = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as total 
      FROM analytics_sessions
      WHERE date(session_start) = ?
    `).get(mostRecentDate)?.total || 0;
    
    // WAU (Weekly Active Users)
    // ✅ 修复：使用 BETWEEN 明确包含 reference_date
    // 定义: 过去7个日历天（包含reference_date）启动至少一个会话的唯一用户
    const wau = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as total 
      FROM analytics_sessions
      WHERE date(session_start) BETWEEN date(?, '-6 days') AND ?
    `).get(mostRecentDate, mostRecentDate)?.total || 0;
    
    // MAU (Monthly Active Users)
    // ✅ 修复：使用 BETWEEN 明确包含 reference_date
    // 定义: 过去30个日历天（包含reference_date）启动至少一个会话的唯一用户
    const mau = db.prepare(`
      SELECT COUNT(DISTINCT user_id) as total 
      FROM analytics_sessions
      WHERE date(session_start) BETWEEN date(?, '-29 days') AND ?
    `).get(mostRecentDate, mostRecentDate)?.total || 0;
    
    // Stickiness (DAU/MAU Ratio)
    // 定义: (DAU / MAU) × 100%
    // ✅ 修复：只保留客观描述，移除主观判断
    // Higher values indicate more frequent user engagement
    const dauMauRatio = mau > 0 ? ((dau / mau) * 100).toFixed(2) : '0.00';
    
    // Average bounce rate (7 days relative to most recent date)
    // ✅ 修复: Bounce Rate 使用加权计算 SUM(bounced)/SUM(total)
    // 定义：page_views = 1 的会话比例（只看了一页就离开）
    let bounceCount = 0;
    let totalSessionCount = 0;
    
    try {
      // ✅ 加权计算: SUM(bounced_sessions) / SUM(total_sessions)
      // 这样流量大的天会有更大的权重，更准确
      const bounceData = db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN page_views <= 1 THEN 1 ELSE 0 END) as bounced
        FROM analytics_sessions
        WHERE date(session_start) BETWEEN date(?, '-6 days') AND ?
      `).get(mostRecentDate, mostRecentDate);
      
      if (bounceData && bounceData.total > 0) {
        bounceCount = bounceData.bounced || 0;
        totalSessionCount = bounceData.total;
      }
    } catch (e) {
      console.log('[analytics] Bounce rate from sessions failed, using daily fallback');
    }
    
    // 如果 sessions 没有足够数据，回退到 daily 表（加权计算）
    let avgBounceRate;
    if (totalSessionCount > 0) {
      // ✅ 正确：直接用 bounced/total（已经是加权）
      avgBounceRate = bounceCount / totalSessionCount;
    } else {
      // ✅ 修复: 从 daily 表也使用加权计算
      const dailyBounce = db.prepare(`
        SELECT 
          SUM(total_sessions * bounce_rate) as weighted_bounce,
          SUM(total_sessions) as total_sessions
        FROM analytics_daily
        WHERE date BETWEEN date(?, '-6 days') AND ?
          AND total_sessions > 0
      `).get(mostRecentDate, mostRecentDate);
      
      if (dailyBounce && dailyBounce.total_sessions > 0) {
        avgBounceRate = dailyBounce.weighted_bounce / dailyBounce.total_sessions;
      } else {
        avgBounceRate = 0.125; // 默认值
      }
      // 如果值大于1，说明是百分比格式，需要转换
      if (avgBounceRate > 1) avgBounceRate = avgBounceRate / 100;
    }
    
    // 2️⃣ Return Frequency 实时计算 - 基于用户回访间隔
    // 计算同一用户多次 session 之间的平均间隔天数
    let avgReturnFrequency = 3.5; // 默认值
    
    try {
      // 计算每个用户的平均回访间隔
      const returnData = db.prepare(`
        WITH user_sessions AS (
          SELECT 
            user_id,
            date(session_start) as session_date,
            LAG(date(session_start)) OVER (PARTITION BY user_id ORDER BY session_start) as prev_date
          FROM analytics_sessions
          WHERE session_start > datetime(?, '-30 days')
        )
        SELECT AVG(julianday(session_date) - julianday(prev_date)) as avg_gap
        FROM user_sessions
        WHERE prev_date IS NOT NULL
          AND julianday(session_date) - julianday(prev_date) > 0
          AND julianday(session_date) - julianday(prev_date) < 30
      `).get(mostRecentDate);
      
      if (returnData && returnData.avg_gap && !isNaN(returnData.avg_gap)) {
        avgReturnFrequency = returnData.avg_gap;
      }
    } catch (e) {
      console.log('[analytics] Return frequency calculation failed, using default:', e.message);
    }
    
    // 如果计算结果不合理，使用基于 behavior 表的估算
    if (avgReturnFrequency <= 0 || avgReturnFrequency > 30) {
      try {
        const behaviorReturn = db.prepare(`
          SELECT AVG(return_frequency_days) as avg
          FROM analytics_behavior
          WHERE recorded_at > datetime(?, '-7 days')
            AND return_frequency_days > 0
            AND return_frequency_days < 30
        `).get(mostRecentUserTime || 'now');
        
        if (behaviorReturn && behaviorReturn.avg && !isNaN(behaviorReturn.avg)) {
          avgReturnFrequency = behaviorReturn.avg;
        }
      } catch (e) {
        // 保持默认值
      }
    }
    
    // Timezone distribution
    const timezones = db.prepare(`
      SELECT 
        timezone,
        COUNT(*) as count,
        COUNT(DISTINCT id) as uniqueEvents
      FROM analytics_users
      WHERE timezone IS NOT NULL
      GROUP BY timezone
      ORDER BY count DESC
      LIMIT 12
    `).all() || [];
    
    // Behavior averages (relative to most recent user activity)
    const behavior = db.prepare(`
      SELECT 
        AVG(mouse_movements) as avgMouse,
        AVG(scrolls) as avgScrolls,
        AVG(clicks) as avgClicks,
        AVG(typing_events) as avgTyping
      FROM analytics_behavior
      WHERE recorded_at > datetime(?, '-7 days')
    `).get(mostRecentUserTime || 'now') || {};
    
    res.json({
      ok: true,
      users: {
        total: totalUsers,
        newLast24h,
        newLast7d,
        newLast30d
      },
      today: {
        activeUsers: today.unique_users || dau,
        sessions: today.total_sessions || 0,
        pageViews: today.total_page_views || 0
      },
      activity: {
        dau,
        wau,
        mau,
        dau_mau_ratio: dauMauRatio  // 保持字符串格式以保留2位小数
      },
      behavior: {
        // 6️⃣ 所有百分比精确到2位小数
        bounceRate: (avgBounceRate * 100).toFixed(2),  // 实时计算的 bounce rate
        avgReturnFrequency: avgReturnFrequency.toFixed(2)  // 实时计算的回访频率
      },
      timezones: timezones.map(tz => ({
        timezone: tz.timezone,
        count: tz.count,
        uniqueEvents: tz.uniqueEvents
      })),
      engagement: {
        avgMouseMovements: (behavior.avgMouse || 150).toFixed(1),
        avgScrolls: (behavior.avgScrolls || 20).toFixed(1),
        avgClicks: (behavior.avgClicks || 10).toFixed(1),
        avgTypingEvents: (behavior.avgTyping || 50).toFixed(1)
      },
      goals: CONFIG.goals,
      meta: {
        dataAsOf: mostRecentDate,
        latestUserActivity: mostRecentUserTime
      },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[analytics-dashboard] Summary error:', err.message);
    console.error('[analytics-dashboard] Stack:', err.stack);
    res.status(500).json({ 
      ok: false, 
      error: `Failed to get analytics summary: ${err.message}` 
    });
  }
});

/**
 * GET /api/analytics/dashboard/timeseries
 * Returns daily timeseries data for charts
 */
analyticsDashboardRouter.get("/timeseries", (req, res) => {
  try {
    // Support period=all for full history, or days=N for last N days
    const period = req.query.period;
    const daysParam = String(req.query.days || '14').replace(/[^0-9]/g, '');
    const days = Math.min(Math.max(parseInt(daysParam) || 14, 1), 365);
    const getAllData = period === 'all';
    
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_daily'
    `).get();
    
    if (!tableCheck) {
      return res.json({ ok: true, data: [] });
    }
    
    // Get the most recent date in the database to use as reference
    const mostRecentDate = db.prepare(`
      SELECT MAX(date) as maxDate FROM analytics_daily
    `).get()?.maxDate;
    
    // If no data exists, return empty
    if (!mostRecentDate) {
      return res.json({ ok: true, data: [] });
    }
    
    // Query data - all data if period=all, otherwise last N days
    let data;
    if (getAllData) {
      data = db.prepare(`
        SELECT 
          date,
          unique_users as users,
          total_sessions as sessions,
          new_users as newUsers,
          cumulative_users as cumulativeUsers,
          bounce_rate as bounceRate
        FROM analytics_daily
        ORDER BY date ASC
      `).all();
    } else {
      data = db.prepare(`
        SELECT 
          date,
          unique_users as users,
          total_sessions as sessions,
          new_users as newUsers,
          cumulative_users as cumulativeUsers,
          bounce_rate as bounceRate
        FROM analytics_daily
        WHERE date > date(?, '-' || ? || ' days')
        ORDER BY date ASC
      `).all(mostRecentDate, days);
    }
    
    res.json({
      ok: true,
      data: data.map(d => ({
        ...d,
        label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        timestamp: d.date
      })),
      meta: {
        latestDate: mostRecentDate,
        days: days,
        recordCount: data.length
      }
    });
  } catch (err) {
    console.error('[analytics-dashboard] Timeseries error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get timeseries data' });
  }
});

/**
 * GET /api/analytics/dashboard/growth
 * Returns user growth metrics
 */
analyticsDashboardRouter.get("/growth", (req, res) => {
  try {
    const tableCheck = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='analytics_daily'
    `).get();
    
    if (!tableCheck) {
      return res.json({ ok: true, daily: [], weekly: [], monthly: [] });
    }
    
    // Daily growth (last 30 days)
    const daily = db.prepare(`
      SELECT date, new_users, cumulative_users
      FROM analytics_daily
      WHERE date > date('now', '-30 days')
      ORDER BY date ASC
    `).all();
    
    // Weekly aggregation
    const weekly = db.prepare(`
      SELECT 
        strftime('%Y-W%W', date) as week,
        SUM(new_users) as newUsers,
        MAX(cumulative_users) as cumulativeUsers
      FROM analytics_daily
      WHERE date > date('now', '-90 days')
      GROUP BY strftime('%Y-W%W', date)
      ORDER BY week ASC
    `).all();
    
    res.json({ ok: true, daily, weekly });
  } catch (err) {
    console.error('[analytics-dashboard] Growth error:', err);
    res.status(500).json({ ok: false, error: 'Failed to get growth data' });
  }
});

/**
 * POST /api/analytics/dashboard/admin/generate-data
 * Admin endpoint to generate simulated data (for behavior simulator)
 */
analyticsDashboardRouter.post("/admin/generate-data", async (req, res) => {
  try {
    // Simple auth check via admin key
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    const expectedKey = process.env.ADMIN_API_KEY;
    
    if (expectedKey && adminKey !== expectedKey) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    
    const { users = 0, sessions = 0 } = req.body;
    
    if (users < 0 || sessions < 0) {
      return res.status(400).json({ ok: false, error: 'Invalid parameters' });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    // Timezone distribution
    const timezones = [
      'America/New_York', 'America/Los_Angeles', 'Europe/London',
      'Europe/Paris', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Singapore'
    ];
    
    // Name pools for generating realistic emails (Registered Users)
    const firstNames = ['james', 'mary', 'john', 'patricia', 'robert', 'jennifer', 'michael', 'linda', 
                        'david', 'elizabeth', 'william', 'barbara', 'richard', 'susan', 'joseph', 'jessica',
                        'thomas', 'sarah', 'charles', 'karen', 'emma', 'olivia', 'ava', 'sophia', 'liam',
                        'noah', 'oliver', 'elijah', 'lucas', 'mason', 'alex', 'chris', 'sam', 'taylor', 'jordan'];
    const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me'];
    
    const getRandomTz = () => timezones[Math.floor(Math.random() * timezones.length)];
    const getRandomDevice = () => ['desktop', 'mobile', 'tablet'][Math.floor(Math.random() * 3)];
    const getRandomBrowser = () => ['Chrome', 'Safari', 'Firefox', 'Edge'][Math.floor(Math.random() * 4)];
    const getRandomEmail = () => {
      const name = firstNames[Math.floor(Math.random() * firstNames.length)];
      const domain = domains[Math.floor(Math.random() * domains.length)];
      return `${name}${Math.floor(Math.random() * 9999) + 1}@${domain}`;
    };
    
    // Insert new users (with email to make them Registered Users)
    const userInsert = db.prepare(`
      INSERT INTO analytics_users (id, email, source, timezone, country, device_type, browser, created_at, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const sessionInsert = db.prepare(`
      INSERT INTO analytics_sessions (id, user_id, session_start, duration_seconds, page_views, device_type, browser, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const newUserIds = [];
    
    for (let i = 0; i < users; i++) {
      const userId = `au_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const email = getRandomEmail();
      const now = new Date().toISOString();
      const tz = getRandomTz();
      
      await userInsert.run(
        userId, email, 'simulator', tz, 'US',
        getRandomDevice(), getRandomBrowser(), now, now
      );
      newUserIds.push(userId);
    }
    
    // Get existing users for sessions
    const existingUsers = await db.prepare(`
      SELECT id FROM analytics_users ORDER BY created_at DESC LIMIT 100
    `).all();
    const existingUserIds = existingUsers.map(u => u.id);
    
    const allUserIds = [...newUserIds, ...existingUserIds];
    
    // Insert sessions
    // ⚠️ 关键修复: 让会话时间在过去30天内随机分布
    // 这样才能产生合理的 WAU (>= DAU) 和 MAU (>= WAU) 数据
    // 分布策略（优化后，让 MAU > WAU）:
    // - 40% 会话在今天（保证 DAU 有数据）
    // - 35% 会话在过去7天（让 WAU > DAU）
    // - 25% 会话在过去8-30天（让 MAU > WAU）
    for (let i = 0; i < sessions; i++) {
      const sessionId = `as_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const userId = allUserIds[Math.floor(Math.random() * allUserIds.length)];
      
      // 随机选择会话时间
      const roll = Math.random() * 100;
      let hoursAgo;
      if (roll < 40) {
        // 40% - 今天（0-24小时前）
        hoursAgo = Math.random() * 24;
      } else if (roll < 75) {
        // 35% - 过去7天（1-7天前）
        hoursAgo = 24 + Math.random() * (24 * 6);
      } else {
        // 25% - 过去8-30天（7-30天前）
        hoursAgo = 24 * 7 + Math.random() * (24 * 23);
      }
      
      const sessionStart = new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString();
      
      await sessionInsert.run(
        sessionId, userId, sessionStart,
        Math.round(30 + Math.random() * 300),
        1 + Math.floor(Math.random() * 5),
        getRandomDevice(), getRandomBrowser(), new Date().toISOString()
      );
    }
    
    // Update daily aggregate
    const existingDaily = await db.prepare(`
      SELECT * FROM analytics_daily WHERE date = ?
    `).get(today);
    
    if (existingDaily) {
      await db.prepare(`
        UPDATE analytics_daily
        SET unique_users = unique_users + ?,
            new_users = new_users + ?,
            total_sessions = total_sessions + ?,
            cumulative_users = cumulative_users + ?
        WHERE date = ?
      `).run(users, users, sessions, users, today);
    } else {
      const prevDaily = await db.prepare(`
        SELECT cumulative_users FROM analytics_daily ORDER BY date DESC LIMIT 1
      `).get();
      const prevCumulative = prevDaily?.cumulative_users || 0;
      
      await db.prepare(`
        INSERT INTO analytics_daily (date, unique_users, new_users, total_sessions, cumulative_users, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(today, users, users, sessions, prevCumulative + users, new Date().toISOString());
    }
    
    res.json({
      ok: true,
      generated: { users, sessions },
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[analytics-dashboard] Generate error:', err);
    console.error('[analytics-dashboard] Error stack:', err.stack);
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to generate data',
      details: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

/**
 * POST /api/analytics/dashboard/track-behavior
 * Track user behavior from frontend
 */
analyticsDashboardRouter.post("/track-behavior", (req, res) => {
  try {
    const { userId, sessionId, mouseMovements, scrolls, clicks, typingEvents } = req.body;
    
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' });
    }
    
    db.prepare(`
      INSERT INTO analytics_behavior (user_id, session_id, recorded_at, mouse_movements, scrolls, clicks, typing_events, engagement_score)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      userId,
      sessionId || null,
      new Date().toISOString(),
      mouseMovements || 0,
      scrolls || 0,
      clicks || 0,
      typingEvents || 0,
      Math.min(100, (mouseMovements || 0) / 5 + (clicks || 0) * 3 + (scrolls || 0) * 2)
    );
    
    res.status(204).end();
  } catch (err) {
    console.error('[analytics-dashboard] Track behavior error:', err);
    res.status(204).end(); // Always return 204 to not block frontend
  }
});

// ============================================================
// Analytics Track API - For Behavior Simulator
// ============================================================

/**
 * POST /api/analytics/track/user
 * Track new user registration
 */
analyticsDashboardRouter.post("/track/user", (req, res) => {
  try {
    const { userId, source, timezone, deviceType, browser } = req.body;
    
    if (!userId) {
      return res.status(400).json({ ok: false, error: 'userId required' });
    }
    
    // Check if user already exists
    const existing = db.prepare(`SELECT id FROM analytics_users WHERE id = ?`).get(userId);
    
    if (existing) {
      return res.json({ ok: true, message: 'user already exists' });
    }
    
    // Insert into analytics_users (matching actual table schema)
    db.prepare(`
      INSERT INTO analytics_users (id, created_at, source, timezone, device_type, browser, is_active, last_active_at)
      VALUES (?, datetime('now'), ?, ?, ?, ?, 1, datetime('now'))
    `).run(userId, source || 'direct', timezone || 'UTC', deviceType || 'desktop', browser || 'Chrome');
    
    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    const dailyExists = db.prepare(`SELECT 1 FROM analytics_daily WHERE date = ?`).get(today);
    
    if (dailyExists) {
      db.prepare(`
        UPDATE analytics_daily SET 
          new_users = new_users + 1,
          cumulative_users = cumulative_users + 1
        WHERE date = ?
      `).run(today);
    } else {
      const totalUsers = db.prepare(`SELECT COUNT(*) as count FROM analytics_users`).get().count;
      db.prepare(`
        INSERT INTO analytics_daily (date, unique_users, new_users, cumulative_users, total_sessions, total_page_views, bounce_rate, created_at)
        VALUES (?, 1, 1, ?, 0, 0, 0, datetime('now'))
      `).run(today, totalUsers);
    }
    
    res.json({ ok: true, userId });
  } catch (err) {
    console.error('[analytics] Track user error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/**
 * POST /api/analytics/track/session-start
 * Track session start
 */
analyticsDashboardRouter.post("/track/session-start", (req, res) => {
  try {
    const { userId, sessionId, deviceType, browser } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId required' });
    }
    
    const effectiveUserId = userId || 'anonymous';
    
    // Ensure user exists before creating session (FK constraint)
    const userExists = db.prepare(`SELECT id FROM analytics_users WHERE id = ?`).get(effectiveUserId);
    if (!userExists) {
      db.prepare(`
        INSERT OR IGNORE INTO analytics_users (id, created_at, source, timezone, is_active, last_active_at)
        VALUES (?, datetime('now'), 'direct', 'UTC', 1, datetime('now'))
      `).run(effectiveUserId);
    }
    
    // Insert session with all required NOT NULL fields
    db.prepare(`
      INSERT INTO analytics_sessions (id, user_id, session_start, device_type, browser, created_at)
      VALUES (?, ?, datetime('now'), ?, ?, datetime('now'))
    `).run(sessionId, effectiveUserId, deviceType || 'desktop', browser || 'Chrome');
    
    // Update daily unique users
    const today = new Date().toISOString().split('T')[0];
    db.prepare(`
      UPDATE analytics_daily SET unique_users = (
        SELECT COUNT(DISTINCT user_id) FROM analytics_sessions 
        WHERE date(session_start) = ?
      ) WHERE date = ?
    `).run(today, today);
    
    res.json({ ok: true, sessionId });
  } catch (err) {
    console.error('[analytics] Track session-start error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/**
 * POST /api/analytics/track/session-end
 * Track session end
 */
analyticsDashboardRouter.post("/track/session-end", (req, res) => {
  try {
    const { sessionId, duration, pageViews } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'sessionId required' });
    }
    
    db.prepare(`
      UPDATE analytics_sessions SET 
        session_end = datetime('now'),
        duration_seconds = ?,
        page_views = ?
      WHERE id = ?
    `).run(duration || 0, pageViews || 1, sessionId);
    
    // Update daily stats
    const today = new Date().toISOString().split('T')[0];
    const dailyExists = db.prepare(`SELECT 1 FROM analytics_daily WHERE date = ?`).get(today);
    
    if (dailyExists) {
      const isBounce = (pageViews || 1) <= 1 ? 1 : 0;
      db.prepare(`
        UPDATE analytics_daily SET 
          total_sessions = total_sessions + 1,
          total_page_views = total_page_views + ?,
          bounce_rate = (
            SELECT COALESCE(AVG(CASE WHEN page_views <= 1 THEN 100.0 ELSE 0.0 END), 0)
            FROM analytics_sessions WHERE date(session_start) = ?
          )
        WHERE date = ?
      `).run(pageViews || 1, today, today);
    }
    
    res.json({ ok: true, sessionId });
  } catch (err) {
    console.error('[analytics] Track session-end error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});

/**
 * POST /api/analytics/track/behavior
 * Track user behavior (mouse, scroll, click, typing)
 */
analyticsDashboardRouter.post("/track/behavior", (req, res) => {
  try {
    const { userId, sessionId, mouseMovements, scrolls, clicks, typingEvents } = req.body;
    
    // Verify user and session exist to avoid FK constraint errors
    if (userId && userId !== 'anonymous') {
      const userExists = db.prepare(`SELECT id FROM analytics_users WHERE id = ?`).get(userId);
      if (!userExists) {
        // Create user if not exists
        db.prepare(`
          INSERT OR IGNORE INTO analytics_users (id, created_at, source, timezone, is_active, last_active_at)
          VALUES (?, datetime('now'), 'direct', 'UTC', 1, datetime('now'))
        `).run(userId);
      }
    }
    
    if (sessionId) {
      const sessionExists = db.prepare(`SELECT id FROM analytics_sessions WHERE id = ?`).get(sessionId);
      if (!sessionExists) {
        // Create session if not exists
        db.prepare(`
          INSERT OR IGNORE INTO analytics_sessions (id, user_id, session_start, created_at)
          VALUES (?, ?, datetime('now'), datetime('now'))
        `).run(sessionId, userId || 'anonymous');
      }
    }
    
    // Calculate engagement score
    const engagementScore = Math.min(100, (mouseMovements || 0) / 5 + (clicks || 0) * 3 + (scrolls || 0) * 2);
    
    db.prepare(`
      INSERT INTO analytics_behavior (user_id, session_id, recorded_at, mouse_movements, scrolls, clicks, typing_events, engagement_score)
      VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?)
    `).run(
      userId || 'anonymous',
      sessionId || null,
      mouseMovements || 0,
      scrolls || 0,
      clicks || 0,
      typingEvents || 0,
      engagementScore
    );
    
    res.json({ ok: true });
  } catch (err) {
    console.error('[analytics] Track behavior error:', err);
    res.status(500).json({ ok: false, error: 'Internal error' });
  }
});
/**
 * POST /api/analytics/dashboard/admin/backfill-daily
 * Admin endpoint to backfill historical analytics_daily records
 * Used to fill gaps in the timeline (e.g., after server hibernation)
 */
analyticsDashboardRouter.post("/admin/backfill-daily", async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.body.adminKey;
    const expectedKey = process.env.ADMIN_API_KEY;
    if (expectedKey && adminKey !== expectedKey) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const { records } = req.body;
    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({ ok: false, error: 'records array required' });
    }

    let inserted = 0;
    let skipped = 0;

    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO analytics_daily 
        (date, unique_users, new_users, returning_users, total_sessions, 
         total_page_views, avg_session_duration, bounce_rate, cumulative_users, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

    for (const r of records) {
      if (!r.date) continue;
      try {
        const result = insertStmt.run(
          r.date,
          r.unique_users || r.uniqueUsers || 0,
          r.new_users || r.newUsers || 0,
          r.returning_users || r.returningUsers || 0,
          r.total_sessions || r.totalSessions || 0,
          r.total_page_views || r.totalPageViews || 0,
          r.avg_session_duration || r.avgSessionDuration || 0,
          r.bounce_rate || r.bounceRate || 0.15,
          r.cumulative_users || r.cumulativeUsers || 0
        );
        if (result.changes > 0) inserted++;
        else skipped++;
      } catch (e) {
        skipped++;
      }
    }

    res.json({ ok: true, inserted, skipped, total: records.length });
  } catch (err) {
    console.error('[analytics-dashboard] Backfill error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

/**
 * GET /api/analytics/dashboard/admin/realtime-count
 * Debug endpoint - returns real-time database counts
 */
analyticsDashboardRouter.get("/admin/realtime-count", async (req, res) => {
  try {
    const usersCount = await db.prepare(`SELECT COUNT(*) as count FROM analytics_users`).get();
    const sessionsCount = await db.prepare(`SELECT COUNT(*) as count FROM analytics_sessions`).get();
    const dailyCount = await db.prepare(`SELECT COUNT(*) as count FROM analytics_daily`).get();
    const latestDaily = await db.prepare(`
      SELECT date, cumulative_users, unique_users, new_users 
      FROM analytics_daily 
      ORDER BY date DESC 
      LIMIT 1
    `).get();
    
    res.json({
      ok: true,
      realtime: {
        analytics_users: usersCount.count,
        analytics_sessions: sessionsCount.count,
        analytics_daily_records: dailyCount.count
      },
      latestDaily: latestDaily || null,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[analytics] Realtime count error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});