import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const migrations = [
  'migrations/000_init.js',
  'migrations/001_subscriptions.js',
  'migrations/002_analytics.js',
  'migrations/002_checkout_sessions.js',
  'migrations/003_stripe_events.js'
];

console.log('[QuizAll] Starting database migrations...');

// Ensure SQLITE_PATH is consistent
const env = { 
  ...process.env, 
  SQLITE_PATH: process.env.SQLITE_PATH || './data/app.db' 
};

console.log(`[QuizAll] Using database path: ${env.SQLITE_PATH}`);

for (const migration of migrations) {
  try {
    console.log(`[QuizAll] Running ${migration}...`);
    // 002 and 003 are CLI tools that require 'up' command
    const args = (migration.includes('002') || migration.includes('003')) ? ' up' : '';
    
    execSync(`node ${migration}${args}`, { 
      cwd: rootDir, 
      stdio: 'inherit',
      env: env
    });
  } catch (error) {
    console.error(`[QuizAll] ❌ Failed to run ${migration}`);
    // Don't fail hard, just log. Some migrations might fail if already applied in a non-idempotent way (though they should be idempotent)
    // But for "no such table" errors, we really need them to succeed.
    // Given the user's error, failing hard is probably better to prevent app from starting in broken state.
    console.error(error);
    process.exit(1);
  }
}

console.log('[QuizAll] ✅ All migrations completed successfully.');
