/**
 * Analytics Dashboard Migration - 002
 * PostgreSQL + SQLite compatible
 *
 * PostgreSQL: Creates tables only (no fake data — shows real data from day one)
 * SQLite (local dev): Creates tables + generates S-curve demo data
 */

import { db } from '../src/lib/db.js';

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

// ─── Unified DB helpers ────────────────────────────────────────────────────

async function dbExec(sql) {
  if (USE_POSTGRES) return await db.exec(sql);
  db.exec(sql);
}

async function dbGet(sql, params = []) {
  if (USE_POSTGRES) return await db.get(sql, ...params);
  return db.prepare(sql).get(...params);
}

async function dbRun(sql, params = []) {
  if (USE_POSTGRES) return await db.run(sql, ...params);
  db.prepare(sql).run(...params);
}

async function ensurePgColumn(table, column, definition) {
  if (!USE_POSTGRES) return;
  await dbExec(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${definition};`);
}

async function ensurePgSchemaCompatibility() {
  if (!USE_POSTGRES) return;
  // Backfill legacy PostgreSQL schemas where tables exist but columns are missing.
  await ensurePgColumn('analytics_users', 'email', 'TEXT');
  await ensurePgColumn('analytics_users', 'source', "TEXT DEFAULT 'organic'");
  await ensurePgColumn('analytics_users', 'timezone', "TEXT DEFAULT 'America/New_York'");
  await ensurePgColumn('analytics_users', 'country', "TEXT DEFAULT 'US'");
  await ensurePgColumn('analytics_users', 'device_type', "TEXT DEFAULT 'desktop'");
  await ensurePgColumn('analytics_users', 'browser', 'TEXT');
  await ensurePgColumn('analytics_users', 'is_active', 'INTEGER DEFAULT 1');
  await ensurePgColumn('analytics_users', 'last_active_at', 'TEXT');
  await ensurePgColumn('analytics_users', 'metadata', "TEXT DEFAULT '{}'");

  await ensurePgColumn('analytics_sessions', 'session_end', 'TEXT');
  await ensurePgColumn('analytics_sessions', 'duration_seconds', 'INTEGER DEFAULT 0');
  await ensurePgColumn('analytics_sessions', 'page_views', 'INTEGER DEFAULT 1');
  await ensurePgColumn('analytics_sessions', 'device_type', 'TEXT');
  await ensurePgColumn('analytics_sessions', 'browser', 'TEXT');
  await ensurePgColumn('analytics_sessions', 'referrer', 'TEXT');

  await ensurePgColumn('analytics_behavior', 'hover_time_ms', 'INTEGER DEFAULT 0');
  await ensurePgColumn('analytics_behavior', 'bounce_probability', 'REAL DEFAULT 0.15');
  await ensurePgColumn('analytics_behavior', 'return_frequency_days', 'REAL DEFAULT 3.5');
  await ensurePgColumn('analytics_behavior', 'engagement_score', 'REAL DEFAULT 50.0');

  await ensurePgColumn('analytics_daily', 'created_at', 'TEXT');
}

async function tableExists(name) {
  if (USE_POSTGRES) {
    const r = await dbGet(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?`,
      [name]
    );
    return !!r;
  }
  const r = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  return !!r;
}

// ─── Table DDL ─────────────────────────────────────────────────────────────

// PostgreSQL-compatible DDL (SERIAL instead of AUTOINCREMENT, NOW() instead of datetime('now'))
const PG_TABLES = `
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
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_user ON analytics_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_sessions_start ON analytics_sessions(session_start);

CREATE TABLE IF NOT EXISTS analytics_behavior (
  id SERIAL PRIMARY KEY,
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
  engagement_score REAL DEFAULT 50.0
);
CREATE INDEX IF NOT EXISTS idx_analytics_behavior_user ON analytics_behavior(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_behavior_recorded ON analytics_behavior(recorded_at);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id SERIAL PRIMARY KEY,
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
`;

// SQLite-compatible DDL (AUTOINCREMENT, datetime('now'))
const SQLITE_TABLES = `
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
`;

// ─── Main migration ────────────────────────────────────────────────────────

export async function up() {
  try {
    console.log('[migration 002] Creating analytics tables...');

    // Skip if already populated
    const exists = await tableExists('analytics_users');
    if (exists) {
      const row = await dbGet('SELECT COUNT(*) as count FROM analytics_users');
      const count = Number(row?.count ?? 0);
      if (count > 0) {
        console.log(`[migration 002] ⚠️  Analytics tables already exist with ${count} users — skipping`);
        return;
      }
    }

    await dbExec(USE_POSTGRES ? PG_TABLES : SQLITE_TABLES);
    await ensurePgSchemaCompatibility();
    if (USE_POSTGRES) {
      // Build after compatibility patch so legacy schemas missing email won't fail.
      await dbExec(`CREATE INDEX IF NOT EXISTS idx_analytics_users_email ON analytics_users(email);`);
    }
    console.log('[migration 002] ✅ Analytics tables created');

    if (USE_POSTGRES) {
      // Production: start with real data, no fake seeding
      console.log('[migration 002] PostgreSQL mode — skipping demo data (will show real user data)');
    } else {
      // Local dev: seed demo S-curve data
      await generateHistoricalData();
    }

    console.log('[migration 002] ✅ Migration complete');
  } catch (err) {
    console.error('[migration 002] Error:', err.message);
    throw err;
  }
}

export async function down() {
  console.log('[migration 002] Dropping analytics tables...');
  await dbExec(`
    DROP TABLE IF EXISTS analytics_behavior;
    DROP TABLE IF EXISTS analytics_sessions;
    DROP TABLE IF EXISTS analytics_daily;
    DROP TABLE IF EXISTS analytics_users;
  `);
  console.log('[migration 002] ✅ Analytics tables dropped');
}

// ─── Demo data (SQLite / local dev only) ──────────────────────────────────

async function generateHistoricalData() {
  const todayDate = new Date();
  const launchDate = new Date(todayDate);
  launchDate.setDate(launchDate.getDate() - 63);

  const CONFIG = {
    projectStartDate: launchDate.toISOString().split('T')[0],
    dataEndDate: todayDate.toISOString().split('T')[0],
    targetUsers: 1850,
    targetDAU: 80,
    sGrowthK: 0.06,
    sGrowthX0: 45,
  };

  console.log('[migration 002] Generating S-curve historical data...');
  console.log(`   Period: ${CONFIG.projectStartDate} to ${CONFIG.dataEndDate}`);

  const timezones = [
    { tz: 'America/New_York', weight: 18 },
    { tz: 'America/Los_Angeles', weight: 15 },
    { tz: 'America/Chicago', weight: 10 },
    { tz: 'Europe/London', weight: 12 },
    { tz: 'Europe/Paris', weight: 8 },
    { tz: 'Asia/Shanghai', weight: 8 },
    { tz: 'Asia/Tokyo', weight: 6 },
    { tz: 'Asia/Singapore', weight: 5 },
    { tz: 'Australia/Sydney', weight: 4 },
  ];
  const totalWeight = timezones.reduce((a, b) => a + b.weight, 0);

  function sCurve(day) {
    return Math.round(CONFIG.targetUsers / (1 + Math.exp(-CONFIG.sGrowthK * (day - CONFIG.sGrowthX0))));
  }
  function randTz() {
    let r = Math.random() * totalWeight;
    for (const tz of timezones) { r -= tz.weight; if (r <= 0) return tz.tz; }
    return timezones[0].tz;
  }
  function randDevice() { const r = Math.random(); return r < 0.65 ? 'desktop' : r < 0.9 ? 'mobile' : 'tablet'; }
  function randBrowser() { const r = Math.random(); return r < 0.45 ? 'Chrome' : r < 0.65 ? 'Safari' : r < 0.8 ? 'Firefox' : 'Edge'; }
  function randSource() { const r = Math.random(); return r < 0.4 ? 'organic' : r < 0.6 ? 'direct' : r < 0.75 ? 'social' : 'referral'; }
  const tzCountry = { 'America/New_York': 'US', 'America/Los_Angeles': 'US', 'America/Chicago': 'US', 'Europe/London': 'GB', 'Europe/Paris': 'FR', 'Asia/Shanghai': 'CN', 'Asia/Tokyo': 'JP', 'Asia/Singapore': 'SG', 'Australia/Sydney': 'AU' };

  const startDate = new Date(CONFIG.projectStartDate);
  const endDate = new Date(CONFIG.dataEndDate);
  const totalDays = Math.ceil((endDate - startDate) / 86400000);

  let cumulativeUsers = 0;
  const allUsers = [];

  for (let day = 0; day <= totalDays; day++) {
    const currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];

    const targetCumulative = sCurve(day);
    const newUsersToday = Math.max(0, targetCumulative - cumulativeUsers);

    for (let i = 0; i < newUsersToday; i++) {
      const userId = `au_${dateStr.replace(/-/g, '')}_${String(i).padStart(4, '0')}`;
      const tz = randTz();
      const hour = 9 + Math.floor(Math.random() * 14);
      const min = Math.floor(Math.random() * 60);
      const createdAt = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;
      await dbRun(
        `INSERT INTO analytics_users (id, source, timezone, country, device_type, browser, created_at, last_active_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [userId, randSource(), tz, tzCountry[tz] || 'US', randDevice(), randBrowser(), createdAt, createdAt]
      );
      allUsers.push({ id: userId });
      cumulativeUsers++;
    }

    const dauTarget = Math.min(Math.round(cumulativeUsers * (0.03 + Math.random() * 0.04)), CONFIG.targetDAU + Math.floor(Math.random() * 15));
    const activeUsersToday = Math.max(newUsersToday, Math.min(dauTarget, cumulativeUsers));
    const returningUsers = Math.max(0, Math.round((activeUsersToday - newUsersToday) * 0.2));
    const totalSessions = Math.round(activeUsersToday * (1.05 + Math.random() * 0.2));
    const totalPageViews = Math.round(totalSessions * (1.2 + Math.random() * 0.4));
    const avgDuration = Math.round(30 + Math.random() * 45);
    const bounceRate = 0.45 + Math.random() * 0.25;

    const shuffled = [...allUsers].sort(() => Math.random() - 0.5);
    const activeIds = shuffled.slice(0, Math.min(activeUsersToday, shuffled.length)).map(u => u.id);

    for (let i = 0; i < Math.min(activeIds.length, activeUsersToday); i++) {
      const sessionId = `as_${dateStr.replace(/-/g, '')}_${String(i).padStart(4, '0')}`;
      const hour = 8 + Math.floor(Math.random() * 15);
      const min = Math.floor(Math.random() * 60);
      const sessionStart = `${dateStr}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00.000Z`;
      const duration = Math.round(30 + Math.random() * 600);
      await dbRun(
        `INSERT INTO analytics_sessions (id, user_id, session_start, session_end, duration_seconds, page_views, device_type, browser, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, activeIds[i], sessionStart, sessionStart, duration, 1 + Math.floor(Math.random() * 5), randDevice(), randBrowser(), sessionStart]
      );
      await dbRun(
        `INSERT INTO analytics_behavior (user_id, session_id, recorded_at, mouse_movements, scrolls, clicks, typing_events, engagement_score) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [activeIds[i], sessionId, sessionStart, Math.round(50 + Math.random() * 200), Math.round(5 + Math.random() * 30), Math.round(3 + Math.random() * 15), Math.round(10 + Math.random() * 100), Math.round(30 + Math.random() * 60)]
      );
    }

    await dbRun(
      `INSERT OR REPLACE INTO analytics_daily (date, unique_users, new_users, returning_users, total_sessions, total_page_views, avg_session_duration, bounce_rate, cumulative_users, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [dateStr, activeUsersToday, newUsersToday, returningUsers, totalSessions, totalPageViews, avgDuration, bounceRate, cumulativeUsers]
    );

    if (day % 10 === 0) {
      console.log(`   Day ${day}: ${cumulativeUsers} total users, ${activeUsersToday} DAU`);
    }
  }

  console.log(`[migration 002] ✅ Generated ${cumulativeUsers} users over ${totalDays} days`);
}

// ─── CLI entry point ───────────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('002_analytics.js');
if (isMain) {
  console.log('Running migration 002_analytics...');
  const cmd = process.argv[2];
  if (cmd === 'up') await up();
  else if (cmd === 'down') await down();
  else await up();
}
