import "../src/lib/env.js";
const base = process.env.SELFTEST_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
try {
  const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) });
  const body = await response.json();
  if (!response.ok || body.ok !== true) throw new Error(`HTTP ${response.status}`);
  console.log("Backend health check passed.");
} catch (error) {
  console.error(`Backend health check failed: ${error.message}`);
  process.exitCode = 1;
}
