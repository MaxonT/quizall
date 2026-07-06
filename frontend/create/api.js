(function () {
  "use strict";

  const USAGE_CACHE_MS = 60000;
  let usageCache = { at: 0, data: null };

  async function fetchBillingUsage(apiFn) {
    const now = Date.now();
    if (usageCache.data && now - usageCache.at < USAGE_CACHE_MS) {
      return usageCache.data;
    }
    try {
      const data = await apiFn("/api/billing/status");
      usageCache = { at: now, data };
      return data;
    } catch {
      return null;
    }
  }

  /**
   * @returns {Promise<{ ok: true } | { ok: false, soft: boolean, message: string }>}
   */
  async function checkQuizUsage(apiFn, { subscriptionsEnabled = true } = {}) {
    if (!subscriptionsEnabled) return { ok: true };

    const status = await fetchBillingUsage(apiFn);
    if (!status) return { ok: true };

    const tokens = status.tokens?.total ?? 0;
    const plan = status.subscription?.plan || status.plan || "free";
    const wizardUsed = status.usage?.questionWizard ?? 0;
    const wizardLimit = status.limits?.questionWizard?.daily ?? 5;

    if (tokens <= 0 && plan === "free") {
      return {
        ok: false,
        soft: false,
        message: "No quiz tokens left today. Upgrade your plan or wait until tomorrow.",
      };
    }

    if (tokens > 0 && tokens < 5000 && plan === "free") {
      return {
        ok: false,
        soft: true,
        message: `Low token balance (${status.tokens?.totalFormatted || tokens}). Consider upgrading for unlimited quizzes.`,
      };
    }

    if (wizardLimit > 0 && wizardUsed >= wizardLimit && plan === "free") {
      return {
        ok: false,
        soft: false,
        message: `Daily quiz limit reached (${wizardLimit}/day on Free). Upgrade for more.`,
      };
    }

    return { ok: true };
  }

  function invalidateUsageCache() {
    usageCache = { at: 0, data: null };
  }

  window.QuizAllCreateApi = { checkQuizUsage, invalidateUsageCache, fetchBillingUsage };
})();
