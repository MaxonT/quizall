// @ts-check
import { test, expect } from "@playwright/test";
import { installMockApi } from "./mock-api.js";

async function registerAndOpenCreate(page) {
  const email = `e2e-${Date.now()}@example.com`;
  await page.goto("/index.html");
  await page.click("#toggleToRegister");
  await page.fill('input[name="registerEmail"]', email);
  await page.fill('input[name="registerPassword"]', "testpassword123");
  await page.click("#registerForm button[type=submit]");
  await expect(page.locator("#composerInput")).toBeVisible({ timeout: 15000 });
}

async function completeTestingRound(page) {
  const card = page.locator(".quiz-card").last();
  await expect(card).toBeVisible({ timeout: 60000 });

  const questions = card.locator(".quiz-question");
  const count = await questions.count();
  for (let i = 0; i < count; i++) {
    const q = questions.nth(i);
    const option = q.locator(".option-btn").first();
    if (await option.count()) {
      await option.click();
      continue;
    }
    const fill = q.locator(".fill-input");
    if (await fill.count()) {
      await fill.fill("chlorophyll");
      continue;
    }
    const free = q.locator(".free-input");
    if (await free.count()) {
      await free.fill(
        "Plants use sunlight water and carbon dioxide to make sugar and release oxygen"
      );
    }
  }

  await card.locator(".btn-round").click({ force: true });
  await expect(page.locator(".review-score").last()).toBeVisible({ timeout: 60000 });
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("training mode: plan → training loop artifact with MCQ", async ({ page }) => {
  await registerAndOpenCreate(page);
  await page.evaluate(() => localStorage.setItem("quizall.quizMode", "training"));
  await page.reload();
  await expect(page.locator("#composerInput")).toBeVisible();

  await page.click("#sampleLink");
  await page.click("#sendBtn");
  await expect(page.locator("text=Your study plan")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#training-loop")).toBeVisible({ timeout: 60000 });
  await expect(page.locator("#trainingLoopActive .option-btn").first()).toBeVisible();
});

test("training mode: 10 answers persist in history after reload", async ({ page }) => {
  await registerAndOpenCreate(page);
  await page.evaluate(() => localStorage.setItem("quizall.quizMode", "training"));
  await page.reload();
  await page.click("#sampleLink");
  await page.click("#sendBtn");
  await expect(page.locator("#training-loop")).toBeVisible({ timeout: 60000 });

  for (let i = 0; i < 10; i++) {
    const active = page.locator("#trainingLoopActive .option-btn").first();
    await expect(active).toBeVisible({ timeout: 30000 });
    await active.click();
    await page.waitForTimeout(1000);
  }

  await expect(page.locator("#trainingLoopHistory details")).toHaveCount(10, { timeout: 15000 });

  await page.waitForResponse(
    (res) => res.url().includes("/transcript") && res.request().method() === "PUT",
    { timeout: 10000 }
  ).catch(() => {});

  await page.reload();
  await expect(page.locator("#composerInput")).toBeVisible({ timeout: 15000 });
  await page.locator(".project-session").first().click();
  await expect(page.locator("#training-loop")).toBeVisible({ timeout: 30000 });
  await expect(page.locator("#trainingLoopHistory details")).toHaveCount(10, { timeout: 15000 });
});

test("session resume: short prompt continues without blocking composer", async ({ page }) => {
  await registerAndOpenCreate(page);
  await page.click("#sampleLink");
  await page.click("#sendBtn");
  await expect(page.locator("text=Your study plan")).toBeVisible({ timeout: 60000 });
  await completeTestingRound(page);
  const reviewMsg = page.locator(".msg.ai").filter({ has: page.locator(".review-score") }).last();
  await reviewMsg.locator(".btn-round").click({ force: true });
  await expect(page.locator("text=Your study note")).toBeVisible({ timeout: 90000 });

  await page.locator(".project-session").first().click();
  await expect(page.locator("text=Your study plan")).toBeVisible();
  await expect(page.locator("#composerInput")).not.toBeDisabled();

  await page.evaluate(() => localStorage.setItem("quizall.quizMode", "testing"));
  await page.fill("#composerInput", "quiz me");
  await page.click("#sendBtn");
  await expect(page.getByText(/Got it|Quiz me again|training mode/i).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("#composerInput")).not.toBeDisabled();
});

test("composer stays enabled after new session from banner", async ({ page }) => {
  await registerAndOpenCreate(page);
  await page.click("#sampleLink");
  await page.click("#sendBtn");
  await expect(page.locator("text=Your study plan")).toBeVisible({ timeout: 60000 });
  await page.locator(".project-session").first().click();
  await expect(page.locator("#viewOnlyBanner")).toBeVisible();
  await page.click("#viewOnlyNewSession");
  await expect(page.locator("#composerInput")).toBeVisible();
  await expect(page.locator("#composerInput")).not.toBeDisabled();
  await page.click("#sendBtn");
  await expect(page.locator("#composerInput")).not.toBeDisabled();
});
