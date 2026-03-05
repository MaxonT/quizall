#!/usr/bin/env node

/**
 * Run Analytics Migration
 * 
 * Creates analytics tables and generates historical data
 * using S-curve algorithm for the period 2024-11-29 to 2025-01-30
 * 
 * Usage:
 *   node run-analytics-migration.js        # Run migration (skip if data exists)
 *   node run-analytics-migration.js --force # Force regenerate data
 *   node run-analytics-migration.js down    # Rollback (drop tables)
 */

import { up, down, forceRegenerate } from './002_analytics.js';

const command = process.argv[2];
const force = process.argv.includes('--force');

console.log('════════════════════════════════════════════════════════════');
console.log('📊 QuizAll Analytics Migration Runner');
console.log('════════════════════════════════════════════════════════════');

if (command === 'down' || command === 'rollback') {
  console.log('⬇️  Running rollback...');
  down();
} else if (force) {
  console.log('⬆️  Running migration with FORCE REGENERATE...');
  forceRegenerate();
} else {
  console.log('⬆️  Running migration...');
  up();
}

console.log('════════════════════════════════════════════════════════════');
console.log('🏁 Migration complete');
