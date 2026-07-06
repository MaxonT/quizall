// @ts-check
import { test, expect } from "@playwright/test";
import { installMockApi } from "./mock-api.js";

async function completeRound(page) {
  const card = page.locator(".quiz-card").last();
  await expect(card).toBeVisible({ timeout: 60000 });

  await card.evaluate((el) => {
    el.querySelectorAll(".quiz-question").forEach((qEl) => {
      const options = qEl.querySelectorAll(".option-btn");
      if (options.length) {
        const selected = qEl.querySelector(".option-btn.selected");
        (selected || options[0]).click();
        return;
      }
      const fill = qEl.querySelector(".fill-input");
      if (fill) {
        fill.value = "chlorophyll";
        fill.dispatchEvent(new Event("input", { bubbles: true }));
        return;
      }
      const free = qEl.querySelector(".free-input");
      if (free) {
        free.value =
          "Plants use sunlight water and carbon dioxide to make sugar and release oxygen";
        free.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
  });

  await card.locator(".btn-round").click({ force: true });
  await expect(page.locator(".review-score").last()).toBeVisible({ timeout: 30000 });
}

test.beforeEach(async ({ page }) => {
  await installMockApi(page);
});

test("study chat mock flow: login → plan → 3 rounds → note → history → requiz → settings", async ({ page }) => {
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

  for (let round = 0; round < 3; round++) {
    await completeRound(page);
    const reviewMsg = page.locator(".msg.ai").filter({ has: page.locator(".review-score") }).last();
    await reviewMsg.locator(".btn-round").click({ force: true });
    if (round < 2) {
      await expect(page.locator(".quiz-card").last()).toBeVisible({ timeout: 60000 });
    }
  }

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
