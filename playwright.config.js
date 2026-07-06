// @ts-check
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180000,
  expect: { timeout: 60000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "python3 -m http.server 4173",
    cwd: "frontend",
    url: "http://127.0.0.1:4173/index.html",
    reuseExistingServer: true,
    timeout: 30000,
  },
});
