import "../src/lib/env.js";
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must contain at least 32 characters.");
  process.exitCode = 1;
}
await import("./healthcheck.js");
