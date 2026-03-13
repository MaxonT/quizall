(function () {
  let API_BASE =
    (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) ||
    (window.location && window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost:8080");

  // Failsafe: 在 Render 前端域名下，绝不应向同源请求 /api（会拿到 404.html 的 HTML）
  if (typeof window !== "undefined" && window.location && window.location.hostname.includes(".onrender.com") && API_BASE === window.location.origin) {
    API_BASE = "https://quizall-backend-0qr4.onrender.com";
    console.warn("[authGuard] API_BASE was pointing to frontend, overridden to backend");
  }

  const TOKEN_KEY = "quizall.token";
  const LOGIN_REQUIRED_MESSAGE = "Please log in first";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent("authStateChanged"));
  }

  function showLoginRequired() {
    if (typeof window.showToast === "function") {
      window.showToast(LOGIN_REQUIRED_MESSAGE, "error");
      return;
    }

    const id = "quizall-login-toast";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.top = "20px";
      el.style.transform = "translateX(-50%)";
      el.style.zIndex = "9999";
      el.style.padding = "10px 14px";
      el.style.borderRadius = "10px";
      el.style.border = "1px solid rgba(239, 68, 68, 0.35)";
      el.style.background = "rgba(15, 23, 42, 0.92)";
      el.style.color = "#fff";
      el.style.font = "600 13px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      el.style.boxShadow = "0 10px 30px rgba(0, 0, 0, 0.25)";
      el.style.maxWidth = "90vw";
      el.style.textAlign = "center";
      el.style.opacity = "0";
      el.style.transition = "opacity 180ms ease";
      document.body.appendChild(el);
    }

    el.textContent = LOGIN_REQUIRED_MESSAGE;
    requestAnimationFrame(() => {
      el.style.opacity = "1";
    });
    setTimeout(() => {
      el.style.opacity = "0";
    }, 1800);
  }

  function requireLogin(options = {}) {
    const token = getToken();
    if (token) return true;

    showLoginRequired();
    if (options.redirectTo) {
      setTimeout(() => {
        window.location.href = options.redirectTo;
      }, 350);
    }
    return false;
  }

  async function fetchWithAuth(url, options = {}) {
    const token = getToken();
    if (!token) {
      showLoginRequired();
      const err = new Error(LOGIN_REQUIRED_MESSAGE);
      err.code = "LOGIN_REQUIRED";
      throw err;
    }

    const headers = new Headers(options.headers || {});
    headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(url, { ...options, headers });
    if (res.status === 401) {
      clearToken();
      showLoginRequired();
    }
    return res;
  }

  async function syncTimezone() {
    const token = getToken();
    if (!token) return;

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz || typeof tz !== "string") return;

    const lastAttemptAt = Number(localStorage.getItem("quizall.tz.sync_at") || "0");
    if (Number.isFinite(lastAttemptAt) && Date.now() - lastAttemptAt < 12 * 60 * 60 * 1000) {
      return;
    }
    localStorage.setItem("quizall.tz.sync_at", String(Date.now()));

    try {
      const res = await fetchWithAuth(`${API_BASE}/api/auth/timezone`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: tz })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.timezone) {
        localStorage.setItem("quizall.timezone", data.timezone);
      }
    } catch {
    }
  }

  window.authGuard = {
    API_BASE,
    TOKEN_KEY,
    LOGIN_REQUIRED_MESSAGE,
    getToken,
    clearToken,
    showLoginRequired,
    requireLogin,
    fetchWithAuth,
    syncTimezone
  };

  window.addEventListener("authStateChanged", () => {
    syncTimezone();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === TOKEN_KEY) syncTimezone();
  });
  syncTimezone();
})();
