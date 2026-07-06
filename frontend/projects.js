(function () {
  "use strict";

  const API_BASE = window.authGuard?.API_BASE || window.QUIZALL_API_BASE || "http://localhost:8080";
  const SIDEBAR_PREF_KEY = "quizall.sidebar.open";
  const SIDEBAR_BP_MOBILE = 768;
  const SIDEBAR_BP_TABLET = 1024;

  const state = {
    folders: [],
    projects: [],
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
    sessionList: document.getElementById("sessionList"),
    sessionsSection: document.getElementById("sessionsSection"),
    newFolderBtn: document.getElementById("newFolderBtn"),
    clearFolderFilter: document.getElementById("clearFolderFilter"),
    projectItemMenu: document.getElementById("projectItemMenu"),
    projectMenuRename: document.getElementById("projectMenuRename"),
    projectMenuDelete: document.getElementById("projectMenuDelete"),
    projectMenuMove: document.getElementById("projectMenuMove"),
    folderMoveSubmenu: document.getElementById("folderMoveSubmenu"),
  };

  let projectMenuTargetId = null;
  let projectMenuAnchor = null;

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

  function projectMeta(p) {
    const bits = [];
    if (p.quizCount > 0) bits.push(`${p.quizCount} ${p.quizCount === 1 ? "round" : "rounds"}`);
    else if (p.fileCount > 0) bits.push(`${p.fileCount} ${p.fileCount === 1 ? "file" : "files"}`);
    if (p.latestAccuracy != null && p.quizCount > 0) bits.push(`${p.latestAccuracy}%`);
    return bits.length ? bits.join(" · ") : "Draft session";
  }

  function projectIconId(p) {
    if (p.quizCount > 0) return "i-target";
    if (p.fileCount > 0) return "i-file";
    return "i-notebook";
  }

  function formatDate(dateStr) {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function updateNavCounts() {
    if (els.navHistoryCount) {
      els.navHistoryCount.textContent = state.projects.length ? String(state.projects.length) : "";
    }
    if (els.navProjectsCount) {
      els.navProjectsCount.textContent = state.folders.length ? String(state.folders.length) : "";
    }
  }

  function setActiveFolder(folderId) {
    state.activeFolderId = folderId;
    els.clearFolderFilter?.classList.toggle("hidden", !folderId);
    renderFolders();
    renderSessions();
  }

  function renderFolders() {
    if (!els.folderGrid) return;

    const cards = state.folders.map((folder) => {
      const count = state.projects.filter((p) => p.folderId === folder.id).length;
      const active = state.activeFolderId === folder.id;
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
    document.getElementById("newFolderCard")?.addEventListener("click", createFolder);
  }

  function renderSessions() {
    if (!els.sessionList) return;

    let list = state.projects.slice();
    if (state.activeFolderId) {
      list = list.filter((p) => p.folderId === state.activeFolderId);
    }

    if (!list.length) {
      const msg = state.activeFolderId
        ? "No sessions in this project yet."
        : "No study sessions yet. Start one from Home.";
      els.sessionList.innerHTML = `<div class="projects-session-empty">${msg}</div>`;
      return;
    }

    els.sessionList.innerHTML = list
      .map((p) => {
        const folder = state.folders.find((f) => f.id === p.folderId);
        const folderLabel = folder && !state.activeFolderId
          ? `<span class="session-folder-tag">${escapeHtml(folder.name)}</span>`
          : "";
        return (
          `<div class="projects-session-row">` +
          `<button type="button" class="projects-session-card" data-id="${escapeHtml(p.id)}">` +
          `<span class="session-icon">${icon(projectIconId(p))}</span>` +
          `<span class="session-copy">` +
          `<span class="session-name">${escapeHtml(p.name)}</span>` +
          `<span class="session-meta">${escapeHtml(projectMeta(p))}${folderLabel ? " · " : ""}${folderLabel}</span>` +
          `</span>` +
          `<span class="session-date">${escapeHtml(formatDate(p.updatedAt || p.createdAt))}</span>` +
          `</button>` +
          `<button type="button" class="session-more" data-id="${escapeHtml(p.id)}" aria-label="Session options">` +
          `${icon("i-more-horizontal")}` +
          `</button>` +
          `</div>`
        );
      })
      .join("");

    els.sessionList.querySelectorAll(".projects-session-card").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = `create.html?project=${encodeURIComponent(btn.getAttribute("data-id"))}`;
      });
    });
    els.sessionList.querySelectorAll(".session-more").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const projectId = btn.getAttribute("data-id");
        if (els.projectItemMenu?.classList.contains("hidden") || projectMenuTargetId !== projectId) {
          openProjectMenu(projectId, btn);
        } else {
          closeProjectMenu();
        }
      });
    });
  }

  async function loadData() {
    const [foldersData, projectsData] = await Promise.all([
      api("/api/quiz/folders").catch(() => ({ folders: [] })),
      api("/api/quiz/projects?limit=50"),
    ]);
    state.folders = foldersData.folders || [];
    state.projects = projectsData.projects || [];
    updateNavCounts();
    renderFolders();
    renderSessions();
  }

  async function createFolder() {
    const name = window.prompt("New project name");
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

  function closeProjectMenu() {
    if (!els.projectItemMenu) return;
    els.projectItemMenu.classList.add("hidden");
    els.projectItemMenu.style.top = "";
    els.projectItemMenu.style.left = "";
    projectMenuTargetId = null;
    projectMenuAnchor = null;
    els.folderMoveSubmenu?.classList.add("hidden");
    projectMenuAnchor?.classList.remove("is-open");
  }

  function openProjectMenu(projectId, anchorBtn) {
    if (!els.projectItemMenu || !anchorBtn) return;
    closeProjectMenu();
    projectMenuTargetId = projectId;
    projectMenuAnchor = anchorBtn;
    anchorBtn.classList.add("is-open");
    const rect = anchorBtn.getBoundingClientRect();
    els.projectItemMenu.style.top = `${Math.round(rect.bottom + 6)}px`;
    els.projectItemMenu.style.left = `${Math.max(8, Math.round(rect.right - 168))}px`;
    els.projectItemMenu.classList.remove("hidden");
  }

  async function renameProject(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    const currentName = project?.name || "";
    const nextName = window.prompt("Rename session", currentName);
    if (nextName == null) return;
    const name = nextName.trim();
    if (!name || name.length < 2) return;
    await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    await loadData();
  }

  async function deleteProject(projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    const label = project?.name || "this session";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;
    await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });
    await loadData();
  }

  function renderFolderMoveSubmenu(projectId) {
    if (!els.folderMoveSubmenu) return;
    const items = [
      `<button type="button" class="folder-move-item" data-folder="">Unfiled</button>`,
      ...state.folders.map(
        (f) =>
          `<button type="button" class="folder-move-item" data-folder="${escapeHtml(f.id)}">${escapeHtml(f.name)}</button>`
      ),
    ];
    els.folderMoveSubmenu.innerHTML = items.join("");
    els.folderMoveSubmenu.classList.remove("hidden");
    els.folderMoveSubmenu.querySelectorAll(".folder-move-item").forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const folderId = btn.getAttribute("data-folder") || null;
        try {
          await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
          });
          closeProjectMenu();
          await loadData();
        } catch (err) {
          window.alert(err.message || "Could not move session");
        }
      });
    });
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
      els.sessionsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.location.hash = "sessions";
    });
    els.newFolderBtn?.addEventListener("click", createFolder);
    els.clearFolderFilter?.addEventListener("click", () => setActiveFolder(null));

    els.projectMenuRename?.addEventListener("click", async () => {
      const id = projectMenuTargetId;
      closeProjectMenu();
      if (!id) return;
      try {
        await renameProject(id);
      } catch (err) {
        window.alert(err.message || "Could not rename session");
      }
    });
    els.projectMenuDelete?.addEventListener("click", async () => {
      const id = projectMenuTargetId;
      closeProjectMenu();
      if (!id) return;
      try {
        await deleteProject(id);
      } catch (err) {
        window.alert(err.message || "Could not delete session");
      }
    });
    els.projectMenuMove?.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = projectMenuTargetId;
      if (!id) return;
      if (els.folderMoveSubmenu?.classList.contains("hidden")) {
        renderFolderMoveSubmenu(id);
      } else {
        els.folderMoveSubmenu.classList.add("hidden");
      }
    });
    els.projectItemMenu?.addEventListener("click", (e) => e.stopPropagation());

    els.avatarBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      closeProjectMenu();
      els.avatarMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      els.avatarMenu?.classList.add("hidden");
      closeProjectMenu();
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
      if (e.key === "Escape") closeProjectMenu();
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

    if (window.location.hash === "#sessions") {
      requestAnimationFrame(() => {
        els.sessionsSection?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
