(function () {
  "use strict";

  function formatApiError(err, apiBase) {
    if (!err) return "Something went wrong.";
    const msg = String(err.message || "");
    if (err.code === "NETWORK_ERROR" || /failed to fetch|无法连接/i.test(msg)) {
      return "Can't reach the server. Check your connection and try again.";
    }
    if (err.code === "SERVICE_UNAVAILABLE") {
      return "The service is temporarily unavailable. Please try again in a moment.";
    }
    if (err.code === "TOKEN_EXHAUSTED") {
      return "You've used today's quiz allowance. View plans to upgrade, or try again after midnight.";
    }
    if (/rate limit|too many/i.test(msg)) {
      return "Too many requests — wait a moment, then try again.";
    }
    if (/timeout|timed out/i.test(msg)) {
      return "The request timed out. Try again.";
    }
    return msg || "Something went wrong.";
  }

  function composerErrorHtml(message, retryLabel) {
    return (
      `<span class="composer-error-text">${message}</span>` +
      (retryLabel ? ` <button type="button" class="hint-link composer-retry-link">${retryLabel}</button>` : "")
    );
  }

  window.QuizAllCreateErrors = { formatApiError, composerErrorHtml };
})();
