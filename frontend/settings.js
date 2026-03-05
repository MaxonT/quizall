const API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim())
  || (window.location && window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : "http://localhost:8080");

(() => {
  const envSummaryEl = document.getElementById("envSummary");
  const modelListEl = document.getElementById("modelList");
  const featuresListEl = document.getElementById("featuresList");
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
        throw new Error(data.error || "Unable to load account");
      }
      updateAuthView(data.user);
      setAuthMessage("");
      log("Account loaded.");
    } catch (err) {
      console.error(err);
      saveToken(null);
      updateAuthView(null);
      window.authGuard?.showLoginRequired?.();
      setAuthMessage("Please log in first", true);
      log("Account error: " + err.message);
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
    const promptUsageToday = document.getElementById("promptUsageToday");
    const wizardUsageToday = document.getElementById("wizardUsageToday");

    try {
      const statusRes = await fetchWithAuth("/api/billing/status");
      const statusData = await statusRes.json();

      if (!statusRes.ok || !statusData.ok) throw new Error(statusData.error || "Failed to load status");

      const { subscription, usage, limits } = statusData;
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
      if (promptUsageToday && wizardUsageToday) {
        const promptUsed = usage?.promptOptimization ?? 0;
        const promptDaily = limits?.promptOptimization?.daily ?? "--";
        const wizardUsed = usage?.questionWizard ?? 0;
        const wizardDaily = limits?.questionWizard?.daily ?? "--";
        promptUsageToday.textContent = `${promptUsed} / ${promptDaily}`;
        wizardUsageToday.textContent = `${wizardUsed} / ${wizardDaily}`;
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
