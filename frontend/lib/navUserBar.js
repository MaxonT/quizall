/**
 * Nav User Bar — 导航栏用户状态条
 * 在所有页面的 topbar 中显示：未登录时 [Sign In] [Sign Up]，已登录时 [邮箱 ▼] 下拉菜单
 */
(function () {
  const TOKEN_KEY = "quizall.token";
  const THEME_KEY = "theme";
  let API_BASE =
    (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) ||
    (window.location && window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost:8080");
  if (typeof window !== "undefined" && window.location?.hostname?.includes(".onrender.com") && API_BASE === window.location.origin) {
    API_BASE = "https://quizall-backend-0qr4.onrender.com";
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
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
    if (!payload) return null;
    const email = payload.email ?? payload.email_address;
    return (typeof email === "string" && email.length > 0) ? email : null;
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent("authStateChanged"));
  }

  function t(key, fallback) {
    try {
      if (!window.i18n || typeof window.i18n.t !== "function") return fallback;
      const translated = window.i18n.t(key);
      if (!translated || translated === key) return fallback;
      return translated;
    } catch {
      return fallback;
    }
  }

  function applyUserRole(user) {
    const tier = String(user?.subscription?.tier || "").toLowerCase();
    const isAdmin = tier === "admin";
    document.body.classList.toggle("qa-user-admin", isAdmin);
    document.querySelectorAll("[data-admin-only]").forEach((el) => {
      el.hidden = !isAdmin;
    });
  }

  function currentPage() {
    const path = window.location.pathname || "";
    const file = path.split("/").pop();
    return file && file.length ? file : "index.html";
  }

  function normalizeHref(href) {
    if (!href || href.startsWith("#")) return "";
    const withoutHash = href.split("#")[0] || "";
    return withoutHash.split("?")[0] || "";
  }

  function preventSelfNav(event) {
    event.preventDefault();
  }

  function markCurrentNavAsStatic() {
    const page = currentPage();
    document.querySelectorAll(".navlinks a[href]").forEach((link) => {
      const href = normalizeHref(link.getAttribute("href"));
      const isCurrent = href === page || (page === "" && href === "index.html");
      link.classList.toggle("is-current", isCurrent);
      if (isCurrent) {
        link.setAttribute("aria-current", "page");
        if (!link.dataset.selfNavBound) {
          link.addEventListener("click", preventSelfNav);
          link.dataset.selfNavBound = "1";
        }
      } else {
        link.removeAttribute("aria-current");
        if (link.dataset.selfNavBound) {
          link.removeEventListener("click", preventSelfNav);
          delete link.dataset.selfNavBound;
        }
      }
    });
  }

  function findWorkspaceNavLink() {
    const navRoot = document.querySelector(".navlinks");
    if (!navRoot) return null;
    return navRoot.querySelector("a[data-i18n='nav.create'], a[href='create.html']");
  }

  function applyWorkspaceLabel(hasProjects) {
    const workspaceLink = findWorkspaceNavLink();
    if (!workspaceLink) return;
    const key = hasProjects ? "nav.workspace" : "nav.createProject";
    const fallback = hasProjects ? "Workspace" : "Create Project";
    workspaceLink.setAttribute("data-i18n", key);
    workspaceLink.textContent = t(key, fallback);
  }

  async function refreshWorkspaceLabel() {
    const token = getToken();
    const workspaceLink = findWorkspaceNavLink();
    if (!workspaceLink) return;
    if (!token) {
      applyWorkspaceLabel(true);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/quiz/projects?limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        clearToken();
        applyWorkspaceLabel(true);
        return;
      }
      const data = await res.json().catch(() => ({}));
      const hasProjects = Array.isArray(data.projects) && data.projects.length > 0;
      applyWorkspaceLabel(hasProjects);
    } catch {
      applyWorkspaceLabel(true);
    }
  }

  function initAdaptiveNav() {
    markCurrentNavAsStatic();
    refreshWorkspaceLabel();
  }

  function initThemeSelect() {
    if (window.__quizallThemeSelectBound) return;
    const select = document.getElementById("themeSelect");
    if (!select) return;
    window.__quizallThemeSelectBound = true;

    const prefersDark = window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null;
    const saved = localStorage.getItem(THEME_KEY) || document.documentElement.getAttribute("data-theme") || "dark";
    select.value = saved;

    function applyTheme(theme) {
      const resolved = theme === "auto" && prefersDark ? (prefersDark.matches ? "dark" : "light") : theme;
      document.documentElement.setAttribute("data-theme", resolved);
    }

    applyTheme(saved);

    select.addEventListener("change", () => {
      const nextTheme = select.value || "dark";
      localStorage.setItem(THEME_KEY, nextTheme);
      applyTheme(nextTheme);
    });

    if (prefersDark) {
      prefersDark.addEventListener("change", () => {
        if ((localStorage.getItem(THEME_KEY) || "dark") === "auto") {
          applyTheme("auto");
        }
      });
    }
  }

  function render(container) {
    if (!container) return;
    const token = getToken();

    if (token) {
      // 已登录：显示用户邮箱 + 下拉
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          // 仅 401 时清除 token；网络/CORS 等错误不应清除刚拿到的 OAuth token
          if (res.status === 401) {
            clearToken();
            applyUserRole(null);
            renderLoggedOut(container);
            return null;
          }
          return res.json();
        })
        .then((data) => {
          if (!data) return; // 已在上面处理 401
          applyUserRole(data.user);
          const email = (data.ok && data.user && (data.user.email || data.user.email_address)) || getEmailFromToken(token) || (window.authState?.getUser?.()?.email) || "User";
          container.innerHTML = `
            <div class="nav-user-wrap" id="navUserWrap">
              <button type="button" class="nav-user-trigger" id="navUserTrigger" aria-haspopup="true" aria-expanded="false">
                <span class="nav-user-email">${escapeHtml(email)}</span>
                <span class="nav-user-chevron">▼</span>
              </button>
              <div class="nav-user-dropdown hidden" id="navUserDropdown">
                <a href="settings.html" class="nav-user-item">Account</a>
                <button type="button" class="nav-user-item nav-user-logout" id="navUserLogout">Log out</button>
              </div>
            </div>
          `;
          setupLoggedInEvents(container);
        })
        .catch(() => {
          // 网络/CORS 等错误：不清除 token，显示 "User" 作为回退（OAuth 刚成功时常见）
          applyUserRole(null);
          const email = getEmailFromToken(token) || (window.authState?.getUser?.()?.email) || "User";
          container.innerHTML = `
            <div class="nav-user-wrap" id="navUserWrap">
              <button type="button" class="nav-user-trigger" id="navUserTrigger" aria-haspopup="true" aria-expanded="false">
                <span class="nav-user-email">${escapeHtml(email)}</span>
                <span class="nav-user-chevron">▼</span>
              </button>
              <div class="nav-user-dropdown hidden" id="navUserDropdown">
                <a href="settings.html" class="nav-user-item">Account</a>
                <button type="button" class="nav-user-item nav-user-logout" id="navUserLogout">Log out</button>
              </div>
            </div>
          `;
          setupLoggedInEvents(container);
        });
    } else {
      applyUserRole(null);
      renderLoggedOut(container);
    }
  }

  function renderLoggedOut(container) {
    if (!container) return;
    container.innerHTML = `
      <div class="nav-auth-buttons">
        <a href="index.html#authSection" class="nav-auth-btn nav-auth-signin">Sign In</a>
        <a href="index.html#authSection" class="nav-auth-btn nav-auth-signup">Sign Up</a>
      </div>
    `;
  }

  function escapeHtml(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function setupLoggedInEvents(container) {
    const trigger = container.querySelector("#navUserTrigger");
    const dropdown = container.querySelector("#navUserDropdown");
    const logoutBtn = container.querySelector("#navUserLogout");
    const wrap = container.querySelector("#navUserWrap");

    if (trigger && dropdown) {
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        const isHidden = dropdown.classList.contains("hidden");
        dropdown.classList.toggle("hidden", !isHidden);
        trigger.setAttribute("aria-expanded", isHidden ? "true" : "false");
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        fetch(`${API_BASE}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${getToken()}` },
        }).catch(() => {});
        clearToken();
        render(container);
        if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/" || window.location.pathname.endsWith("/")) {
          window.location.reload();
        } else {
          window.location.href = "index.html";
        }
      });
    }

    if (container.__outsideClickHandler) {
      document.removeEventListener("click", container.__outsideClickHandler);
    }
    const outsideClickHandler = (e) => {
      if (wrap && !wrap.contains(e.target)) {
        if (dropdown) dropdown.classList.add("hidden");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    };
    container.__outsideClickHandler = outsideClickHandler;
    document.addEventListener("click", outsideClickHandler);
  }

  function initCursorFx() {
    if (window.__quizallCursorFxInitialized) return;
    if (!window.matchMedia || !document.body) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const path = window.location.pathname || "";
    const onIndex = /index\.html$/.test(path) || path.endsWith("/") || path === "";
    const landingOnly = onIndex && !document.body.classList.contains("logged-in-home");
    if (!landingOnly) return;

    window.__quizallCursorFxInitialized = true;
    const body = document.body;
    document.querySelectorAll(".qa-cursor-glow,.qa-cursor-ring,.qa-cursor-tail").forEach((node) => node.remove());
    body.classList.remove("qa-cursor-mode-type", "qa-cursor-pressing", "qa-cursor-active");
    let currentMode = "normal";
    body.classList.add("qa-cursor-enabled", "qa-cursor-mode-normal");

    function setMode(mode) {
      if (mode === currentMode) return;
      currentMode = mode;
      body.classList.toggle("qa-cursor-mode-normal", mode === "normal");
      body.classList.toggle("qa-cursor-mode-click", mode === "click");
      body.classList.toggle("qa-cursor-mode-select", mode === "select");
    }

    function isSelectTarget(target) {
      if (!(target instanceof Element)) return false;
      return !!target.closest("input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']), textarea, [contenteditable='true'], [contenteditable=''], [data-cursor='select']");
    }

    function isClickableTarget(target) {
      if (!(target instanceof Element)) return false;
      const clickable = target.closest("[data-cursor='click'],a[href],button,summary,label[for],select,[role='button'],[tabindex]:not([tabindex='-1'])");
      if (!clickable) return false;
      return !clickable.matches("[disabled],[aria-disabled='true']");
    }

    function updateMode(target) {
      if (isSelectTarget(target)) {
        setMode("select");
        return;
      }
      if (isClickableTarget(target)) {
        setMode("click");
        return;
      }
      setMode("normal");
    }

    window.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      updateMode(event.target);
    }, { passive: true });

    window.addEventListener("pointerdown", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      setMode("click");
    });

    window.addEventListener("pointerup", (event) => {
      if (event && event.target) updateMode(event.target);
    });

    document.addEventListener("focusin", (event) => {
      updateMode(event.target);
    });

    document.addEventListener("focusout", () => {
      setMode("normal");
    });

    function resetCursorState() {
      setMode("normal");
      body.classList.remove("qa-cursor-active", "qa-cursor-pressing");
    }

    window.addEventListener("blur", () => {
      resetCursorState();
    });

    document.addEventListener("mouseleave", () => {
      resetCursorState();
    });

    window.addEventListener("mouseout", (event) => {
      if (event.relatedTarget || event.toElement) return;
      resetCursorState();
    });

    if (finePointer.addEventListener) {
      finePointer.addEventListener("change", (event) => {
        if (!event.matches) {
          body.classList.remove("qa-cursor-enabled");
          resetCursorState();
          return;
        }
        body.classList.add("qa-cursor-enabled");
        updateMode(document.activeElement || document.body);
      });
    }

    if (reducedMotion.addEventListener) {
      reducedMotion.addEventListener("change", (event) => {
        if (event.matches) {
          body.classList.remove("qa-cursor-enabled");
          resetCursorState();
          return;
        }
        body.classList.add("qa-cursor-enabled");
        updateMode(document.activeElement || document.body);
      });
    }

    updateMode(document.activeElement || document.body);
  }

  function init() {
    initCursorFx();
    initThemeSelect();
    initAdaptiveNav();

    const container = document.getElementById("navUserBar");
    if (container) render(container);

    window.addEventListener("authStateChanged", () => {
      if (container) render(container);
      initAdaptiveNav();
    });
    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) {
        if (container) render(container);
        initAdaptiveNav();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) initAdaptiveNav();
    });
  }

  window.navUserBar = { render, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
