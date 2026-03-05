#!/usr/bin/env node

/**
 * QuizAll Backend Self-Test Script
 * 
 * Checks:
 * 1. Required environment variables are present
 * 2. Backend /api/health endpoint is reachable and healthy
 * 
 * Usage:
 *   node scripts/selftest.js
 *   SELFTEST_BASE_URL=http://localhost:3000 node scripts/selftest.js
 * 
 * Exit codes:
 *   0 - All checks passed
 *   1 - One or more checks failed
 */

// Configuration
const BASE_URL = process.env.SELFTEST_BASE_URL || "http://localhost:3000";

const REQUIRED_ENVS = [
  "NODE_ENV",
  "OPENAI_API_KEY",
  "JWT_SECRET"
];

/**
 * Check required environment variables
 * @returns {boolean} true if all required vars are present
 */
async function runEnvCheck() {
  console.log("[1/2] Env variables");
  
  const missing = [];
  
  for (const envName of REQUIRED_ENVS) {
    const value = process.env[envName];
    if (!value || value.trim() === '') {
      missing.push(envName);
    }
  }
  
  if (missing.length === 0) {
    console.log(`✅ Env check passed (${REQUIRED_ENVS.length}/${REQUIRED_ENVS.length})`);
    return true;
  } else {
    console.log(`❌ Env check failed – missing: ${missing.join(', ')}`);
    return false;
  }
}

/**
 * Check /api/health endpoint
 * @returns {boolean} true if health check passes
 */
async function runHealthCheck() {
  console.log("\n[2/2] /api/health");
  
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    
    if (response.status !== 200) {
      console.log(`❌ Health check failed (status ${response.status})`);
      return false;
    }
    
    const body = await response.json();
    
    // Check if response indicates healthy status
    if (body.status === "healthy" || body.ok === true) {
      console.log("✅ Health check passed");
      return true;
    } else {
      console.log(`❌ Health check failed (unexpected response: ${JSON.stringify(body)})`);
      return false;
    }
    
  } catch (error) {
    console.log(`❌ Health check failed (${error.message})`);
    return false;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log(`Running QuizAll self-test against ${BASE_URL}\n`);
  
  let allOk = true;
  
  const envOk = await runEnvCheck();
  if (!envOk) allOk = false;
  
  const healthOk = await runHealthCheck();
  if (!healthOk) allOk = false;
  
  if (allOk) {
    console.log("\n✅ All checks passed");
    process.exit(0);
  } else {
    console.log("\n❌ Self-test failed");
    process.exit(1);
  }
}

// Run the self-test
main().catch((err) => {
  console.error("Unexpected error in self-test:", err);
  process.exit(1);
});
