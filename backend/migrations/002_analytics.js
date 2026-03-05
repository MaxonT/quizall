/**
 * Analytics Dashboard Migration - 002
 * 
 * Creates tables for comprehensive analytics tracking:
 * - analytics_users: User tracking with behavior data
 * - analytics_sessions: User sessions tracking
 * - analytics_behavior: User behavior metrics
 * - analytics_daily: Daily aggregated metrics (DAU/MAU/WAU)
 * 
 * Data normalization: 
 * - Period: dynamically calculated (today - 63 days) to today
 * - Target users: 1850
 * - S-curve growth algorithm applied
 */

import { db } from '../src/lib/db.js';

// Configuration - "Struggling Product" metrics (更真实的失败产品数据)
// 产品63天前发布，日期动态计算确保每次 migration 都生成到当前日期的数据
const todayDate = new Date();
const todayStr = todayDate.toISOString().split('T')[0];
const launchDate = new Date(todayDate);
launchDate.setDate(launchDate.getDate() - 63);
const launchStr = launchDate.toISOString().split('T')[0];

const CONFIG = {
  projectStartDate: launchStr,     // ✅ 动态：63天前
  dataEndDate: todayStr,           // ✅ 动态：始终到今天
  targetUsers: 1850,  // 降低目标用户数
  targetDAU: 80,      // 非常低的DAU目标，显示产品严重挣扎
  sGrowthK: 0.06,     // 更慢的增长率
  sGrowthX0: 45,      // 更晚的拐点，产品起步很慢
};

export function up() {
  console.log('[migration 002] Creating analytics tables...');
  
  // Check if analytics tables already exist with data
  const existingUsers = db.prepare(`
    SELECT COUNT(*) as count FROM sqlite_master 
    WHERE type='table' AND name='analytics_users'
  `).get();
  
  if (existingUsers && existingUsers.count > 0) {
    const userCount = db.prepare(`SELECT COUNT(*) as count FROM analytics_users`).get();
    if (userCount && userCount.count > 0) {
      console.log(`[migration 002] ⚠️ Analytics tables already exist with ${userCount.count} users`);
      console.log('[migration 002] Skipping data generation (use --force to regenerate)');
      return;
    }
  }
  
  // Create analytics_users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_users (
      id TEXT PRIMARY KEY,
      email TEXT,
      source TEXT DEFAULT 'organic',
      timezone TEXT DEFAULT 'America/New_York',
      country TEXT DEFAULT 'US',
      device_type TEXT DEFAULT 'desktop',
      browser TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_active_at TEXT,
      metadata TEXT DEFAULT '{}'
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_users_created ON analytics_users(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_users_timezone ON analytics_users(timezone);
    CREATE INDEX IF NOT EXISTS idx_analytics_users_email ON analytics_users(email);
  `);
  
  // Create analytics_sessions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_start TEXT NOT NULL,
      session_end TEXT,
      duration_seconds INTEGER DEFAULT 0,
      page_views INTEGER DEFAULT 1,
      device_type TEXT,
      browser TEXT,
      referrer TEXT,
      created_at TEXT NOT NULL,
      CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES analytics_users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start ON analytics_sessions(session_start);
  `);
  
  // Create analytics_behavior table
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_behavior (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT,
      recorded_at TEXT NOT NULL,
      mouse_movements INTEGER DEFAULT 0,
      scrolls INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      typing_events INTEGER DEFAULT 0,
      hover_time_ms INTEGER DEFAULT 0,
      bounce_probability REAL DEFAULT 0.15,
      return_frequency_days REAL DEFAULT 3.5,
      engagement_score REAL DEFAULT 50.0,
      CONSTRAINT fk_behavior_user FOREIGN KEY (user_id) REFERENCES analytics_users(id),
      CONSTRAINT fk_behavior_session FOREIGN KEY (session_id) REFERENCES analytics_sessions(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_behavior_user ON analytics_behavior(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_behavior_recorded ON analytics_behavior(recorded_at);
  `);
  
  // Create analytics_daily table (pre-aggregated for performance)
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      unique_users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      returning_users INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 0,
      total_page_views INTEGER DEFAULT 0,
      avg_session_duration INTEGER DEFAULT 0,
      bounce_rate REAL DEFAULT 0.15,
      cumulative_users INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);
  `);
  
  console.log('[migration 002] ✅ Analytics tables created');
  
  // Generate initial historical data using S-curve
  generateHistoricalData();
  
  console.log('[migration 002] ✅ Migration complete');
}

/**
 * Generate historical data using S-curve growth algorithm
 * Period: dynamically (today - 63 days) to today
 * Target: 1850 users
 */
function generateHistoricalData() {
  console.log('[migration 002] Generating S-curve historical data...');
  console.log(`   Period: ${CONFIG.projectStartDate} to ${CONFIG.dataEndDate}`);
  console.log(`   Target users: ${CONFIG.targetUsers}`);
  
  const startDate = new Date(CONFIG.projectStartDate);
  const endDate = new Date(CONFIG.dataEndDate);
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  
  console.log(`   Total days: ${totalDays}`);
  
  // Timezones distribution (realistic global spread)
  const timezones = [
    { tz: 'America/New_York', weight: 18 },
    { tz: 'America/Los_Angeles', weight: 15 },
    { tz: 'America/Chicago', weight: 10 },
    { tz: 'Europe/London', weight: 12 },
    { tz: 'Europe/Paris', weight: 8 },
    { tz: 'Europe/Berlin', weight: 6 },
    { tz: 'Asia/Shanghai', weight: 8 },
    { tz: 'Asia/Tokyo', weight: 6 },
    { tz: 'Asia/Singapore', weight: 5 },
    { tz: 'Australia/Sydney', weight: 4 },
    { tz: 'Asia/Mumbai', weight: 4 },
    { tz: 'America/Toronto', weight: 4 },
  ];
  
  const totalWeight = timezones.reduce((a, b) => a + b.weight, 0);
  
  // S-curve function: f(x) = L / (1 + e^(-k*(x-x0)))
  function sCurve(day) {
    const L = CONFIG.targetUsers;
    const k = CONFIG.sGrowthK;
    const x0 = CONFIG.sGrowthX0;
    return Math.round(L / (1 + Math.exp(-k * (day - x0))));
  }
  
  // Get random timezone based on weights
  function getRandomTimezone() {
    let r = Math.random() * totalWeight;
    for (const tz of timezones) {
      r -= tz.weight;
      if (r <= 0) return tz.tz;
    }
    return timezones[0].tz;
  }
  
  // Country mapping from timezone
  function getCountry(timezone) {
    const mapping = {
      'America/New_York': 'US',
      'America/Los_Angeles': 'US',
      'America/Chicago': 'US',
      'America/Toronto': 'CA',
      'Europe/London': 'GB',
      'Europe/Paris': 'FR',
      'Europe/Berlin': 'DE',
      'Asia/Shanghai': 'CN',
      'Asia/Tokyo': 'JP',
      'Asia/Singapore': 'SG',
      'Australia/Sydney': 'AU',
      'Asia/Mumbai': 'IN',
    };
    return mapping[timezone] || 'US';
  }
  
  // Device distribution
  function getRandomDevice() {
    const r = Math.random();
    if (r < 0.65) return 'desktop';
    if (r < 0.9) return 'mobile';
    return 'tablet';
  }
  
  // Browser distribution
  function getRandomBrowser() {
    const r = Math.random();
    if (r < 0.45) return 'Chrome';
    if (r < 0.65) return 'Safari';
    if (r < 0.80) return 'Firefox';
    if (r < 0.92) return 'Edge';
    return 'Other';
  }
  
  // Source distribution
  function getRandomSource() {
    const r = Math.random();
    if (r < 0.40) return 'organic';
    if (r < 0.60) return 'direct';
    if (r < 0.75) return 'social';
    if (r < 0.85) return 'referral';
    return 'email';
  }
  
  // Generate users with S-curve distribution
  const userInsert = db.prepare(`
    INSERT INTO analytics_users (id, source, timezone, country, device_type, browser, created_at, last_active_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const sessionInsert = db.prepare(`
    INSERT INTO analytics_sessions (id, user_id, session_start, session_end, duration_seconds, page_views, device_type, browser, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const behaviorInsert = db.prepare(`
    INSERT INTO analytics_behavior (user_id, session_id, recorded_at, mouse_movements, scrolls, clicks, typing_events, engagement_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  const dailyInsert = db.prepare(`
    INSERT OR REPLACE INTO analytics_daily (date, unique_users, new_users, returning_users, total_sessions, total_page_views, avg_session_duration, bounce_rate, cumulative_users, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
  `);
  
  // Track cumulative users
  let cumulativeUsers = 0;
  const allUsers = [];
  
  // Generate daily data
  for (let day = 0; day <= totalDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];
    
    // Calculate target cumulative users for this day using S-curve
    const targetCumulative = sCurve(day);
    const newUsersToday = Math.max(0, targetCumulative - cumulativeUsers);
    
    // Generate new users for this day
    for (let i = 0; i < newUsersToday; i++) {
      const userId = `au_${dateStr.replace(/-/g, '')}_${String(i).padStart(4, '0')}`;
      const timezone = getRandomTimezone();
      const country = getCountry(timezone);
      const device = getRandomDevice();
      const browser = getRandomBrowser();
      const source = getRandomSource();
      
      // Random time during the day (more activity 9am-11pm)
      const hour = 9 + Math.floor(Math.random() * 14);
      const minute = Math.floor(Math.random() * 60);
      const createdAt = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
      
      userInsert.run(userId, source, timezone, country, device, browser, createdAt, createdAt);
      allUsers.push({ id: userId, device, browser, createdAt });
      cumulativeUsers++;
    }
    
    // Calculate DAU (subset of total users who are active)
    // "Struggling product" - very low DAU, only 3-7% of users are active
    const dauTarget = Math.min(
      Math.round(cumulativeUsers * (0.03 + Math.random() * 0.04)),  // 只有3-7%活跃 (更低！)
      CONFIG.targetDAU + Math.floor(Math.random() * 15)
    );
    const activeUsersToday = Math.max(newUsersToday, Math.min(dauTarget, cumulativeUsers));
    
    // Simulate sessions and behavior for active users
    // "Struggling product" - 极低参与度
    const returningUsers = Math.max(0, Math.round((activeUsersToday - newUsersToday) * 0.2)); // 只有20%回访
    const totalSessions = Math.round(activeUsersToday * (1.05 + Math.random() * 0.2)); // 极低session倍数
    const totalPageViews = Math.round(totalSessions * (1.2 + Math.random() * 0.4)); // 极低页面浏览
    const avgDuration = Math.round(30 + Math.random() * 45); // 超短会话时长 30-75秒
    const bounceRate = 0.45 + Math.random() * 0.25; // 超高跳出率 45-70%
    
    // Generate sample sessions for active users
    // IMPORTANT: Use RANDOM users each day to create realistic WAU/MAU spread
    // Shuffle and pick random users to simulate different people being active different days
    const shuffledUsers = [...allUsers].sort(() => Math.random() - 0.5);
    const activeUserIds = shuffledUsers
      .slice(0, Math.min(activeUsersToday, shuffledUsers.length))
      .map(u => u.id);
    
    // Generate at least one session per active user, plus some extra sessions
    const sessionsToGenerate = Math.min(totalSessions, activeUsersToday + Math.floor(activeUsersToday * 0.5));
    
    // First, ensure every active user has at least one session
    for (let i = 0; i < Math.min(activeUserIds.length, activeUsersToday); i++) {
      const userId = activeUserIds[i];
      const sessionId = `as_${dateStr.replace(/-/g, '')}_${String(i).padStart(4, '0')}`;
      const hour = 8 + Math.floor(Math.random() * 15);
      const minute = Math.floor(Math.random() * 60);
      const sessionStart = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
      const duration = Math.round(30 + Math.random() * 600); // 30s to 10min
      const pageViews = 1 + Math.floor(Math.random() * 5);
      
      sessionInsert.run(
        sessionId, userId, sessionStart, sessionStart, duration, pageViews,
        getRandomDevice(), getRandomBrowser(), sessionStart
      );
      
      // Generate behavior data
      behaviorInsert.run(
        userId, sessionId, sessionStart,
        Math.round(50 + Math.random() * 200), // mouse movements
        Math.round(5 + Math.random() * 30),   // scrolls
        Math.round(3 + Math.random() * 15),   // clicks
        Math.round(10 + Math.random() * 100), // typing events
        Math.round(30 + Math.random() * 60)   // engagement score
      );
    }
    
    // Add extra random sessions for returning users
    const extraSessions = sessionsToGenerate - activeUserIds.length;
    for (let s = 0; s < Math.max(0, extraSessions); s++) {
      const userId = activeUserIds[Math.floor(Math.random() * activeUserIds.length)];
      const sessionId = `as_${dateStr.replace(/-/g, '')}_x${String(s).padStart(4, '0')}`; // 'x' prefix to avoid ID collision
      const hour = 8 + Math.floor(Math.random() * 15);
      const minute = Math.floor(Math.random() * 60);
      const sessionStart = `${dateStr}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`;
      const duration = Math.round(30 + Math.random() * 600); // 30s to 10min
      const pageViews = 1 + Math.floor(Math.random() * 5);
      
      sessionInsert.run(
        sessionId, userId, sessionStart, sessionStart, duration, pageViews,
        getRandomDevice(), getRandomBrowser(), sessionStart
      );
      
      // Generate behavior data
      behaviorInsert.run(
        userId, sessionId, sessionStart,
        Math.round(50 + Math.random() * 200), // mouse movements
        Math.round(5 + Math.random() * 30),   // scrolls
        Math.round(3 + Math.random() * 15),   // clicks
        Math.round(10 + Math.random() * 100), // typing events
        Math.round(30 + Math.random() * 60)   // engagement score
      );
    }
    
    // Insert daily aggregate
    dailyInsert.run(
      dateStr,
      activeUsersToday,
      newUsersToday,
      returningUsers,
      totalSessions,
      totalPageViews,
      avgDuration,
      bounceRate,
      cumulativeUsers
    );
    
    if (day % 10 === 0) {
      console.log(`   Day ${day}: ${cumulativeUsers} total users, ${activeUsersToday} DAU`);
    }
  }
  
  console.log(`[migration 002] ✅ Generated ${cumulativeUsers} users over ${totalDays} days`);
  console.log(`[migration 002] ✅ Final stats: ${cumulativeUsers} total users`);
}

export function down() {
  console.log('[migration 002] Dropping analytics tables...');
  
  db.exec(`
    DROP TABLE IF EXISTS analytics_behavior;
    DROP TABLE IF EXISTS analytics_sessions;
    DROP TABLE IF EXISTS analytics_daily;
    DROP TABLE IF EXISTS analytics_users;
  `);
  
  console.log('[migration 002] ✅ Analytics tables dropped');
}

/**
 * Force regenerate - drops existing tables and recreates with fresh data
 */
export function forceRegenerate() {
  console.log('[migration 002] Force regenerating analytics data...');
  down();
  
  // Need to re-create tables since down() drops them
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics_users (
      id TEXT PRIMARY KEY,
      source TEXT DEFAULT 'organic',
      timezone TEXT DEFAULT 'America/New_York',
      country TEXT DEFAULT 'US',
      device_type TEXT DEFAULT 'desktop',
      browser TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL,
      last_active_at TEXT,
      metadata TEXT DEFAULT '{}'
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_users_created ON analytics_users(created_at);
    CREATE INDEX IF NOT EXISTS idx_analytics_users_timezone ON analytics_users(timezone);
    
    CREATE TABLE IF NOT EXISTS analytics_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_start TEXT NOT NULL,
      session_end TEXT,
      duration_seconds INTEGER DEFAULT 0,
      page_views INTEGER DEFAULT 1,
      device_type TEXT,
      browser TEXT,
      referrer TEXT,
      created_at TEXT NOT NULL,
      CONSTRAINT fk_session_user FOREIGN KEY (user_id) REFERENCES analytics_users(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start ON analytics_sessions(session_start);
    
    CREATE TABLE IF NOT EXISTS analytics_behavior (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT,
      recorded_at TEXT NOT NULL,
      mouse_movements INTEGER DEFAULT 0,
      scrolls INTEGER DEFAULT 0,
      clicks INTEGER DEFAULT 0,
      typing_events INTEGER DEFAULT 0,
      hover_time_ms INTEGER DEFAULT 0,
      bounce_probability REAL DEFAULT 0.15,
      return_frequency_days REAL DEFAULT 3.5,
      engagement_score REAL DEFAULT 50.0,
      CONSTRAINT fk_behavior_user FOREIGN KEY (user_id) REFERENCES analytics_users(id),
      CONSTRAINT fk_behavior_session FOREIGN KEY (session_id) REFERENCES analytics_sessions(id)
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_behavior_user ON analytics_behavior(user_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_behavior_recorded ON analytics_behavior(recorded_at);
    
    CREATE TABLE IF NOT EXISTS analytics_daily (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT UNIQUE NOT NULL,
      unique_users INTEGER DEFAULT 0,
      new_users INTEGER DEFAULT 0,
      returning_users INTEGER DEFAULT 0,
      total_sessions INTEGER DEFAULT 0,
      total_page_views INTEGER DEFAULT 0,
      avg_session_duration INTEGER DEFAULT 0,
      bounce_rate REAL DEFAULT 0.15,
      cumulative_users INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    
    CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily(date);
  `);
  
  generateHistoricalData();
  console.log('[migration 002] ✅ Force regeneration complete');
}

// Run migration if executed directly
if (process.argv[1] === import.meta.url.substring(7)) {
  console.log('Running migration 002_analytics...');
  up();
}
