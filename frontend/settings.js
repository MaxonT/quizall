let API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim())
  || (window.location && window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "http://localhost:8080");
// Failsafe: Render 前端域名下不应同源请求 /api
if (typeof window !== "undefined" && window.location?.hostname?.includes(".onrender.com") && API_BASE === window.location.origin) {
  API_BASE = "https://quizall-backend-0qr4.onrender.com";
}

(() => {
  const envSummaryEl = document.getElementById("envSummary");
  const modelListEl = document.getElementById("modelList");
  const featuresListEl = document.getElementById("featuresList");
  const scienceMindmapEl = document.getElementById("scienceMindmap");
  const rawSettingsEl = document.getElementById("rawSettings");
  const logEl = document.getElementById("settingsLog");
  const authStatusEl = document.getElementById("authStatus");
  const authMessageEl = document.getElementById("authMessage");
  const authFormsEl = document.getElementById("authForms");
  const loginForm = document.getElementById("loginForm");
  const registerForm = document.getElementById("registerForm");
  const logoutBtn = document.getElementById("logoutBtn");
  const accountManagementSection = document.getElementById("accountManagementSection");
  const manageAccountToggle = document.getElementById("manageAccountToggle");
  const toggleIcon = document.getElementById("toggleIcon");
  const accountDetailsPanel = document.getElementById("accountDetailsPanel");
  const manageSubscriptionBtn = document.getElementById("manageSubscriptionBtn");
  const TOKEN_KEY = "quizall.token";

  // Account management state

  function log(line) {
    const ts = new Date().toISOString().slice(11, 19);
    logEl.textContent += `[${ts}] ${line}\n`;
    logEl.scrollTop = logEl.scrollHeight;
  }

  function setAuthMessage(message = "", isError = false) {
    if (!authMessageEl) return;
    authMessageEl.textContent = message;
    authMessageEl.style.color = isError ? "#f87171" : "var(--accent, #0ea5e9)";
  }

  function getToken() {
    // Use unified authState if available, otherwise fallback to direct access
    if (window.authState && window.authState.getToken) {
      return window.authState.getToken();
    }
    return window.localStorage.getItem(TOKEN_KEY);
  }

  function saveToken(token) {
    // Use unified authState if available
    if (window.authState && window.authState.setToken) {
      window.authState.setToken(token);
      // Trigger user info fetch
      if (token) {
        window.authState.fetchUserInfo();
      }
    } else {
      if (!token) {
        window.localStorage.removeItem(TOKEN_KEY);
        return;
      }
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  }

  function updateAuthView(user) {
    if (!authStatusEl) return;
    if (user) {
      const tier = user.subscription?.tier || "free";
      const active = user.subscription?.isActive ? "active" : "inactive";
      authStatusEl.textContent = `Signed in as ${user.email} · Plan: ${tier} (${active})`;
      authFormsEl?.classList.add("hidden");
      logoutBtn?.classList.remove("hidden");
      accountManagementSection?.classList.remove("hidden");
    } else {
      authStatusEl.textContent = "Not signed in.";
      authFormsEl?.classList.remove("hidden");
      logoutBtn?.classList.add("hidden");
      accountManagementSection?.classList.add("hidden");
      accountDetailsPanel?.classList.add("hidden");
      if (toggleIcon) toggleIcon.textContent = "▶";
    }
  }

  function authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = getToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  async function fetchWithAuth(path, options = {}) {
    const headers = options.headers || {};
    return window.authGuard.fetchWithAuth(`${API_BASE}${path}`, { ...options, headers });
  }

  function decodeJwtPayload(token) {
    try {
      if (!token || typeof token !== "string") return null;
      const parts = token.split(".");
      if (parts.length < 2) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const pad = "=".repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(b64 + pad));
    } catch {
      return null;
    }
  }

  function getEmailFromToken(token) {
    const payload = decodeJwtPayload(token);
    return (payload && typeof payload.email === "string" && payload.email) ? payload.email : null;
  }

  function showSignedInDegraded(token, reason) {
    const email = getEmailFromToken(token) || "User";
    // 保持“已登录”的感觉：不展示登录表单，也不清 token
    authStatusEl.textContent = `Signed in as ${email}`;
    authFormsEl?.classList.add("hidden");
    logoutBtn?.classList.remove("hidden");
    accountManagementSection?.classList.add("hidden");
    accountDetailsPanel?.classList.add("hidden");
    if (toggleIcon) toggleIcon.textContent = "▶";
    setAuthMessage(reason || "Temporarily unable to load account details. Please retry.", true);
  }

  async function loadAccount() {
    if (!authStatusEl) return;
    const token = getToken();
    if (!token) {
      updateAuthView(null);
      return;
    }
    try {
      log("GET /api/auth/me ...");
      const res = await fetchWithAuth("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        // 仅 401（token 无效/过期）时清 token 并登出；404/其他错误不清 token，避免 OAuth 用户被误登出
        if (res.status === 401) {
          saveToken(null);
          updateAuthView(null);
          window.authGuard?.showLoginRequired?.();
          setAuthMessage("Please log in first", true);
          log("Account 401: token cleared.");
          return;
        }
        showSignedInDegraded(token, data.error || "Unable to load account. If this persists, try signing out and back in.");
        log(`Account load error (${res.status}): ${data.error || "unknown"}`);
        return;
      }
      updateAuthView(data.user);
      setAuthMessage("");
      log("Account loaded.");
    } catch (err) {
      console.error(err);
      // 网络/CORS/JSON 解析等错误：不要清 token，不要强制当成“未登录”
      showSignedInDegraded(token, "Network error while loading account. Please retry.");
      log("Account error (network): " + (err.message || String(err)));
    }
  }
  async function submitAuthForm(path, payload) {
    log(`POST ${path} ...`);
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(loginForm);
    const payload = {
      email: (formData.get("loginEmail") || "").toString().trim(),
      password: formData.get("loginPassword")
    };
    try {
      const data = await submitAuthForm("/api/auth/login", payload);
      saveToken(data.token);
      try {
        await loadAccount();
        setAuthMessage("Signed in successfully.");
        loginForm.reset();
      } catch (refreshErr) {
        console.error(refreshErr);
        setAuthMessage("Signed in, but failed to load account details. Please try refreshing the page.", true);
      }
    } catch (err) {
      console.error(err);
      setAuthMessage(err.message, true);
    }
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(registerForm);
    const payload = {
      email: (formData.get("registerEmail") || "").toString().trim(),
      password: formData.get("registerPassword")
    };
    try {
      const data = await submitAuthForm("/api/auth/register", payload);
      saveToken(data.token);
      try {
        await loadAccount();
        setAuthMessage("Account created and signed in.");
        registerForm.reset();
      } catch (refreshErr) {
        console.error(refreshErr);
        setAuthMessage("Account created, but failed to load account details. Please try refreshing the page.", true);
      }
    } catch (err) {
      console.error(err);
      setAuthMessage(err.message, true);
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    try {
      await fetchWithAuth("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.warn("Logout request failed", err);
    }
    saveToken(null);
    updateAuthView(null);
    setAuthMessage("Signed out.");
  });

  // OAuth button handlers
  const googleLoginBtn = document.getElementById('googleLoginBtn');
  const githubLoginBtn = document.getElementById('githubLoginBtn');

  googleLoginBtn?.addEventListener('click', () => {
    if (window.oauth && window.oauth.signInWithGoogle) {
      log("Initiating Google OAuth...");
      window.oauth.signInWithGoogle();
    } else {
      console.error("OAuth library not loaded");
      setAuthMessage("OAuth not available. Please refresh the page.", true);
    }
  });

  githubLoginBtn?.addEventListener('click', () => {
    if (window.oauth && window.oauth.signInWithGitHub) {
      log("Initiating GitHub OAuth...");
      window.oauth.signInWithGitHub();
    } else {
      console.error("OAuth library not loaded");
      setAuthMessage("OAuth not available. Please refresh the page.", true);
    }
  });

  // Manage Account toggle
  manageAccountToggle?.addEventListener("click", () => {
    const isExpanded = !accountDetailsPanel?.classList.contains("hidden");
    accountDetailsPanel?.classList.toggle("hidden");
    if (toggleIcon) toggleIcon.textContent = isExpanded ? "▶" : "▼";
    if (!isExpanded) loadAccountManagementData();
  });

  manageSubscriptionBtn?.addEventListener("click", async () => {
    try {
      log("POST /api/billing/portal-session ...");
      const res = await fetchWithAuth("/api/billing/portal-session", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to open portal");
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      setAuthMessage(err.message || "Failed to open billing portal.", true);
    }
  });

  async function loadAccountManagementData() {
    const subscriptionStatus = document.getElementById("subscriptionStatus");
    const planName = document.getElementById("planName");
    const periodEnd = document.getElementById("periodEnd");
    const trialEndItem = document.getElementById("trialEndItem");
    const trialEnd = document.getElementById("trialEnd");
    const creditsUsageToday = document.getElementById("creditsUsageToday");
    const creditsPoolToday = document.getElementById("creditsPoolToday");

    try {
      const statusRes = await fetchWithAuth("/api/billing/status");
      const statusData = await statusRes.json();

      if (!statusRes.ok || !statusData.ok) throw new Error(statusData.error || "Failed to load status");

      const { subscription, usage, limits, credits } = statusData;
      subscriptionStatus && (subscriptionStatus.textContent = getStatusText(subscription.status));
      subscriptionStatus && (subscriptionStatus.className = `status-badge ${subscription.status}`);
      planName && (planName.textContent = subscription.plan ? capitalizeFirst(subscription.plan) : "None");
      periodEnd && (periodEnd.textContent = subscription.periodEnd ? formatDate(subscription.periodEnd) : "--");
      if (subscription.status === "trialing" && subscription.trialEnd) {
        trialEndItem && (trialEndItem.style.display = "flex");
        trialEnd && (trialEnd.textContent = formatDate(subscription.trialEnd) + (subscription.trialDaysRemaining != null ? ` (${subscription.trialDaysRemaining} days left)` : ""));
      } else {
        trialEndItem && (trialEndItem.style.display = "none");
      }
      if (subscription.status === "active" || subscription.status === "trialing") {
        manageSubscriptionBtn && (manageSubscriptionBtn.style.display = "inline-flex");
      } else {
        manageSubscriptionBtn && (manageSubscriptionBtn.style.display = "none");
      }
      if (creditsUsageToday && credits) {
        creditsUsageToday.textContent = `${credits.balance ?? 0} / ${credits.dailyAllowance ?? 80}`;
        if (creditsPoolToday) {
          creditsPoolToday.textContent = credits.poolRemaining != null ? String(credits.poolRemaining) : "—";
        }
      } else if (creditsUsageToday) {
        creditsUsageToday.textContent = "—";
        if (creditsPoolToday) creditsPoolToday.textContent = "—";
      }

      const noteEl = document.getElementById("settingsDailyResetNote");
      if (noteEl) {
        const tz = statusData.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        if (statusData.nextResetAt) {
          const dt = new Date(statusData.nextResetAt);
          const when = dt.toLocaleString(undefined, {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit"
          });
          noteEl.textContent = `Resets at ${when} (${tz})`;
        } else {
          noteEl.textContent = `Resets daily at 00:00 (${tz})`;
        }
      }
    } catch (err) {
      console.error("Account management load error:", err);
    }
  }

  function getStatusText(status) {
    const m = { none: "No Subscription", trialing: "Trial Active", active: "Active", past_due: "Past Due", canceled: "Canceled", unpaid: "Unpaid" };
    return m[status] || status;
  }
  function formatDate(s) {
    if (!s) return "--";
    return new Date(s).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }
  function capitalizeFirst(str) {
    return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function hexToRgba(hex, alpha) {
    var color = String(hex || "").replace("#", "");
    if (color.length === 3) color = color.split("").map(function (ch) { return ch + ch; }).join("");
    var r = parseInt(color.slice(0, 2), 16) || 0;
    var g = parseInt(color.slice(2, 4), 16) || 0;
    var b = parseInt(color.slice(4, 6), 16) || 0;
    return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
  }

  function readNode(nodes, key, fallbackTitle, fallbackKeywords) {
    var src = (nodes && nodes[key]) || {};
    var keywords = Array.isArray(src.keywords) ? src.keywords.slice(0, 2) : [];
    while (keywords.length < 2) keywords.push(fallbackKeywords[keywords.length] || "");
    return {
      title: src.title || fallbackTitle,
      keywords: keywords
    };
  }

  function renderScienceMindmap() {
    if (!scienceMindmapEl || !window.quizallScienceData || !window.quizallScienceLocale) return;
    var locale = window.quizallScienceLocale.resolveLocale();
    var copy = window.quizallScienceLocale.getCopy(locale);

    var map = copy.mindmap || {};
    var boundaries = map.boundaries || {};
    var nodes = map.nodes || {};
    var why = map.why || {};
    var stepWord = copy.stepWord || "Step";

    var schemaNode = readNode(nodes, "schema", "Schema Activation", ["Prior Knowledge", "Cognitive Load"]);
    var retrievalNode = readNode(nodes, "retrieval", "Active Retrieval", ["Testing Effect", "Generation"]);
    var difficultyNode = readNode(nodes, "difficulty", "Desirable Difficulties", ["Effortful Recall", "Durable Memory"]);
    var zpdNode = readNode(nodes, "zpd", "ZPD Calibration", ["Challenge-Skill Fit", "Flow Zone"]);
    var spacedNode = readNode(nodes, "spaced", "Spaced Repetition", ["Forgetting Curve", "Timing Control"]);
    var feedbackNode = readNode(nodes, "feedback", "Feedback Loop", ["Error Signals", "Model Update"]);

    var palette = {
      schema: "#0f766e",
      retrieval: "#1d4ed8",
      difficulty: "#d97706",
      zpd: "#7c3aed",
      spaced: "#047857",
      feedback: "#e11d48"
    };

    function renderRulerIcon(x, y, color) {
      return (
        '<g transform="translate(' + x + ',' + y + ')" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round">' +
          '<rect x="0.9" y="0.9" width="22.2" height="12.2" rx="2" />' +
          '<line x1="4" y1="4" x2="4" y2="10" />' +
          '<line x1="8" y1="6" x2="8" y2="10" />' +
          '<line x1="12" y1="4" x2="12" y2="10" />' +
          '<line x1="16" y1="6" x2="16" y2="10" />' +
          '<line x1="20" y1="4" x2="20" y2="10" />' +
        '</g>'
      );
    }

    function renderClockIcon(x, y, color) {
      return (
        '<g transform="translate(' + x + ',' + y + ')" fill="none" stroke="' + color + '" stroke-width="1.8" stroke-linecap="round">' +
          '<circle cx="9" cy="9" r="8" />' +
          '<line x1="9" y1="9" x2="9" y2="4.5" />' +
          '<line x1="9" y1="9" x2="12.5" y2="11.5" />' +
        '</g>'
      );
    }

    function renderNode(spec) {
      var icon = "";
      if (spec.icon === "ruler") icon = renderRulerIcon(spec.x + spec.w - 40, spec.y + 12, spec.color);
      if (spec.icon === "clock") icon = renderClockIcon(spec.x + spec.w - 34, spec.y + 10, spec.color);
      return (
        '<g>' +
          '<rect x="' + spec.x + '" y="' + spec.y + '" width="' + spec.w + '" height="' + spec.h + '" rx="16" fill="' + hexToRgba(spec.color, 0.16) + '" stroke="' + spec.color + '" stroke-width="2.1" />' +
          '<text x="' + (spec.x + 18) + '" y="' + (spec.y + 28) + '" class="mm-step">' + esc(spec.stepLabel) + '</text>' +
          '<text x="' + (spec.x + 18) + '" y="' + (spec.y + 54) + '" class="mm-node-title">' + esc(spec.title) + '</text>' +
          '<text x="' + (spec.x + 18) + '" y="' + (spec.y + 74) + '" class="mm-key">' + esc(spec.key1) + '</text>' +
          '<text x="' + (spec.x + 18) + '" y="' + (spec.y + 96) + '" class="mm-key">' + esc(spec.key2) + '</text>' +
          icon +
        '</g>'
      );
    }

    function renderWhyLabel(x, y, textValue) {
      var width = Math.max(180, Math.min(360, String(textValue || "").length * 7.1 + 22));
      return (
        '<g transform="translate(' + x + ',' + y + ')">' +
          '<rect x="0" y="0" width="' + width + '" height="28" rx="9" class="mm-why-badge" />' +
          '<text x="10" y="19" class="mm-why-text">' + esc(textValue) + '</text>' +
        '</g>'
      );
    }

    var svg =
      '<svg class="mindmap-canvas" viewBox="0 0 1400 860" role="img" aria-label="' + esc(map.title || "QuizAll Research Foundation mindmap") + '">' +
        '<defs>' +
          '<pattern id="settings-mm-grid" width="30" height="30" patternUnits="userSpaceOnUse">' +
            '<path d="M30 0 H0 V30" fill="none" stroke="rgba(148,163,184,0.17)" stroke-width="1" />' +
          '</pattern>' +
          '<marker id="settings-mm-arrow" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">' +
            '<path d="M0,0 L10,6 L0,12 z" fill="rgba(148,163,184,0.85)" />' +
          '</marker>' +
          '<marker id="settings-mm-arrow-cyan" markerWidth="12" markerHeight="12" refX="9" refY="6" orient="auto">' +
            '<path d="M0,0 L10,6 L0,12 z" fill="#67e8f9" />' +
          '</marker>' +
          '<style>' +
            '.mm-track{font:700 16px "Source Sans 3", sans-serif; fill:var(--science-muted); letter-spacing:0.04em; text-transform:uppercase;}' +
            '.mm-boundary{fill:rgba(148,163,184,0.045); stroke:rgba(148,163,184,0.55); stroke-width:1.6; stroke-dasharray:7 6;}' +
            '.mm-boundary-title{font:700 14px "Source Sans 3", sans-serif; fill:var(--science-text); letter-spacing:0.03em; text-transform:uppercase;}' +
            '.mm-boundary-sub{font:600 12px "Source Sans 3", sans-serif; fill:var(--science-muted);}' +
            '.mm-center{fill:var(--science-panel); stroke:rgba(148,163,184,0.62); stroke-width:2;}' +
            '.mm-center-main{font:700 31px "Source Serif 4", Georgia, serif; fill:var(--science-text); text-anchor:middle;}' +
            '.mm-center-sub{font:700 13px "Source Sans 3", sans-serif; fill:var(--science-muted); text-anchor:middle; letter-spacing:0.07em; text-transform:uppercase;}' +
            '.mm-step{font:700 11px "Source Sans 3", sans-serif; fill:var(--science-muted); letter-spacing:0.1em; text-transform:uppercase;}' +
            '.mm-node-title{font:700 24px "Source Serif 4", Georgia, serif; fill:var(--science-text);}' +
            '.mm-key{font:600 13px "Source Sans 3", sans-serif; fill:var(--science-muted);}' +
            '.mm-link{stroke:rgba(148,163,184,0.9); stroke-width:2.4; fill:none; marker-end:url(#settings-mm-arrow);}' +
            '.mm-link-dashed{stroke:#67e8f9; stroke-width:2.2; fill:none; stroke-dasharray:8 7; marker-end:url(#settings-mm-arrow-cyan);}' +
            '.mm-why-badge{fill:var(--science-btn-soft-bg); stroke:var(--science-line-strong); stroke-width:1.2;}' +
            '.mm-why-text{font:700 12px "Source Sans 3", sans-serif; fill:#67e8f9;}' +
          '</style>' +
        '</defs>' +
        '<rect x="0" y="0" width="1400" height="860" fill="url(#settings-mm-grid)" opacity="0.74" />' +
        '<text x="700" y="68" class="mm-track" text-anchor="middle">' + esc(map.path || "First Principles -> Operational Details") + '</text>' +
        '<circle cx="700" cy="166" r="92" class="mm-center" />' +
        '<text x="700" y="156" class="mm-center-main">' + esc(map.title || "QuizAll Research Foundation") + '</text>' +
        '<text x="700" y="186" class="mm-center-sub">' + esc(map.mece || "MECE 6-Step Architecture") + '</text>' +
        '<rect x="100" y="272" width="400" height="432" rx="18" class="mm-boundary" />' +
        '<rect x="500" y="272" width="400" height="432" rx="18" class="mm-boundary" />' +
        '<rect x="900" y="272" width="400" height="432" rx="18" class="mm-boundary" />' +
        '<text x="120" y="296" class="mm-boundary-title">' + esc((boundaries.a && boundaries.a.title) || "Input & Encoding Boundary") + '</text>' +
        '<text x="120" y="314" class="mm-boundary-sub">' + esc((boundaries.a && boundaries.a.subtitle) || "Structure -> Retrieval") + '</text>' +
        '<text x="520" y="296" class="mm-boundary-title">' + esc((boundaries.b && boundaries.b.title) || "Optimization Boundary") + '</text>' +
        '<text x="520" y="314" class="mm-boundary-sub">' + esc((boundaries.b && boundaries.b.subtitle) || "Difficulty -> ZPD") + '</text>' +
        '<text x="920" y="296" class="mm-boundary-title">' + esc((boundaries.c && boundaries.c.title) || "Consolidation Boundary") + '</text>' +
        '<text x="920" y="314" class="mm-boundary-sub">' + esc((boundaries.c && boundaries.c.subtitle) || "Spacing -> Feedback") + '</text>' +
        '<path class="mm-link" d="M636 230 C560 258, 430 286, 300 320" />' +
        '<path class="mm-link" d="M700 258 L700 320" />' +
        '<path class="mm-link" d="M764 230 C840 258, 970 286, 1100 320" />' +
        '<path class="mm-link" d="M300 440 L300 520" />' +
        '<path class="mm-link" d="M700 440 L700 520" />' +
        '<path class="mm-link" d="M1100 440 L1100 520" />' +
        renderNode({ x: 140, y: 320, w: 320, h: 120, color: palette.schema, stepLabel: stepWord + " 01", title: schemaNode.title, key1: schemaNode.keywords[0], key2: schemaNode.keywords[1] }) +
        renderNode({ x: 140, y: 520, w: 320, h: 120, color: palette.retrieval, stepLabel: stepWord + " 02", title: retrievalNode.title, key1: retrievalNode.keywords[0], key2: retrievalNode.keywords[1] }) +
        renderNode({ x: 540, y: 320, w: 320, h: 120, color: palette.difficulty, stepLabel: stepWord + " 03", title: difficultyNode.title, key1: difficultyNode.keywords[0], key2: difficultyNode.keywords[1] }) +
        renderNode({ x: 540, y: 520, w: 320, h: 120, color: palette.zpd, icon: "ruler", stepLabel: stepWord + " 04", title: zpdNode.title, key1: zpdNode.keywords[0], key2: zpdNode.keywords[1] }) +
        renderNode({ x: 940, y: 320, w: 320, h: 120, color: palette.spaced, icon: "clock", stepLabel: stepWord + " 05", title: spacedNode.title, key1: spacedNode.keywords[0], key2: spacedNode.keywords[1] }) +
        renderNode({ x: 940, y: 520, w: 320, h: 120, color: palette.feedback, stepLabel: stepWord + " 06", title: feedbackNode.title, key1: feedbackNode.keywords[0], key2: feedbackNode.keywords[1] }) +
        '<path class="mm-link-dashed" d="M228 522 C66 494, 72 334, 230 338" />' +
        '<path class="mm-link-dashed" d="M860 382 C962 420, 962 564, 860 602" />' +
        '<path class="mm-link-dashed" d="M1014 520 C866 494, 870 332, 1018 340" />' +
        renderWhyLabel(46, 458, (why.retrieveToSchema || "Why: retrieval errors refine schema")) +
        renderWhyLabel(898, 458, (why.difficultyToZpd || "Why: productive difficulty calibrates challenge")) +
        renderWhyLabel(846, 270, (why.feedbackToSpaced || "Why: feedback schedules next review")) +
      '</svg>';

    scienceMindmapEl.innerHTML = '<figure class="mindmap-figure">' + svg + '<figcaption>' + (copy.mindmapCaption || "Mindmap view: one cognitive loop, six coordinated learning stages.") + '</figcaption></figure>';
  }

  async function loadSettings() {
    try {
      log("GET /api/settings ...");
      
      // Simple fetch without timeout - this endpoint should be very fast
      const res = await fetch(`${API_BASE}/api/settings`);
      const data = await res.json().catch(() => ({}));
      
      if (!res.ok || !data.ok) {
        log("Settings error: HTTP " + res.status + " " + JSON.stringify(data));
        // Use default values instead of showing error
        const s = {};
        renderSettings(s);
        return;
      }
      const s = data.settings || {};
      renderSettings(s);
      
    } catch (err) {
      console.error("Settings error:", err);
      log("Settings error: " + err.message);
      // Use default values on error instead of showing error message
      renderSettings({});
    }
  }

  function renderSettings(s) {
    const env = s.env || "development";
    const llmEnabled = s.llmEnabled !== false ? "enabled" : "disabled";

    if (envSummaryEl) {
      envSummaryEl.textContent = `Environment: ${env} · LLM: ${llmEnabled}`;
    }

    if (modelListEl) {
      // 安全地清空容器
      while (modelListEl.firstChild) {
        modelListEl.removeChild(modelListEl.firstChild);
      }
    }
    const modelDisplayName = "QuizAll Refined LLM Model";
    const modelItems = [
      { icon: "🤖", label: "Default Model", value: modelDisplayName, badge: "Primary", desc: "Main generation model that produces the actual responses." },
      { icon: "🎯", label: "Outcome Model", value: s.outcomeModel ? modelDisplayName : "QuizAll Refined Judge", badge: "Optimized", desc: "Judging model that scores candidates and picks the best one." },
      { icon: "📊", label: "Max Candidates", value: String(s.maxCandidates ?? 8), badge: "Optimized", desc: "Generates up to 8 candidate answers per run and selects the best." }
    ];
    for (const item of modelItems) {
        const div = document.createElement("div");
        div.className = "model-item";
        
        const iconSpan = document.createElement("span");
        iconSpan.className = "model-icon";
        iconSpan.textContent = item.icon;
        
        const detailsDiv = document.createElement("div");
        detailsDiv.className = "model-details";
        
        const headerDiv = document.createElement("div");
        headerDiv.className = "model-header";
        
        const labelSpan = document.createElement("span");
        labelSpan.className = "model-label";
        labelSpan.textContent = item.label + ": ";
        
        const valueSpan = document.createElement("span");
        valueSpan.className = "model-value";
        valueSpan.textContent = item.value;
        
        headerDiv.appendChild(labelSpan);
        headerDiv.appendChild(valueSpan);
        
        const descSpan = document.createElement("div");
        descSpan.className = "model-desc";
        descSpan.textContent = item.desc;
        
        detailsDiv.appendChild(headerDiv);
        detailsDiv.appendChild(descSpan);
        div.appendChild(iconSpan);
        div.appendChild(detailsDiv);
        
        if (item.badge) {
          const badgeSpan = document.createElement("span");
          badgeSpan.className = "model-badge";
          badgeSpan.textContent = item.badge;
          div.appendChild(badgeSpan);
        }
        
        if (modelListEl) {
          modelListEl.appendChild(div);
        }
      }

    if (featuresListEl) {
      // 安全地清空容器
      while (featuresListEl.firstChild) {
        featuresListEl.removeChild(featuresListEl.firstChild);
      }
    }
    const features = s.features || {
      questionWizard: true,
      promptEnhancer: true,
      outcomeRunner: true
    };
    const featureIcons = {
      questionWizard: "🧙",
      promptEnhancer: "✨",
      outcomeRunner: "🎯",
      uniqueLLMAlgorithm: "🚀"
    };
    const featureLabels = {
      questionWizard: "Question Wizard",
      promptEnhancer: "Prompt Enhancer",
      outcomeRunner: "Outcome Runner",
      uniqueLLMAlgorithm: "QuizAll Unique LLMs Prompt Algorithm"
    };
    const featureDescs = {
      questionWizard: "Smart clarifying questions",
      promptEnhancer: "AI-powered optimization",
      outcomeRunner: "Best result selection",
      uniqueLLMAlgorithm: "Our proprietary algorithm power"
    };
    
    // Add our special algorithm feature (always on)
    const allFeatures = { ...features, uniqueLLMAlgorithm: true };
    
    Object.keys(allFeatures).forEach((key) => {
      const li = document.createElement("li");
      const isOn = allFeatures[key];
      
      const iconSpan = document.createElement("span");
      iconSpan.className = "feature-icon";
      iconSpan.textContent = featureIcons[key] || "⚡";
      
      const contentDiv = document.createElement("div");
      contentDiv.style.flex = "1";
      
      const nameSpan = document.createElement("span");
      nameSpan.className = "feature-name";
      nameSpan.textContent = featureLabels[key] || key;
      
      const descSpan = document.createElement("div");
      descSpan.className = "feature-desc";
      descSpan.textContent = featureDescs[key] || "";
      
      contentDiv.appendChild(nameSpan);
      contentDiv.appendChild(descSpan);
      
      const statusSpan = document.createElement("span");
      statusSpan.className = `feature-status ${isOn ? "on" : "off"}`;
      statusSpan.textContent = isOn ? "Active" : "Inactive";
      
      li.appendChild(iconSpan);
      li.appendChild(contentDiv);
      li.appendChild(statusSpan);
      if (featuresListEl) {
        featuresListEl.appendChild(li);
      }
    });

    if (rawSettingsEl) {
      rawSettingsEl.textContent = JSON.stringify(s, null, 2);
    }
    renderScienceMindmap();
    log("Settings loaded.");
  }

  // Show skeleton loaders immediately for faster perceived loading
  function showSkeletonLoaders() {
    // Environment skeleton
    if (modelListEl) {
      modelListEl.innerHTML = `
        <div class="model-item skeleton-item">
          <span class="model-icon skeleton-pulse">🤖</span>
          <div class="model-details"><div class="skeleton-text" style="width:70%"></div><div class="skeleton-text" style="width:90%"></div></div>
        </div>
        <div class="model-item skeleton-item">
          <span class="model-icon skeleton-pulse">🎯</span>
          <div class="model-details"><div class="skeleton-text" style="width:60%"></div><div class="skeleton-text" style="width:85%"></div></div>
        </div>
        <div class="model-item skeleton-item">
          <span class="model-icon skeleton-pulse">📊</span>
          <div class="model-details"><div class="skeleton-text" style="width:50%"></div><div class="skeleton-text" style="width:75%"></div></div>
        </div>
      `;
    }
    // Features skeleton
    if (featuresListEl) {
      featuresListEl.innerHTML = `
        <li class="skeleton-item"><span class="feature-icon skeleton-pulse">🧙</span><div style="flex:1"><div class="skeleton-text" style="width:60%"></div><div class="skeleton-text" style="width:80%"></div></div></li>
        <li class="skeleton-item"><span class="feature-icon skeleton-pulse">✨</span><div style="flex:1"><div class="skeleton-text" style="width:55%"></div><div class="skeleton-text" style="width:75%"></div></div></li>
        <li class="skeleton-item"><span class="feature-icon skeleton-pulse">🎯</span><div style="flex:1"><div class="skeleton-text" style="width:65%"></div><div class="skeleton-text" style="width:70%"></div></div></li>
        <li class="skeleton-item"><span class="feature-icon skeleton-pulse">🚀</span><div style="flex:1"><div class="skeleton-text" style="width:70%"></div><div class="skeleton-text" style="width:85%"></div></div></li>
      `;
    }
    if (envSummaryEl) {
      envSummaryEl.innerHTML = '<span class="skeleton-text" style="width:200px;display:inline-block"></span>';
    }
  }

  // Show skeletons first, then load data in parallel
  showSkeletonLoaders();
  Promise.all([loadSettings(), loadAccount()]).catch(err => {
    console.error("Error loading settings page:", err);
  });
})();
