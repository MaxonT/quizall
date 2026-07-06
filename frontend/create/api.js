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

    const credits = status.credits;
    if (credits && typeof credits.balance === "number") {
      if (credits.balance <= 0) {
        return {
          ok: false,
          soft: false,
          message: "No credits left. Upgrade your plan or wait for daily refresh.",
        };
      }
      if (credits.balance < 5) {
        return {
          ok: false,
          soft: true,
          message: `Low credits (${credits.balance} remaining). Consider upgrading for more study sessions.`,
        };
      }
      return { ok: true };
    }

    const tokens = status.tokens?.total ?? 0;
    if (tokens <= 0) {
      return {
        ok: false,
        soft: false,
        message: "No credits left today. Upgrade your plan or wait until tomorrow.",
      };
    }
    return { ok: true };
  }

  function invalidateUsageCache() {
    usageCache = { at: 0, data: null };
  }

  async function fetchCreditHistory(apiFn, limit = 15) {
    try {
      const data = await apiFn(`/api/billing/credit-history?limit=${limit}`);
      return data.items || [];
    } catch {
      return [];
    }
  }

  window.QuizAllCreateApi = {
    checkQuizUsage,
    invalidateUsageCache,
    fetchBillingUsage,
    fetchCreditHistory,
  };
})();
