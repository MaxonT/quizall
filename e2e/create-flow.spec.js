// @ts-check
import { test, expect } from "@playwright/test";
import { installMockApi } from "./mock-api.js";

async function completeRound(page) {
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
  await expect(page.locator(".review-score").last()).toBeVisible({ timeout: 30000 });
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("study chat mock flow: login → plan → mixed quiz → note → history → requiz → settings", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;
  const password = "testpassword123";

  await page.goto("/index.html");
  await page.click("#toggleToRegister");
  await page.fill('input[name="registerEmail"]', email);
  await page.fill('input[name="registerPassword"]', password);
  await page.click("#registerForm button[type=submit]");
  await expect(page.locator("#composerInput")).toBeVisible({ timeout: 15000 });

  await page.click("#sampleLink");
  await page.click("#sendBtn");

  await expect(page.locator("text=Your study plan")).toBeVisible({ timeout: 60000 });

  await completeRound(page);
  const reviewMsg = page.locator(".msg.ai").filter({ has: page.locator(".review-score") }).last();
  await reviewMsg.locator(".btn-round").click({ force: true });

  await expect(
    page.locator("text=Your study note").or(page.locator("text=Sorry, I couldn't write the note"))
  ).toBeVisible({ timeout: 90000 });
  await expect(page.locator("text=Your study note")).toBeVisible();
  await expect(page.locator(".science-link")).toBeVisible();

  await page.locator(".project-item").first().click();
  await expect(page.locator("text=Your study plan")).toBeVisible();
  await expect(page.locator(".history-toggle").first()).toBeVisible();
  await expect(page.locator("text=Your study note")).toBeVisible();

  await page.locator(".history-toggle").first().click();
  await expect(page.locator(".history-details .review-item").first()).toBeVisible();

  await page.locator(".requiz-btn").click();
  await expect(page.locator(".quiz-card").last()).toBeVisible({ timeout: 60000 });

  await page.click("#avatarBtn");
  await page.click("#menuSettings");
  await expect(page.locator(".settings-modal")).toBeVisible();

  const tabs = [
    { id: "account", title: "Account" },
    { id: "appearance", title: "Appearance" },
    { id: "billing", title: "Billing" },
    { id: "usage", title: "Usage" },
  ];

  for (const tab of tabs) {
    await page.click(`.settings-tab[data-tab="${tab.id}"]`);
    await expect(page.locator("#settingsTabTitle")).toHaveText(tab.title);
    await expect(page.locator("#settingsBody")).not.toContainText("Could not load");
  }
});
