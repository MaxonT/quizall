(function () {
  "use strict";

  const API_BASE = window.authGuard?.API_BASE || window.QUIZALL_API_BASE || "http://localhost:8080";
  const SIDEBAR_PREF_KEY = "quizall.sidebar.open";
  const SIDEBAR_BP_MOBILE = 768;
  const SIDEBAR_BP_TABLET = 1024;

  const state = {
    folders: [],
    activeFolderId: null,
  };

  const els = {
    sidebar: document.getElementById("sidebar"),
    sidebarBackdrop: document.getElementById("sidebarBackdrop"),
    sidebarToggleBtn: document.getElementById("sidebarToggleBtn"),
    newChatBtn: document.getElementById("newChatBtn"),
    navHome: document.getElementById("navHome"),
    navUpload: document.getElementById("navUpload"),
    navProjects: document.getElementById("navProjects"),
    navHistory: document.getElementById("navHistory"),
    navProjectsCount: document.getElementById("navProjectsCount"),
    navHistoryCount: document.getElementById("navHistoryCount"),
    avatarBtn: document.getElementById("avatarBtn"),
    avatarInitials: document.getElementById("avatarInitials"),
    avatarEmail: document.getElementById("avatarEmail"),
    avatarMenu: document.getElementById("avatarMenu"),
    folderGrid: document.getElementById("folderGrid"),
    newFolderBtn: document.getElementById("newFolderBtn"),
    folderDialog: document.getElementById("folderDialog"),
    folderDialogInput: document.getElementById("folderDialogInput"),
    folderDialogCancel: document.getElementById("folderDialogCancel"),
    folderDialogConfirm: document.getElementById("folderDialogConfirm"),
    folderDialogClose: document.getElementById("folderDialogClose"),
  };

  let folderDialogResolver = null;

  function isMobileSidebar() {
    return window.innerWidth < SIDEBAR_BP_MOBILE;
  }

  function defaultSidebarOpen() {
    if (isMobileSidebar()) return false;
    return window.innerWidth > SIDEBAR_BP_TABLET;
  }

  function readSidebarPreference() {
    try {
      const stored = localStorage.getItem(SIDEBAR_PREF_KEY);
      if (stored === "open") return true;
      if (stored === "closed") return false;
    } catch {
      /* ignore */
    }
    return defaultSidebarOpen();
  }

  function setSidebarOpen(open, { persist = false } = {}) {
    if (isMobileSidebar()) {
      els.sidebar.classList.toggle("open", open);
      els.sidebarBackdrop?.classList.toggle("is-visible", open);
      document.body.classList.remove("sidebar-collapsed");
    } else {
      els.sidebar.classList.remove("open");
      els.sidebarBackdrop?.classList.remove("is-visible");
      document.body.classList.toggle("sidebar-collapsed", !open);
    }
    els.sidebarToggleBtn?.setAttribute("aria-expanded", open ? "true" : "false");
    if (persist && !isMobileSidebar()) {
      try {
        localStorage.setItem(SIDEBAR_PREF_KEY, open ? "open" : "closed");
      } catch {
        /* ignore */
      }
    }
  }

  function toggleSidebar() {
    setSidebarOpen(!isSidebarOpen(), { persist: !isMobileSidebar() });
  }

  function isSidebarOpen() {
    if (isMobileSidebar()) return els.sidebar.classList.contains("open");
    return !document.body.classList.contains("sidebar-collapsed");
  }

  function initSidebar() {
    setSidebarOpen(readSidebarPreference());
    els.sidebarBackdrop?.addEventListener("click", () => setSidebarOpen(false));
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (isMobileSidebar()) {
          document.body.classList.remove("sidebar-collapsed");
          if (!els.sidebar.classList.contains("open")) {
            els.sidebarBackdrop?.classList.remove("is-visible");
          }
        } else {
          els.sidebar.classList.remove("open");
          els.sidebarBackdrop?.classList.remove("is-visible");
          setSidebarOpen(readSidebarPreference());
        }
      }, 120);
    });
  }

  function icon(id) {
    return `<svg class="icon"><use href="#${id}"></use></svg>`;
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = String(text ?? "");
    return div.innerHTML;
  }

  function decodeJwtEmail(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.email || payload.sub || "User";
    } catch {
      return "User";
    }
  }

  function initialsFromEmail(email) {
    const part = String(email || "U").split("@")[0] || "U";
    return part.slice(0, 2).toUpperCase();
  }

  async function api(path, options) {
    const res = await window.authGuard.fetchWithAuth(`${API_BASE}${path}`, options || {});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  function updateNavCounts(folders, sessionCount) {
    if (els.navProjectsCount) {
      els.navProjectsCount.textContent = folders.length ? String(folders.length) : "";
    }
    if (els.navHistoryCount) {
      els.navHistoryCount.textContent = sessionCount ? String(sessionCount) : "";
    }
  }

  function setActiveFolder(folderId) {
    state.activeFolderId = folderId;
    renderFolders();
  }

  function renderFolders() {
    if (!els.folderGrid) return;

    const cards = state.folders.map((folder) => {
      const active = state.activeFolderId === folder.id;
      const count = folder.sessionCount ?? folder.projectCount ?? 0;
      return (
        `<button type="button" class="project-folder-card${active ? " is-active" : ""}" data-folder-id="${escapeHtml(folder.id)}">` +
        `<span class="project-folder-icon">${icon("i-folder")}</span>` +
        `<span class="project-folder-name">${escapeHtml(folder.name)}</span>` +
        `<span class="project-folder-meta">${count} ${count === 1 ? "session" : "sessions"}</span>` +
        `</button>`
      );
    });

    const createCard =
      `<button type="button" class="project-folder-card project-folder-card--new" id="newFolderCard">` +
      `<span class="project-folder-icon">${icon("i-plus")}</span>` +
      `<span class="project-folder-name">New project</span>` +
      `</button>`;

    if (!state.folders.length) {
      els.folderGrid.innerHTML =
        `<div class="projects-empty-card">` +
        `<p>No projects yet. Create one to organize sessions by course or topic.</p>` +
        createCard +
        `</div>`;
    } else {
      els.folderGrid.innerHTML = cards.join("") + createCard;
    }

    els.folderGrid.querySelectorAll("[data-folder-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-folder-id");
        setActiveFolder(state.activeFolderId === id ? null : id);
      });
    });
    document.getElementById("newFolderCard")?.addEventListener("click", openFolderDialog);
  }

  async function loadData() {
    const [foldersData, projectsData] = await Promise.all([
      api("/api/quiz/folders").catch(() => ({ folders: [] })),
      api("/api/quiz/projects?limit=50"),
    ]);
    const projects = projectsData.projects || [];
    const folders = foldersData.folders || [];

    const folderCounts = {};
    projects.forEach((p) => {
      if (p.folderId) folderCounts[p.folderId] = (folderCounts[p.folderId] || 0) + 1;
    });
    state.folders = folders.map((f) => ({ ...f, sessionCount: folderCounts[f.id] || 0 }));

    updateNavCounts(state.folders, projects.length);
    renderFolders();
  }

  function closeFolderDialog(value) {
    els.folderDialog?.classList.add("hidden");
    els.folderDialog?.setAttribute("aria-hidden", "true");
    if (folderDialogResolver) {
      const resolve = folderDialogResolver;
      folderDialogResolver = null;
      resolve(value);
    }
  }

  function openFolderDialog() {
    return new Promise((resolve) => {
      if (!els.folderDialog || !els.folderDialogInput) {
        resolve(null);
        return;
      }
      folderDialogResolver = resolve;
      els.folderDialogInput.value = "";
      els.folderDialog.classList.remove("hidden");
      els.folderDialog.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => els.folderDialogInput.focus());
    });
  }

  async function createFolder() {
    const name = await openFolderDialog();
    if (name == null) return;
    const trimmed = name.trim();
    if (trimmed.length < 2) return;
    await api("/api/quiz/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    await loadData();
  }

  function bindEvents() {
    els.newChatBtn?.addEventListener("click", () => {
      window.location.href = "create.html";
    });
    els.navHome?.addEventListener("click", () => {
      window.location.href = "create.html";
    });
    els.navUpload?.addEventListener("click", () => {
      window.location.href = "create.html";
    });
    els.navHistory?.addEventListener("click", () => {
      window.location.href = "create.html#history";
    });
    els.newFolderBtn?.addEventListener("click", createFolder);

    const submitFolderDialog = async () => {
      const value = els.folderDialogInput?.value ?? "";
      closeFolderDialog(value);
    };
    els.folderDialogConfirm?.addEventListener("click", submitFolderDialog);
    els.folderDialogCancel?.addEventListener("click", () => closeFolderDialog(null));
    els.folderDialogClose?.addEventListener("click", () => closeFolderDialog(null));
    els.folderDialog?.addEventListener("click", (e) => {
      if (e.target === els.folderDialog) closeFolderDialog(null);
    });
    els.folderDialogInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitFolderDialog();
      }
    });

    els.avatarBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      els.avatarMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      els.avatarMenu?.classList.add("hidden");
    });
    els.avatarMenu?.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("menuLogout")?.addEventListener("click", () => {
      window.authGuard.clearToken();
      window.location.href = "index.html";
    });
    document.getElementById("menuPrivacy")?.addEventListener("click", () => {
      els.avatarMenu?.classList.add("hidden");
      window.open("privacy.html", "_blank", "noopener");
    });

    els.sidebarToggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.folderDialog?.classList.contains("hidden")) {
        closeFolderDialog(null);
      }
    });
  }

  function initAuth() {
    if (!window.authGuard?.requireLogin({ redirectTo: "index.html" })) return false;
    const token = window.authGuard.getToken();
    const email = decodeJwtEmail(token);
    els.avatarInitials.textContent = initialsFromEmail(email);
    els.avatarEmail.textContent = email;
    return true;
  }

  async function init() {
    if (!initAuth()) return;
    initSidebar();
    bindEvents();
    try {
      await loadData();
    } catch (err) {
      if (els.folderGrid) {
        els.folderGrid.innerHTML = `<div class="projects-session-empty">Could not load projects: ${escapeHtml(err.message)}</div>`;
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
