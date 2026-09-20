import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const USE_POSTGRES = !!(process.env.DATABASE_URL || process.env.DB_HOST);

const env = {
  ...process.env,
  SQLITE_PATH: process.env.SQLITE_PATH || './data/app.db'
};

function runMigration(migration, args = '') {
  try {
    const migrationPath = path.join(rootDir, migration);
    console.log(`[QuizAll] Running ${migration}...`);
    execSync(`node "${migrationPath}"${args}`, {
      cwd: rootDir,
      stdio: 'inherit',
      env,
    });
  } catch (error) {
    // Log error but don't kill the server — individual migration failures
    // are often non-critical (e.g. adding columns that already exist)
    console.error(`[QuizAll] ⚠️  Migration ${migration} had an error (non-fatal):`, error.message || error);
  }
}

console.log('[QuizAll] Starting database migrations...');
console.log(`[QuizAll] Database mode: ${USE_POSTGRES ? 'PostgreSQL' : 'SQLite'}`);

if (USE_POSTGRES) {
  // PostgreSQL: db-pg.js initializeSchema() (called via 000_init.js → db.js) creates
  // ALL tables including quiz tables. Other migrations use better-sqlite3 directly
  // and are not needed in PostgreSQL mode.
  runMigration('migrations/000_init.js');
  // 002_analytics creates analytics tables (already done by initializeSchema) but
  // run it anyway to stay idempotent
  runMigration('migrations/002_analytics.js', ' up');
  // 006_annual_coupon seeds the annual coupon code for PostgreSQL
  runMigration('migrations/006_annual_coupon.js');
  runMigration('migrations/007_tester_coupon.js');
} else {
  // SQLite: run all migrations
  runMigration('migrations/000_init.js');
  runMigration('migrations/001_subscriptions.js');
  runMigration('migrations/002_analytics.js', ' up');
  runMigration('migrations/002_checkout_sessions.js', ' up');
  runMigration('migrations/003_stripe_events.js', ' up');
  runMigration('migrations/005_coupons.js', ' up');
  runMigration('migrations/006_annual_coupon.js');
  runMigration('migrations/007_tester_coupon.js');
}

console.log('[QuizAll] ✅ Migrations complete.');
