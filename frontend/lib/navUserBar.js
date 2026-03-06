/**
 * Nav User Bar — 导航栏用户状态条
 * 在所有页面的 topbar 中显示：未登录时 [Sign In] [Sign Up]，已登录时 [邮箱 ▼] 下拉菜单
 */
(function () {
  const TOKEN_KEY = "quizall.token";
  const API_BASE =
    (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) ||
    (window.location && window.location.origin && window.location.origin !== "null"
      ? window.location.origin
      : "http://localhost:8080");

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new CustomEvent("authStateChanged"));
  }

  function render(container) {
    if (!container) return;
    const token = getToken();

    if (token) {
      // 已登录：显示用户邮箱 + 下拉
      fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          const email = (data.ok && data.user && data.user.email) || "User";
          container.innerHTML = `
            <div class="nav-user-wrap" id="navUserWrap">
              <button type="button" class="nav-user-trigger" id="navUserTrigger" aria-haspopup="true" aria-expanded="false">
                <span class="nav-user-email">${escapeHtml(email)}</span>
                <span class="nav-user-chevron">▼</span>
              </button>
              <div class="nav-user-dropdown hidden" id="navUserDropdown">
                <a href="account.html" class="nav-user-item">Account</a>
                <button type="button" class="nav-user-item nav-user-logout" id="navUserLogout">Log out</button>
              </div>
            </div>
          `;
          setupLoggedInEvents(container);
        })
        .catch(() => {
          // Token 可能无效，显示未登录态
          clearToken();
          renderLoggedOut(container);
        });
    } else {
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

    document.addEventListener("click", (e) => {
      if (wrap && !wrap.contains(e.target)) {
        if (dropdown) dropdown.classList.add("hidden");
        if (trigger) trigger.setAttribute("aria-expanded", "false");
      }
    });
  }

  function init() {
    const container = document.getElementById("navUserBar");
    if (!container) return;
    render(container);

    window.addEventListener("authStateChanged", () => render(container));
    window.addEventListener("storage", (e) => {
      if (e.key === TOKEN_KEY) render(container);
    });
  }

  window.navUserBar = { render, init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
