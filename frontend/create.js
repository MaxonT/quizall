(function () {
  "use strict";

  const API_BASE = window.authGuard?.API_BASE || window.QUIZALL_API_BASE || "http://localhost:8080";
  const CONTENT_MIN_LENGTH = 30;
  const TYPE_MIX_KEY = "quizall.typeMix";
  const QUIZ_MODE_KEY = "quizall.quizMode";
  const SIDEBAR_PREF_KEY = "quizall.sidebar.open";
  const SIDEBAR_BP_MOBILE = 768;
  const SIDEBAR_BP_TABLET = 1024;
  const DEFAULT_TYPE_MIX = { mcq: 54, fib: 31, frq: 15, totalQuestions: 13, preset: "balanced" };
  const MIX_PRESETS = {
    balanced: { mcq: 54, fib: 31, frq: 15, label: "Balanced" },
    quiz: { mcq: 65, fib: 25, frq: 10, label: "MCQ+" },
    recall: { mcq: 35, fib: 45, frq: 20, label: "Fill+" },
    essay: { mcq: 30, fib: 20, frq: 50, label: "FRQ+" },
  };

  const state = {
    projectId: null,
    projectName: "",
    analysis: null,
    studyPlan: null,
    pendingFiles: [],
    roundIndex: -1,
    roundResults: [],
    isProcessing: false,
    resumedSession: false,
    materialPreview: "",
    folders: [],
    hasUploadedMaterial: false,
    training: null,
    mindmap: null,
    activeTopicHint: "",
    outlineCandidates: [],
    selectedOutlineFileId: null,
    appSettings: { subscriptionsEnabled: true },
    examPreset: "general",
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
    sidebarScroll: document.getElementById("sidebarScroll"),
    historyList: document.getElementById("historyList"),
    avatarBtn: document.getElementById("avatarBtn"),
    avatarInitials: document.getElementById("avatarInitials"),
    avatarEmail: document.getElementById("avatarEmail"),
    chatMain: document.getElementById("chatMain"),
    viewOnlyBanner: document.getElementById("viewOnlyBanner"),
    viewOnlyNewSession: document.getElementById("viewOnlyNewSession"),
    chatMessages: document.getElementById("chatMessages"),
    chatInner: document.getElementById("chatInner"),
    composerInput: document.getElementById("composerInput"),
    mixBtn: document.getElementById("mixBtn"),
    mixPanel: document.getElementById("mixPanel"),
    mixSummaryBtn: document.getElementById("mixSummaryBtn"),
    mixDetails: document.getElementById("mixDetails"),
    mixPresets: document.getElementById("mixPresets"),
    mixPreview: document.getElementById("mixPreview"),
    mixTotalDisplay: document.getElementById("mixTotalDisplay"),
    mixTotalDown: document.getElementById("mixTotalDown"),
    mixTotalUp: document.getElementById("mixTotalUp"),
    mixMode: document.getElementById("mixMode"),
    mixModeHint: document.getElementById("mixModeHint"),
    composerHint: document.getElementById("composerHint"),
    attachBtn: document.getElementById("attachBtn"),
    sendBtn: document.getElementById("sendBtn"),
    fileInput: null,
    attachmentsBar: document.getElementById("attachmentsBar"),
    avatarMenu: document.getElementById("avatarMenu"),
    projectItemMenu: document.getElementById("projectItemMenu"),
    projectMenuRename: document.getElementById("projectMenuRename"),
    projectMenuDelete: document.getElementById("projectMenuDelete"),
    projectMenuMove: document.getElementById("projectMenuMove"),
    folderMoveSubmenu: document.getElementById("folderMoveSubmenu"),
    nameDialog: document.getElementById("nameDialog"),
    nameDialogTitle: document.getElementById("nameDialogTitle"),
    nameDialogSub: document.getElementById("nameDialogSub"),
    nameDialogInput: document.getElementById("nameDialogInput"),
    nameDialogCancel: document.getElementById("nameDialogCancel"),
    nameDialogConfirm: document.getElementById("nameDialogConfirm"),
    nameDialogClose: document.getElementById("nameDialogClose"),
    sampleLink: document.getElementById("sampleLink"),
    sidebarStreak: document.getElementById("sidebarStreak"),
    sidebarWrongbook: document.getElementById("sidebarWrongbook"),
    wrongbookList: document.getElementById("wrongbookList"),
    wrongbookRefresh: document.getElementById("wrongbookRefresh"),
    sidebarCredits: document.getElementById("sidebarCredits"),
    creditsValue: document.getElementById("creditsValue"),
    creditsBarFill: document.getElementById("creditsBarFill"),
    creditsResetNote: document.getElementById("creditsResetNote"),
    settingsOverlay: document.getElementById("settingsOverlay"),
    settingsBody: document.getElementById("settingsBody"),
    settingsTabTitle: document.getElementById("settingsTabTitle"),
    settingsClose: document.getElementById("settingsClose"),
  };

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

  function isSidebarOpen() {
    if (isMobileSidebar()) return els.sidebar.classList.contains("open");
    return !document.body.classList.contains("sidebar-collapsed");
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
    const next = !isSidebarOpen();
    setSidebarOpen(next, { persist: !isMobileSidebar() });
  }

  function closeSidebarIfMobile() {
    if (isMobileSidebar()) setSidebarOpen(false);
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

  function icon(id, extraClass) {
    return `<svg class="icon${extraClass ? " " + extraClass : ""}"><use href="#${id}"></use></svg>`;
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

  function formatUserError(err) {
    if (window.QuizAllCreateErrors?.formatApiError) {
      return window.QuizAllCreateErrors.formatApiError(err, API_BASE);
    }
    return err?.message || "Something went wrong.";
  }

  async function api(path, options) {
    try {
      const res = await window.authGuard.fetchWithAuth(`${API_BASE}${path}`, options || {});
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        if (res.status === 503) err.code = "SERVICE_UNAVAILABLE";
        if (res.status === 402 || data.code === "TOKEN_EXHAUSTED") err.code = "TOKEN_EXHAUSTED";
        throw err;
      }
      return data;
    } catch (err) {
      if (err.code) throw err;
      const wrapped = new Error(err.message || "Request failed");
      wrapped.code = err.code || (err.message?.includes("无法连接") ? "NETWORK_ERROR" : undefined);
      wrapped.apiBase = err.apiBase || API_BASE;
      throw wrapped;
    }
  }

  function loadTypeMix() {
    try {
      const raw = JSON.parse(localStorage.getItem(TYPE_MIX_KEY) || "null");
      if (raw && typeof raw === "object") {
        const mix = {
          mcq: Number(raw.mcq) || DEFAULT_TYPE_MIX.mcq,
          fib: Number(raw.fib) || DEFAULT_TYPE_MIX.fib,
          frq: Number(raw.frq) || DEFAULT_TYPE_MIX.frq,
          totalQuestions: Math.min(20, Math.max(5, Number(raw.totalQuestions) || DEFAULT_TYPE_MIX.totalQuestions)),
          preset: raw.preset || inferPresetId(raw),
        };
        return mix;
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_TYPE_MIX };
  }

  function inferPresetId(mix) {
    let best = "balanced";
    let bestDist = Infinity;
    for (const [id, preset] of Object.entries(MIX_PRESETS)) {
      const d = Math.abs(preset.mcq - mix.mcq) + Math.abs(preset.fib - mix.fib) + Math.abs(preset.frq - mix.frq);
      if (d < bestDist) {
        bestDist = d;
        best = id;
      }
    }
    return best;
  }

  function applyMixPreset(presetId) {
    const preset = MIX_PRESETS[presetId];
    if (!preset) return;
    const mix = loadTypeMix();
    saveTypeMix({
      ...mix,
      mcq: preset.mcq,
      fib: preset.fib,
      frq: preset.frq,
      preset: presetId,
    });
    updateMixPanelUi();
  }

  function adjustMixTotal(delta) {
    const mix = loadTypeMix();
    const next = Math.min(20, Math.max(5, mix.totalQuestions + delta));
    if (next === mix.totalQuestions) return;
    saveTypeMix({ ...mix, totalQuestions: next });
    updateMixPanelUi();
  }

  function saveTypeMix(mix) {
    localStorage.setItem(TYPE_MIX_KEY, JSON.stringify(mix));
  }

  function loadQuizMode() {
    try {
      const mode = localStorage.getItem(QUIZ_MODE_KEY);
      return mode === "training" ? "training" : "testing";
    } catch {
      return "testing";
    }
  }

  function saveQuizMode(mode) {
    try {
      localStorage.setItem(QUIZ_MODE_KEY, mode === "testing" ? "testing" : "training");
    } catch {
      /* ignore */
    }
  }

  function setQuizMode(mode) {
    const next = mode === "testing" ? "testing" : "training";
    saveQuizMode(next);
    els.mixMode?.querySelectorAll(".mix-mode-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === next);
    });
    if (els.mixDetails) {
      els.mixDetails.classList.toggle("mix-details--testing-only", next === "testing");
    }
    if (els.mixModeHint) {
      els.mixModeHint.textContent =
        next === "training"
          ? "Training: one MCQ at a time with live accuracy."
          : "Testing: full mixed quiz round, then submit.";
    }
    updateMixPanelUi();
  }

  function importanceTag(importance, { always = false } = {}) {
    const raw = String(importance || "").toLowerCase();
    if (raw === "secondary" || raw === "minor") return `<span class="imp-badge imp-secondary">Extra</span>`;
    if (raw === "peripheral" || raw === "edge") return `<span class="imp-badge imp-edge">Later</span>`;
    if (!always) return "";
    return `<span class="imp-badge imp-core">Focus</span>`;
  }

  function sanitizeSessionName(name) {
    return String(name || "")
      .replace(/\.\.\./g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatSessionDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return "";
    }
  }

  function allocateQuestionCounts(total, mix) {
    const weights = [
      { type: "multiple_choice", w: mix.mcq },
      { type: "fill_in_the_blank", w: mix.fib },
      { type: "free_response", w: mix.frq },
    ];
    const minEach = total >= 3 ? 1 : 0;
    let remaining = total - minEach * 3;
    if (remaining < 0) remaining = 0;
    const raw = weights.map((item) => ({
      type: item.type,
      count: minEach,
      frac: (item.w / 100) * remaining,
    }));
    raw.forEach((item) => {
      item.count += Math.floor(item.frac);
    });
    let left = total - raw.reduce((s, item) => s + item.count, 0);
    const byRemainder = raw
      .map((item) => ({ type: item.type, rem: item.frac - Math.floor(item.frac) }))
      .sort((a, b) => b.rem - a.rem);
    for (let i = 0; left > 0; i++) {
      raw.find((r) => r.type === byRemainder[i % byRemainder.length].type).count += 1;
      left -= 1;
    }
    const counts = { mcq: 0, fib: 0, frq: 0 };
    raw.forEach((item) => {
      if (item.type === "multiple_choice") counts.mcq = item.count;
      if (item.type === "fill_in_the_blank") counts.fib = item.count;
      if (item.type === "free_response") counts.frq = item.count;
    });
    return counts;
  }

  function getMixedRoundConfig() {
    const mix = loadTypeMix();
    const total = mix.totalQuestions;
    const counts = allocateQuestionCounts(total, mix);
    const preview = `${counts.mcq} MCQ · ${counts.fib} Fill · ${counts.frq} FRQ`;
    return {
      key: "mixed",
      label: "Mixed Quiz",
      short: "Mixed quiz",
      types: ["multiple_choice", "fill_in_the_blank", "free_response"],
      numQuestions: total,
      typeMix: {
        multiple_choice: counts.mcq,
        fill_in_the_blank: counts.fib,
        free_response: counts.frq,
      },
      preview,
    };
  }

  function setMixPanelExpanded(expanded) {
    els.mixPanel?.classList.toggle("is-expanded", expanded);
    els.mixSummaryBtn?.setAttribute("aria-expanded", expanded ? "true" : "false");
  }

  function closeMixPanel() {
    els.mixPanel?.classList.add("hidden");
    els.mixPanel?.classList.remove("is-expanded");
    els.mixBtn?.classList.remove("is-active");
    els.mixBtn?.setAttribute("aria-expanded", "false");
    els.mixSummaryBtn?.setAttribute("aria-expanded", "false");
  }

  function updateMixPanelUi() {
    const mix = loadTypeMix();
    const quizMode = loadQuizMode();
    const presetId = mix.preset || inferPresetId(mix);
    const presetLabel = MIX_PRESETS[presetId]?.label || "Balanced";
    els.mixPresets?.querySelectorAll(".mix-preset").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-preset") === presetId);
    });
    els.mixMode?.querySelectorAll(".mix-mode-btn").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-mode") === quizMode);
    });
    if (els.mixDetails) {
      els.mixDetails.classList.toggle("mix-details--testing-only", quizMode === "testing");
    }
    if (els.mixTotalDisplay) els.mixTotalDisplay.textContent = String(mix.totalQuestions);
    const counts = getMixedRoundConfig();
    const modeLabel = quizMode === "training" ? "Training" : "Testing";
    const preview =
      quizMode === "training" ? `${modeLabel} · MCQ loop` : `${modeLabel} · ${presetLabel} · ${counts.preview}`;
    if (els.mixPreview) els.mixPreview.textContent = preview;
    if (els.mixBtn) els.mixBtn.title = `Mode: ${preview}`;
  }

  function clearComposerError() {
    if (!els.composerHint) return;
    if (!els.composerHint.classList.contains("is-error")) return;
    els.composerHint.classList.remove("is-error");
    els.composerHint.innerHTML =
      'QuizAll builds a plan, quizzes you in one mixed round, then writes your note. <button type="button" class="hint-link" id="sampleLink">Try a sample</button>';
    const sampleLink = document.getElementById("sampleLink");
    if (sampleLink) {
      sampleLink.addEventListener("click", () => {
        els.composerInput.value = SAMPLE_TEXT;
        autosizeComposer();
        els.composerInput.focus();
        clearComposerError();
      });
    }
  }

  async function buildMaterialContent(text, files) {
    const parts = [];
    const trimmedText = String(text || "").trim();
    if (trimmedText) parts.push(trimmedText);
    for (const file of files) {
      try {
        const extracted = String(await extractText(file) || "").trim();
        if (extracted) parts.push(extracted);
      } catch (err) {
        console.warn("Could not read file:", file.name, err);
      }
    }
    return parts.join("\n\n");
  }

  const YOUTUBE_URL_RE = /(?:youtube\.com\/(?:watch\?[^\s]*v=|embed\/|shorts\/|live\/)|youtu\.be\/)[a-zA-Z0-9_-]{11}/i;

  function isYouTubeUrl(text) {
    const t = String(text || "").trim();
    // Only treat as a YouTube link if the message is essentially just the URL
    return YOUTUBE_URL_RE.test(t) && t.split(/\s+/).length <= 3;
  }

  async function fetchYouTubeTranscript(url) {
    const data = await api("/api/quiz/youtube", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (!data.ok) throw new Error(data.error || "Failed to fetch transcript");
    return data;
  }

  async function validateComposerContent(text, files) {
    const combined = (await buildMaterialContent(text, files)).length;
    return combined >= CONTENT_MIN_LENGTH;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
    });
  }

  function setConversationActive(active) {
    els.chatMain.classList.toggle("has-messages", !!active);
  }

  function refreshComposerDisabled() {
    const disabled = state.isProcessing;
    els.sendBtn.disabled = disabled;
    els.attachBtn.disabled = disabled;
    els.composerInput.disabled = disabled;
    els.composerInput.readOnly = disabled;
    // Mix panel stays usable while a run is in flight (settings are pre-send choices).
    if (els.mixBtn) els.mixBtn.disabled = false;
  }

  function ensureComposerReady() {
    state.isProcessing = false;
    els.composerInput.disabled = false;
    els.composerInput.readOnly = false;
    els.attachBtn.disabled = false;
    els.sendBtn.disabled = false;
    if (els.mixBtn) els.mixBtn.disabled = false;
  }

  function updateComposerPlaceholder() {
    if (!els.composerInput) return;
    els.composerInput.placeholder = state.resumedSession
      ? "Add more material or continue this session…"
      : "Paste study material, or attach files…";
  }

  function setProcessing(on) {
    state.isProcessing = !!on;
    refreshComposerDisabled();
    if (on) closeMixPanel();
  }

  function setResumedSession(on) {
    state.resumedSession = !!on;
    els.viewOnlyBanner?.classList.toggle("hidden", !on);
    const textEl = document.getElementById("viewOnlyBannerText");
    if (textEl) {
      textEl.textContent = on ? "Continuing saved session" : "Viewing a saved session";
    }
    if (on) ensureComposerReady();
    updateComposerPlaceholder();
    refreshComposerDisabled();
  }

  function scheduleChatSave() {
    if (!state.projectId || !window.QuizAllTranscript) return;
    window.QuizAllTranscript.scheduleTranscriptSave(api, state.projectId, els.chatInner, state.training);
  }

  async function refreshCredits() {
    if (!els.creditsValue) return;
    window.QuizAllCreateApi?.invalidateUsageCache?.();
    try {
      const status = await api("/api/billing/status");
      const c = status.credits;
      if (!c) {
        const tokens = status.tokens?.total ?? 0;
        els.creditsValue.textContent = `${Math.floor(tokens / 1000)} cr`;
        return;
      }
      const balance = c.balance ?? 0;
      const allowance = c.dailyAllowance ?? 80;
      els.creditsValue.textContent = `${balance} / ${allowance}`;
      const pct = allowance > 0 ? Math.min(100, Math.round((balance / allowance) * 100)) : 0;
      if (els.creditsBarFill) {
        els.creditsBarFill.style.width = `${pct}%`;
        els.creditsBarFill.classList.toggle("is-low", balance < 10);
      }
      if (els.creditsResetNote && (c.nextResetAt || status.nextResetAt)) {
        const dt = new Date(c.nextResetAt || status.nextResetAt);
        els.creditsResetNote.textContent = `Resets ${dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      }
      els.sidebarCredits?.classList.toggle("is-empty", balance <= 0);
      if (balance <= 0 && els.composerInput) {
        els.composerInput.placeholder = "No credits left — upgrade or wait for daily refresh";
      }
    } catch {
      els.creditsValue.textContent = "— / —";
    }
  }

  function showCreditToast(amount, label) {
    if (!amount || amount <= 0) return;
    let toast = document.getElementById("creditToast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "creditToast";
      toast.className = "credit-toast";
      document.body.appendChild(toast);
    }
    toast.textContent = `−${amount} Credits · ${label || "Usage"}`;
    toast.classList.add("is-visible");
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.classList.remove("is-visible"), 2800);
  }

  async function handleCreditResponse(data, label) {
    if (data?.creditsDebited) showCreditToast(data.creditsDebited, label);
    await refreshCredits();
  }

  function appendMessage(role, html, msgType = "message") {
    const wrap = document.createElement("div");
    wrap.className = `msg ${role}`;
    wrap.dataset.ts = String(Date.now());
    wrap.dataset.msgType = msgType;
    const avatar =
      role === "ai"
        ? `<div class="msg-avatar">${icon("i-sparkles")}</div>`
        : `<div class="msg-avatar">You</div>`;

    if (role === "user") {
      // Extract plain text for later editing
      const tmp = document.createElement("div");
      tmp.innerHTML = html;
      const rawText = tmp.textContent || tmp.innerText || "";
      wrap.dataset.rawText = rawText;

      const editBtn =
        `<button type="button" class="msg-edit-btn" aria-label="Edit message">` +
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L8.5 11.5 7 16l4.5-1.5z"/><path d="m15 5 4 4"/>` +
        `</svg>Edit</button>`;
      wrap.innerHTML = `${avatar}<div class="msg-user-content"><div class="msg-bubble">${html}</div>${editBtn}</div>`;

      wrap.querySelector(".msg-edit-btn").addEventListener("click", () => activateMessageEdit(wrap));
    } else {
      wrap.innerHTML = `${avatar}<div class="msg-bubble">${html}</div>`;
    }

    els.chatInner.appendChild(wrap);
    scrollToBottom();
    scheduleChatSave();
    return wrap;
  }

  function activateMessageEdit(wrapEl) {
    if (state.isProcessing) return;
    const bubble = wrapEl.querySelector(".msg-bubble");
    if (!bubble) return;

    const originalHtml = bubble.innerHTML;
    const rawText = wrapEl.dataset.rawText || bubble.textContent.trim();

    bubble.innerHTML =
      `<div class="msg-edit-area">` +
      `<textarea class="msg-edit-textarea" rows="3" maxlength="8000">${escapeHtml(rawText)}</textarea>` +
      `<div class="msg-edit-actions">` +
      `<button class="msg-edit-cancel" type="button">Cancel</button>` +
      `<button class="msg-edit-save" type="button">Send</button>` +
      `</div></div>`;

    const textarea = bubble.querySelector(".msg-edit-textarea");
    // Auto-grow
    textarea.addEventListener("input", () => {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
    });
    // Set initial height
    textarea.style.height = Math.min(textarea.scrollHeight, 220) + "px";
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);

    bubble.querySelector(".msg-edit-cancel").addEventListener("click", () => {
      bubble.innerHTML = originalHtml;
    });

    const doSave = () => {
      const newText = textarea.value.trim();
      if (!newText) return;

      // Remove this message and everything after it from the DOM
      const allMsgs = [...els.chatInner.querySelectorAll(".msg")];
      const idx = allMsgs.indexOf(wrapEl);
      if (idx >= 0) allMsgs.slice(idx).forEach((m) => m.remove());

      // Reset flow state but keep project & uploaded files
      state.studyPlan = null;
      state.analysis = null;
      state.roundIndex = -1;
      state.roundResults = [];
      state.training = null;
      state.activeTopicHint = "";

      // If we already have a project, mark as resumed so handleSend reuses it
      if (state.projectId) setResumedSession(true);

      // Inject the edited text into the composer and submit
      els.composerInput.value = newText;
      autosizeComposer();
      handleSend();
    };

    bubble.querySelector(".msg-edit-save").addEventListener("click", doSave);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        doSave();
      }
      if (e.key === "Escape") {
        bubble.innerHTML = originalHtml;
      }
    });
  }

  function appendTyping(label) {
    const wrap = document.createElement("div");
    wrap.className = "msg ai";
    const labelHtml = label
      ? `<p class="typing-label">${escapeHtml(label)}</p>`
      : "";
    wrap.innerHTML =
      `<div class="msg-avatar">${icon("i-sparkles")}</div>` +
      `<div class="msg-bubble">${labelHtml}<div class="typing-indicator" aria-live="polite"><span></span><span></span><span></span></div></div>`;
    els.chatInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function removeTyping(node) {
    if (node && node.parentNode) node.parentNode.removeChild(node);
  }

  function appendErrorWithRetry(message, retryAction) {
    const display = String(message || "").startsWith("Sorry,") ? message : `Sorry, ${formatUserError({ message })}`;
    const html =
      `<p>${escapeHtml(display)}</p>` +
      `<button type="button" class="btn-round retry-btn" data-retry="${escapeHtml(retryAction)}">Try again</button>`;
    const msg = appendMessage("ai", html);
    bindRetryButton(msg.querySelector(".retry-btn"), retryAction);
    return msg;
  }

  function bindRetryButton(btn, retryAction) {
    if (!btn || btn.dataset.bound) return;
    btn.dataset.bound = "1";
    const action = retryAction || btn.getAttribute("data-retry");
    btn.addEventListener("click", async (e) => {
      if (state.isProcessing) return;
      e.currentTarget.disabled = true;
      const wrap = e.currentTarget.closest(".msg");
      if (wrap) wrap.remove();
      await handleRetry(action);
    });
  }

  async function handleRetry(action) {
    if (state.isProcessing) return;
    if (action === "retry-plan") {
      if (!state.projectId) return;
      setProcessing(true);
      await runStudyPlan(state.projectId, state.materialPreview);
      return;
    }
    if (action === "retry-quiz") {
      if (!state.projectId || !state.studyPlan) return;
      setProcessing(true);
      await startQuizFlow();
      return;
    }
    if (action === "retry-note") {
      if (!state.projectId) return;
      setProcessing(true);
      await finishAllRounds();
    }
  }

  function renderWelcome() {
    els.chatInner.innerHTML = "";
    setConversationActive(false);
  }

  function formatSessionFooter(plan) {
    if (!state.hasUploadedMaterial || !plan?.progress) return "";
    const p = plan.progress;
    const pct = p.overall_percent != null ? Math.round(Number(p.overall_percent)) : null;
    const currentTitle = p.current_lecture?.title || "";
    const bar =
      pct != null
        ? `<div class="plan-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><span class="plan-progress-fill" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`
        : "";
    const metaBits = [];
    if (pct != null) metaBits.push(`${pct}% complete`);
    if (currentTitle) metaBits.push(`Now: ${escapeHtml(currentTitle)}`);
    const meta = metaBits.length ? `<p class="plan-progress-meta">${metaBits.join(" · ")}</p>` : "";
    const completed = (p.completed_lectures || [])
      .map((lec) => `<li>${escapeHtml(lec.title)}${lec.citation ? ` <span class="citation">${escapeHtml(lec.citation)}</span>` : ""}</li>`)
      .join("");
    const phases = (p.phases || [])
      .map((ph) => {
        const status = ph.status === "active" ? "Now" : ph.status === "done" ? "Done" : "Next";
        return (
          `<tr class="phase-${escapeHtml(ph.status || "upcoming")}">` +
          `<td>${escapeHtml(ph.phase || "")}</td>` +
          `<td>${escapeHtml(ph.title || "")}</td>` +
          `<td>${escapeHtml(ph.goal || "")}</td>` +
          `<td>${status}</td>` +
          `</tr>`
        );
      })
      .join("");
    const extraInner =
      (completed ? `<div class="session-footer-label">Done</div><ul>${completed}</ul>` : "") +
      (phases
        ? `<table class="plan-phase-table"><thead><tr><th>Phase</th><th>Topic</th><th>Goal</th><th></th></tr></thead><tbody>${phases}</tbody></table>`
        : "");
    const extra = extraInner
      ? `<details class="plan-fold"><summary>Progress details</summary><div class="plan-fold-body">${extraInner}</div></details>`
      : "";
    if (!bar && !meta && !extra) return "";
    return `<div class="plan-progress">${bar}${meta}${extra}</div>`;
  }

  function formatComparisonTables(plan) {
    const rows = (plan.comparisons || []).slice(0, 3);
    if (!rows.length) return "";
    return rows
      .map((cmp) => {
        const tableRows = (cmp.rows || [])
          .slice(0, 7)
          .map(
            (row, ri) =>
              `<tr>${(Array.isArray(row) ? row : []).map((cell) => (ri === 0 ? `<th>${escapeHtml(cell)}</th>` : `<td>${escapeHtml(cell)}</td>`)).join("")}</tr>`
          )
          .join("");
        return (
          `<div class="compare-block">` +
          `<p class="compare-title">${escapeHtml(cmp.a || "A")} vs ${escapeHtml(cmp.b || "B")}</p>` +
          `<table class="compare-table">${tableRows}</table>` +
          `</div>`
        );
      })
      .join("");
  }

  function formatStudyPlanHtml(plan) {
    const stepItems = plan.plan || [];
    const steps = stepItems
      .map(
        (step, i) =>
          `<li>` +
          `<span class="step-title">${i + 1}. ${importanceTag(step.importance)}${escapeHtml(step.title)}</span>` +
          `<span class="step-why">${escapeHtml(step.why || "")}</span>` +
          (step.estimated_minutes ? ` <span class="step-min">${step.estimated_minutes} min</span>` : "") +
          `</li>`
      )
      .join("");
    const conceptItems = (plan.key_concepts || []).slice(0, 6);
    const concepts = conceptItems
      .map(
        (k) =>
          `<li>` +
          `<strong>${importanceTag(k.importance)}${escapeHtml(k.concept)}</strong>` +
          (k.detail ? `<span class="concept-detail">${escapeHtml(k.detail)}</span>` : "") +
          `</li>`
      )
      .join("");
    const topics = (plan.topics || [])
      .slice(0, 8)
      .map((t) => `<span class="topic-tag">${escapeHtml(t)}</span>`)
      .join("");
    const comparisons = formatComparisonTables(plan);
    const conceptFold = concepts
      ? `<details class="plan-fold"><summary>Key ideas · ${conceptItems.length}</summary><ul class="plan-concepts">${concepts}</ul></details>`
      : "";
    const compareCount = (plan.comparisons || []).length;
    const compareFold = comparisons
      ? `<details class="plan-fold"><summary>Compare · ${Math.min(3, compareCount)}</summary><div class="plan-fold-body">${comparisons}</div></details>`
      : "";
    return (
      `<div class="study-plan-card">` +
      `<h3>Your study plan</h3>` +
      `<p class="plan-subject">${escapeHtml(plan.subject || "General")}</p>` +
      `<p class="plan-summary">${escapeHtml(plan.summary || "Here is a simple plan based on your material.")}</p>` +
      (topics ? `<div class="topic-tags">${topics}</div>` : "") +
      (steps ? `<ol class="plan-steps">${steps}</ol>` : "") +
      conceptFold +
      compareFold +
      formatSessionFooter(plan) +
      `</div>`
    );
  }

  function formatNoteHtml(note) {
    const list = (items) => (items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
    return (
      `<h3>Your study note</h3>` +
      `<p>${escapeHtml(note.summary || "")}</p>` +
      `<div class="note-section-label">What you know</div><ul class="note-list">${list(note.what_you_know)}</ul>` +
      `<div class="note-section-label">What to review</div><ul class="note-list">${list(note.what_to_review)}</ul>` +
      `<div class="note-section-label">Key takeaways</div><ul class="note-list">${list(note.key_takeaways)}</ul>` +
      `<p class="meta-line"><button type="button" class="btn-text share-session-btn">Share results</button></p>` +
      `<p class="science-link-wrap">Curious why this method works? <a href="science/index.html" target="_blank" rel="noopener noreferrer" class="science-link">See the science →</a></p>`
    );
  }

  function normalizeType(type) {
    const raw = String(type || "").toLowerCase().replace(/[\s-]+/g, "_");
    if (raw === "mcq") return "multiple_choice";
    if (raw === "fib" || raw === "fill_in_blank") return "fill_in_the_blank";
    if (raw === "frq" || raw === "short_answer") return "free_response";
    return raw || "multiple_choice";
  }

  function normalizeQuestion(q) {
    const type = normalizeType(q.type);
    let options = null;
    if (type === "multiple_choice") {
      options = (Array.isArray(q.options) ? q.options : []).map(String);
      if (options.length < 2) options = ["Option A", "Option B", "Option C", "Option D"];
    }
    let correct = q.correct_answer ?? q.correctAnswer ?? "";
    if (type === "multiple_choice") {
      const n = Number.parseInt(String(correct), 10);
      correct = Number.isInteger(n) ? n : 0;
    } else {
      correct = String(correct || "").trim();
    }
    return {
      type,
      question: String(q.question || q.text || "Question"),
      options,
      correct_answer: correct,
      explanation: String(q.explanation || ""),
    };
  }

  function buildAnswerHtml(question, index) {
    if (question.type === "multiple_choice") {
      return question.options
        .map((opt, oi) => {
          const label = String.fromCharCode(65 + oi);
          return `<button type="button" class="option-btn" data-q="${index}" data-o="${oi}"><span class="opt-key">${label}</span><span>${escapeHtml(opt)}</span></button>`;
        })
        .join("");
    }
    if (question.type === "fill_in_the_blank") {
      return `<input class="fill-input" data-q="${index}" placeholder="Type your answer" />`;
    }
    return `<textarea class="free-input" data-q="${index}" placeholder="Write your answer in simple words"></textarea>`;
  }

  function renderQuizCard(roundConfig, questions, onSubmit) {
    const cardId = `quiz-${Date.now()}`;
    const questionsHtml = questions
      .map((rawQ, i) => {
        const nq = normalizeQuestion(rawQ);
        return (
          `<div class="quiz-question" data-qi="${i}">` +
          `<div class="q-label">Q${i + 1}</div>` +
          `<p class="q-text">${escapeHtml(nq.question)}</p>` +
          `<div class="answers">${buildAnswerHtml(nq, i)}</div>` +
          `</div>`
        );
      })
      .join("");

    const html =
      `<h3>${escapeHtml(roundConfig.label)}</h3>` +
      `<p class="meta-line">Answer every question, then submit.</p>` +
      `<div class="quiz-card" id="${cardId}">` +
      `<div class="quiz-card-head">${icon("i-sparkles")} ${questions.length} questions</div>` +
      questionsHtml +
      `<button type="button" class="btn-round" data-submit="${cardId}">Submit round ${icon("i-arrow-right")}</button>` +
      `</div>`;

    const msg = appendMessage("ai", html);
    const card = msg.querySelector(`#${cardId}`);
    const answers = {};

    card.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const qi = btn.getAttribute("data-q");
        card.querySelectorAll(`.option-btn[data-q="${qi}"]`).forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
        answers[qi] = Number(btn.getAttribute("data-o"));
      });
    });

    const submitBtn = card.querySelector(`[data-submit="${cardId}"]`);
    submitBtn.addEventListener("click", () => {
      questions.forEach((_, i) => {
        if (answers[i] != null) return;
        const fill = card.querySelector(`.fill-input[data-q="${i}"]`);
        const free = card.querySelector(`.free-input[data-q="${i}"]`);
        if (fill) answers[i] = fill.value;
        if (free) answers[i] = free.value;
      });
      const missing = questions.findIndex((_, i) => answers[i] == null || String(answers[i]).trim() === "");
      if (missing >= 0) {
        submitBtn.textContent = `Answer Q${missing + 1} first`;
        setTimeout(() => {
          submitBtn.innerHTML = `Submit round ${icon("i-arrow-right")}`;
        }, 1600);
        return;
      }
      submitBtn.disabled = true;
      card.querySelectorAll(".option-btn, .fill-input, .free-input").forEach((el) => {
        el.style.pointerEvents = "none";
      });
      onSubmit(answers);
    });
  }

  function evaluateAnswer(question, userAnswer) {
    if (question.type === "multiple_choice") {
      return Number(userAnswer) === Number(question.correct_answer);
    }
    const user = String(userAnswer || "").trim().toLowerCase();
    const expected = String(question.correct_answer || "").trim().toLowerCase();
    if (!user || !expected) return false;
    if (question.type === "free_response") {
      const tokens = expected.split(/\s+/).filter((t) => t.length >= 4);
      if (!tokens.length) return user === expected;
      const hits = tokens.filter((t) => user.includes(t)).length;
      return hits >= Math.max(1, Math.ceil(tokens.length * 0.5));
    }
    return user === expected;
  }

  function displayAnswer(question, val) {
    if (question.type === "multiple_choice") {
      const i = Number(val);
      if (Array.isArray(question.options) && question.options[i] != null) {
        return `${String.fromCharCode(65 + i)}. ${question.options[i]}`;
      }
      return "(no answer)";
    }
    const s = String(val ?? "").trim();
    return s || "(no answer)";
  }

  function buildReviewItemsHtml(results) {
    return results
      .map((r) => {
        const cls = r.isCorrect ? "correct" : "wrong";
        const badge = r.isCorrect
          ? `<span class="review-badge correct">${icon("i-check")} Correct</span>`
          : `<span class="review-badge wrong">${icon("i-x")} Missed</span>`;
        const yourRow = `<div class="review-row"><span class="k">Your answer</span><span class="v ${r.isCorrect ? "good" : "bad"}">${escapeHtml(displayAnswer(r, r.userAnswer))}</span></div>`;
        const correctRow = r.isCorrect
          ? ""
          : `<div class="review-row"><span class="k">Correct answer</span><span class="v good">${escapeHtml(displayAnswer(r, r.correct_answer))}</span></div>`;
        const explain = r.explanation
          ? `<div class="review-explain">${escapeHtml(r.explanation)}</div>`
          : "";
        return (
          `<div class="review-item ${cls}">` +
          `<div class="review-head">${badge}<span class="review-q">${escapeHtml(r.question)}</span></div>` +
          yourRow +
          correctRow +
          explain +
          `</div>`
        );
      })
      .join("");
  }

  function historyRoundTitle(roundLabel) {
    const label = String(roundLabel || "Quiz round").trim();
    if (/round\s*\d/i.test(label)) {
      const match = label.match(/round\s*\d+/i);
      if (match) return `${match[0]} results`;
    }
    return label;
  }

  function normalizeHistoryQuestions(questions) {
    return (questions || []).map((q) => {
      const type = normalizeType(q.type);
      let options = null;
      if (type === "multiple_choice") {
        options = (Array.isArray(q.options) ? q.options : []).map(String);
      }
      let correct = q.correct_answer ?? q.correctAnswer ?? "";
      if (type === "multiple_choice") {
        const n = Number.parseInt(String(correct), 10);
        correct = Number.isInteger(n) ? n : 0;
      } else {
        correct = String(correct || "").trim();
      }
      return {
        type,
        question: String(q.question || ""),
        options,
        correct_answer: correct,
        userAnswer: q.userAnswer ?? q.user_answer ?? "",
        isCorrect: Boolean(q.isCorrect ?? q.is_correct),
        explanation: String(q.explanation || ""),
      };
    });
  }

  function formatHistoryRoundHtml(roundLabel, correct, total, results) {
    return (
      `<h3>${escapeHtml(historyRoundTitle(roundLabel))}</h3>` +
      `<div class="review-score"><span class="num">${correct}/${total}</span><span class="lbl">correct</span></div>` +
      `<button type="button" class="btn-text history-toggle" aria-expanded="false">Show details</button>` +
      `<div class="review-list history-details hidden">${buildReviewItemsHtml(results)}</div>`
    );
  }

  function bindHistoryRoundToggle(msg) {
    const toggle = msg.querySelector(".history-toggle");
    const details = msg.querySelector(".history-details");
    if (!toggle || !details) return;
    toggle.addEventListener("click", () => {
      const collapsed = details.classList.toggle("hidden");
      toggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      toggle.textContent = collapsed ? "Show details" : "Hide details";
    });
  }

  function renderRoundReview(roundConfig, results, correct, total, isLast, onProceed) {
    const items = buildReviewItemsHtml(results);

    const proceedLabel = isLast
      ? `Write my note ${icon("i-arrow-right")}`
      : `Continue ${icon("i-arrow-right")}`;

    const html =
      `<h3>${escapeHtml(roundConfig.short)} results</h3>` +
      `<div class="review-score"><span class="num">${correct}/${total}</span><span class="lbl">correct</span></div>` +
      `<div class="review-list">${items}</div>` +
      `<button type="button" class="btn-round" id="proceedBtn">${proceedLabel}</button>`;

    const msg = appendMessage("ai", html);
    const btn = msg.querySelector("#proceedBtn");
    btn.addEventListener("click", () => {
      btn.disabled = true;
      onProceed();
    });
  }

  async function loadHistorySidebar() {
    try {
      const [projectsData, foldersData] = await Promise.all([
        api("/api/quiz/projects?limit=50"),
        api("/api/quiz/folders").catch(() => ({ folders: [] })),
      ]);
      const projects = projectsData.projects || [];
      state.folders = foldersData.folders || [];

      if (els.navHistoryCount) {
        els.navHistoryCount.textContent = projects.length ? String(projects.length) : "";
      }
      if (els.navProjectsCount) {
        els.navProjectsCount.textContent = state.folders.length ? String(state.folders.length) : "";
      }

      if (!els.historyList) return;

      if (!projects.length) {
        els.historyList.innerHTML =
          '<div class="project-empty">No sessions yet.<br>Start one from Home.</div>';
        return;
      }

      els.historyList.innerHTML = projects.map(renderHistoryRow).join("");
      bindHistoryListEvents();
    } catch (err) {
      console.error(err);
    }
  }

  function projectMeta(p) {
    const bits = [];
    const date = formatSessionDate(p.updatedAt || p.createdAt);
    if (date) bits.push(date);
    if (p.quizCount > 0) bits.push(`${p.quizCount} ${p.quizCount === 1 ? "round" : "rounds"}`);
    else if (p.fileCount > 0) bits.push(`${p.fileCount} ${p.fileCount === 1 ? "file" : "files"}`);
    if (p.latestAccuracy != null && p.quizCount > 0) bits.push(`${p.latestAccuracy}%`);
    return bits.length ? bits.join(" · ") : "Draft";
  }

  function projectIconId(p) {
    if (p.quizCount > 0) return "i-target";
    if (p.fileCount > 0) return "i-file";
    return "i-notebook";
  }

  let projectMenuTargetId = null;
  let projectMenuAnchor = null;
  let nameDialogResolver = null;

  function closeProjectMenu() {
    if (!els.projectItemMenu) return;
    els.projectItemMenu.classList.add("hidden");
    els.projectItemMenu.style.top = "";
    els.projectItemMenu.style.left = "";
    if (projectMenuAnchor) projectMenuAnchor.classList.remove("is-open");
    projectMenuTargetId = null;
    projectMenuAnchor = null;
    els.folderMoveSubmenu?.classList.add("hidden");
    els.historyList?.querySelectorAll(".project-row.menu-open").forEach((row) => row.classList.remove("menu-open"));
  }

  function openProjectMenu(projectId, anchorBtn) {
    if (!els.projectItemMenu || !anchorBtn) return;
    closeProjectMenu();
    projectMenuTargetId = projectId;
    projectMenuAnchor = anchorBtn;
    anchorBtn.classList.add("is-open");
    anchorBtn.closest(".project-row")?.classList.add("menu-open");

    const rect = anchorBtn.getBoundingClientRect();
    els.projectItemMenu.style.top = `${Math.round(rect.bottom + 6)}px`;
    els.projectItemMenu.style.left = `${Math.max(8, Math.round(rect.right - 168))}px`;
    els.projectItemMenu.classList.remove("hidden");
  }

  function closeNameDialog(value) {
    els.nameDialog?.classList.add("hidden");
    els.nameDialog?.setAttribute("aria-hidden", "true");
    if (nameDialogResolver) {
      const resolve = nameDialogResolver;
      nameDialogResolver = null;
      resolve(value);
    }
  }

  function openNameDialog({ title, subtitle, value, confirmLabel = "Save" }) {
    return new Promise((resolve) => {
      if (!els.nameDialog || !els.nameDialogInput) {
        resolve(null);
        return;
      }
      nameDialogResolver = resolve;
      els.nameDialogTitle.textContent = title;
      els.nameDialogSub.textContent = subtitle || "";
      els.nameDialogSub.style.display = subtitle ? "" : "none";
      els.nameDialogInput.value = value || "";
      els.nameDialogConfirm.textContent = confirmLabel;
      els.nameDialog.classList.remove("hidden");
      els.nameDialog.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => {
        els.nameDialogInput.focus();
        els.nameDialogInput.select();
      });
    });
  }

  async function renameProject(projectId) {
    const rowBtn = els.historyList?.querySelector(`.project-session[data-id="${CSS.escape(projectId)}"]`);
    const currentName = rowBtn?.querySelector("span:not(.nav-count)")?.textContent?.trim() || "";
    const nextName = await openNameDialog({
      title: "Rename session",
      subtitle: "Give this study session a name you'll recognize later.",
      value: currentName,
      confirmLabel: "Save",
    });
    if (nextName == null) return;
    const name = nextName.trim();
    if (!name || name.length < 2) return;

    await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (state.projectId === projectId) state.projectName = name;
    await loadHistorySidebar();
  }

  async function deleteProject(projectId) {
    const rowBtn = els.historyList?.querySelector(`.project-session[data-id="${CSS.escape(projectId)}"]`);
    const label = rowBtn?.querySelector("span:not(.nav-count)")?.textContent?.trim() || "this session";
    if (!window.confirm(`Delete "${label}"? This cannot be undone.`)) return;

    await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" });

    if (state.projectId === projectId) resetNewChat();
    else await loadHistorySidebar();
  }

  function bindHistoryListEvents() {
    if (!els.historyList) return;
    els.historyList.querySelectorAll(".project-session").forEach((btn) => {
      btn.addEventListener("click", () => openProject(btn.getAttribute("data-id")));
    });
    els.historyList.querySelectorAll(".project-more").forEach((btn) => {
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

  function renderHistoryRow(p) {
    const active = p.id === state.projectId;
    return (
      `<div class="project-row${active ? " is-active" : ""}">` +
      `<button type="button" class="nav-item project-session${active ? " is-active" : ""}" data-id="${escapeHtml(p.id)}">` +
      icon(projectIconId(p)) +
      `<span class="session-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</span>` +
      `<span class="nav-count project-meta">${escapeHtml(projectMeta(p))}</span>` +
      `</button>` +
      `<button type="button" class="project-more" data-id="${escapeHtml(p.id)}" aria-label="Session options" title="Session options">` +
      `<svg class="icon"><use href="#i-more-horizontal"></use></svg>` +
      `</button>` +
      `</div>`
    );
  }

  async function moveProjectToFolder(projectId, folderId) {
    await api(`/api/quiz/projects/${encodeURIComponent(projectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderId: folderId || null }),
    });
    closeProjectMenu();
    await loadHistorySidebar();
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
          await moveProjectToFolder(projectId, folderId);
        } catch (err) {
          window.alert(err.message || "Could not move session");
        }
      });
    });
  }

  function focusHistorySidebar() {
    setActiveNav("navHistory");
    setSidebarOpen(true);
    els.sidebarScroll?.scrollTo({ top: 0, behavior: "smooth" });
    els.historyList?.classList.add("history-highlight");
    window.setTimeout(() => els.historyList?.classList.remove("history-highlight"), 900);
  }

  const SAMPLE_TEXT =
    "Photosynthesis is how plants make their own food. " +
    "Plants take in sunlight, water, and carbon dioxide (a gas in the air). " +
    "Inside the leaves, tiny parts called chloroplasts use the sunlight to turn water and carbon dioxide into glucose (a sugar) and oxygen. " +
    "The plant uses the glucose for energy to grow, and it releases the oxygen into the air, which is what we breathe. " +
    "This mostly happens in the leaves, and the green color comes from a pigment called chlorophyll.";

  function autoProjectName() {
    const d = new Date();
    return `Study · ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;    
  }

  async function createProject(name) {
    const data = await api("/api/quiz/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    return data.project;
  }

  let pdfLibPromise = null;
  function loadPdfJs() {
    if (pdfLibPromise) return pdfLibPromise;
    pdfLibPromise = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
        resolve(window.pdfjsLib);
      };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return pdfLibPromise;
  }

  let mammothPromise = null;
  function loadMammoth() {
    if (mammothPromise) return mammothPromise;
    mammothPromise = new Promise((resolve, reject) => {
      if (window.mammoth) return resolve(window.mammoth);
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js";
      script.onload = () => resolve(window.mammoth);
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return mammothPromise;
  }

  async function extractText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (["txt", "md", "csv", "json"].includes(ext)) return file.text();
    if (ext === "docx") {
      const mammoth = await loadMammoth();
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return result.value || "";
    }
    if (ext === "pdf") {
      const lib = await loadPdfJs();
      const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
      let text = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item) => item.str).join(" ") + "\n";
      }
      return text;
    }
    return file.text();
  }

  async function uploadFilesToProject(projectId, files) {
    const payload = [];
    const skipped = [];
    for (const file of files) {
      try {
        const text = String(await extractText(file) || "").trim();
        if (text) {
          payload.push({ name: file.name, mimeType: file.type || "application/octet-stream", text });
        } else {
          skipped.push(file.name);
        }
      } catch {
        skipped.push(file.name);
      }
    }
    if (!payload.length) {
      const hint = skipped.length
        ? "Couldn't read text from those files. Try PDF, DOCX, TXT, or paste the content directly."
        : "No readable files to upload.";
      throw new Error(hint);
    }
    const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: payload }),
    });
    return { files: data.files || [], skipped };
  }

  function renderAttachmentsBar() {
    if (!state.pendingFiles.length) {
      els.attachmentsBar.innerHTML = "";
      return;
    }
    els.attachmentsBar.innerHTML = state.pendingFiles
      .map(
        (f, i) =>
          `<span class="attachment-chip">` +
          `${icon("i-paperclip")} <span class="attachment-name">${escapeHtml(f.name)}</span>` +
          `<button type="button" class="attachment-remove" data-index="${i}" aria-label="Remove ${escapeHtml(f.name)}">` +
          `<svg class="icon"><use href="#i-x"></use></svg></button>` +
          `</span>`
      )
      .join("");
    els.attachmentsBar.querySelectorAll(".attachment-remove").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const idx = Number(btn.getAttribute("data-index"));
        if (Number.isNaN(idx)) return;
        state.pendingFiles.splice(idx, 1);
        renderAttachmentsBar();
      });
    });
  }

  async function runStudyPlan(projectId, contentHint, options = {}) {
    const skipQuiz = !!options.skipQuiz;
    const planContent =
      contentHint && String(contentHint).trim().length >= CONTENT_MIN_LENGTH ? contentHint : undefined;
    const typing = appendTyping("Building your study plan…");
    try {
      const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/study-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: planContent }),
      });
      removeTyping(typing);
      state.studyPlan = data.studyPlan;
      state.analysis = data.analysis;
      state.hasUploadedMaterial = !!data.hasUploadedMaterial;
      if (data.studyPlan?.session_name) {
        state.projectName = sanitizeSessionName(data.studyPlan.session_name);
      }
      appendMessage("ai", formatStudyPlanHtml(data.studyPlan));
      await handleCreditResponse(data, "Study plan");
      await loadHistorySidebar();
      if (state.hasUploadedMaterial && !skipQuiz) {
        await tryBuildExamMap(projectId);
      }
      if (skipQuiz) {
        appendMessage(
          "ai",
          `<p class="meta-line">Material updated. Keep chatting below, or tap <strong>Quiz me again</strong> when you want another round.</p>`
        );
        setProcessing(false);
        return;
      }
      if (!skipQuiz) {
        const allowed = await checkUsageGate();
        if (!allowed) {
          setProcessing(false);
          return;
        }
        await startQuizFlow();
      }
    } catch (err) {
      removeTyping(typing);
      appendErrorWithRetry(`Sorry, I couldn't make a study plan: ${formatUserError(err)}`, "retry-plan");
      setProcessing(false);
    }
  }

  function getTrainingTopicHint() {
    if (state.activeTopicHint) return state.activeTopicHint;
    if (state.mindmap && window.QuizAllMindmap?.pickWeakTopic) {
      const fromMap = window.QuizAllMindmap.pickWeakTopic(state.mindmap);
      if (fromMap) return fromMap;
    }
    return (
      state.studyPlan?.progress?.current_lecture?.title ||
      state.studyPlan?.topics?.[state.training?.total % (state.studyPlan?.topics?.length || 1)] ||
      state.studyPlan?.topics?.[0] ||
      ""
    );
  }

  async function saveMindmapToServer(mindmap) {
    if (!state.projectId || !mindmap) return;
    await api(`/api/quiz/projects/${encodeURIComponent(state.projectId)}/mindmap`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mindmap, examTopics: mindmap.title || "Updated topics" }),
    });
    state.mindmap = mindmap;
  }

  function appendMindmapMessage(mindmap) {
    if (!mindmap || !window.QuizAllMindmap?.createMindmapArtifact) return;
    const wrap = document.createElement("div");
    wrap.className = "msg ai";
    wrap.innerHTML = `<div class="msg-avatar">${icon("i-sparkles")}</div><div class="msg-bubble"></div>`;
    const bubble = wrap.querySelector(".msg-bubble");
    const handlers = {
      escapeHtml,
      icon,
      onSave: (map) => saveMindmapToServer(map),
      onStartQuiz: async () => {
        if (state.isProcessing) return;
        setProcessing(true);
        await startQuizFlow();
      },
      onTopicSelect: (topic) => {
        state.activeTopicHint = topic;
      },
    };
    const { element } = window.QuizAllMindmap.createMindmapArtifact(mindmap, handlers);
    bubble.appendChild(element);
    els.chatInner.appendChild(wrap);
    scrollToBottom();
    scheduleChatSave();
  }

  async function appendMindmapWithMastery(mindmap, projectId) {
    let map = mindmap;
    const pid = projectId || state.projectId;
    if (pid && window.QuizAllMindmap?.applyMasteryToMindmap) {
      try {
        const data = await api(`/api/quiz/projects/${encodeURIComponent(pid)}/analytics`);
        if (data.topicAccuracy && Object.keys(data.topicAccuracy).length) {
          map = window.QuizAllMindmap.applyMasteryToMindmap(
            JSON.parse(JSON.stringify(mindmap)),
            data.topicAccuracy
          );
        }
      } catch {
        /* mastery optional */
      }
    }
    appendMindmapMessage(map);
  }

  async function showAnalyticsCoach(projectId) {
    if (!projectId) return;
    try {
      const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/analytics`);
      const rec = data.recommendations?.[0];
      if (!rec) return;
      const science = window.quizallScience?.renderSciencePrescription?.({ lastSession: "quiz" });
      const scienceHref = science?.href || "/science/index.html";
      appendMessage(
        "ai",
        `<div class="analytics-coach-card science-inline-tip">` +
          `<strong>Next action</strong>` +
          `<p>${escapeHtml(rec.action)}</p>` +
          `<a href="${escapeHtml(scienceHref)}" class="meta-line">Science · Step ${rec.scienceStep || science?.step || 1}</a>` +
          `</div>`,
        "coach"
      );
    } catch {
      /* optional */
    }
  }

  async function startChallengeFromToken(token) {
    try {
      const API_BASE = (window.authGuard?.API_BASE || window.QUIZALL_API_BASE || window.location.origin).replace(/\/$/, "");
      const res = await fetch(`${API_BASE}/api/quiz/share/${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Challenge not found");
      const best = (data.rounds || []).reduce((m, r) => Math.max(m, Number(r.accuracy) || 0), 0);
      state.challengeTarget = best;
      setConversationActive(true);
      appendMessage(
        "ai",
        `<div class="challenge-banner science-inline-tip">` +
          `<strong>Challenge mode</strong>` +
          `<p>Beat <strong>${best}%</strong> on <em>${escapeHtml(data.projectName || data.subject || "this quiz")}</em>. Start a study session and take Testing mode when ready.</p>` +
          `</div>`,
        "challenge"
      );
    } catch (err) {
      appendMessage("ai", `<p>Could not load challenge: ${escapeHtml(err.message)}</p>`);
    }
  }

  async function generateExamPrep(projectId, { selectedFileId, topicsInput, sourceMode } = {}) {
    const data = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/exam-prep`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedFileId: selectedFileId || null,
        topicsInput: topicsInput || "",
        sourceMode: sourceMode || (selectedFileId ? "file" : "typed"),
      }),
    });
    state.mindmap = data.mindmap;
    await handleCreditResponse(data, "Exam map");
    return data;
  }

  async function tryBuildExamMap(projectId) {
    if (state.mindmap) {
      await appendMindmapWithMastery(state.mindmap, projectId);
      return true;
    }
    try {
      const outline = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/outline-candidates`);
      const candidates = outline.candidates || [];
      state.outlineCandidates = candidates;
      state.selectedOutlineFileId = outline.recommendedFileId || candidates[0]?.id || null;

      const typing = appendTyping("Building your exam map…");
      const planTopics = (state.studyPlan?.topics || []).map((t) => String(t || "").trim()).filter(Boolean);
      const prep = await generateExamPrep(projectId, {
        selectedFileId: planTopics.length ? null : state.selectedOutlineFileId,
        sourceMode: planTopics.length ? "typed" : state.selectedOutlineFileId ? "auto" : "typed",
        topicsInput: planTopics.length ? planTopics.join("\n") : "",
      });
      removeTyping(typing);
      if (prep.mindmap) {
        await appendMindmapWithMastery(prep.mindmap, projectId);
        return true;
      }
    } catch (err) {
      console.warn("exam prep skipped:", err.message);
    }
    return false;
  }

  async function checkUsageGate({ allowSoft = true } = {}) {
    if (!window.QuizAllCreateApi?.checkQuizUsage) return true;
    const result = await window.QuizAllCreateApi.checkQuizUsage(api, {
      subscriptionsEnabled: state.appSettings.subscriptionsEnabled,
    });
    if (result.ok) return true;
    if (result.soft && allowSoft) {
      appendMessage("ai", `<p class="meta-line usage-warn">${escapeHtml(result.message)} <a href="subscription.html">View plans</a></p>`);
      return true;
    }
    if (els.composerHint) {
      els.composerHint.classList.add("is-error");
      els.composerHint.innerHTML =
        window.QuizAllCreateErrors?.composerErrorHtml(result.message, "View plans") ||
        escapeHtml(result.message);
      const link = els.composerHint.querySelector(".composer-retry-link");
      link?.addEventListener("click", () => {
        window.location.href = "subscription.html";
      });
    }
    appendMessage("ai", `<p>${escapeHtml(result.message)} <a href="subscription.html">View plans</a></p>`);
    return false;
  }

  async function createShareLink() {
    if (!state.projectId) return;
    const data = await api("/api/quiz/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: state.projectId }),
    });
    if (data.url && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(data.url);
      appendMessage("ai", `<p class="meta-line">Share link copied to clipboard.</p>`);
    } else if (data.url) {
      appendMessage("ai", `<p class="meta-line">Share link: <a href="${escapeHtml(data.url)}" target="_blank" rel="noopener">${escapeHtml(data.url)}</a></p>`);
    }
  }

  async function loadSidebarStreak() {
    if (!els.sidebarStreak) return;
    try {
      const data = await api("/api/quiz/study-streak?days=7");
      const streak = data.currentStreak || 0;
      const heatmap = (data.heatmap || []).slice(-7);
      const dots = heatmap
        .map((d) => `<span class="streak-dot lvl-${Math.max(0, Math.min(3, d.intensity || 0))}"></span>`)
        .join("");
      els.sidebarStreak.innerHTML =
        `<div class="streak-card sidebar-streak-card">` +
        `<div class="streak-head">${icon("i-flame")} ${streak > 0 ? `${streak}-day streak` : "Study streak"}` +
        `<span class="streak-sub">7 days</span></div>` +
        `<div class="streak-dots">${dots}</div></div>`;
      els.sidebarStreak.classList.remove("hidden");
    } catch {
      els.sidebarStreak.classList.add("hidden");
    }
  }

  async function loadWrongbook() {
    if (!els.wrongbookList || !els.sidebarWrongbook) return;
    try {
      const data = await api("/api/quiz/wrong-answers?limit=8");
      const items = data.items || [];
      const due = data.dueToday ?? 0;
      const head = els.sidebarWrongbook.querySelector(".wrongbook-head span");
      if (head) head.textContent = due > 0 ? `Wrong answers · ${due} due` : "Wrong answers";
      if (!items.length) {
        els.sidebarWrongbook.classList.add("hidden");
        return;
      }
      els.wrongbookList.innerHTML = items
        .map(
          (item) =>
            `<button type="button" class="wrongbook-item" data-topic="${escapeHtml(item.subject || "")}" title="${escapeHtml(item.question)}">` +
            `<span class="wrongbook-q">${escapeHtml(item.question.slice(0, 60))}${item.question.length > 60 ? "…" : ""}</span>` +
            `</button>`
        )
        .join("");
      els.sidebarWrongbook.classList.remove("hidden");
      els.wrongbookList.querySelectorAll(".wrongbook-item").forEach((btn) => {
        btn.addEventListener("click", () => {
          const topic = btn.getAttribute("data-topic") || "";
          if (topic) state.activeTopicHint = topic;
          if (state.studyPlan && state.projectId && !state.isProcessing) {
            setProcessing(true);
            setQuizMode("training");
            requizProject();
          } else {
            appendMessage("ai", `<p class="meta-line">Open a session with a study plan to practice wrong answers.</p>`);
          }
        });
      });
    } catch {
      els.sidebarWrongbook.classList.add("hidden");
    }
  }

  function renderMaterialSummary(files, skipped) {
    if (!files?.length && !skipped?.length) return;
    const parts = [];
    if (files?.length) {
      const chars = files.reduce((s, f) => s + (f.content_length || f.text?.length || 0), 0);
      parts.push(`Read ${files.length} file(s)${chars ? ` · ~${chars.toLocaleString()} characters` : ""}`);
    }
    if (skipped?.length) {
      parts.push(`Could not read: ${skipped.join(", ")}`);
    }
    if (parts.length) {
      appendMessage("ai", `<p class="meta-line material-summary">${escapeHtml(parts.join(" · "))}</p>`);
    }
  }

  async function generateRound(roundConfig) {
    const data = await api("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: state.projectId,
        types: roundConfig.types,
        numQuestions: roundConfig.numQuestions,
        typeMix: roundConfig.typeMix,
        analysis: state.analysis,
        content: state.materialPreview || undefined,
        mode: "testing",
        examPreset: state.examPreset || "general",
      }),
    });
    await handleCreditResponse(data, "Quiz round");
    const questions = data.quiz || [];
    // Persist questions server-side so user can recover if they navigate away
    if (questions.length && state.projectId) {
      api(`/api/quiz/projects/${encodeURIComponent(state.projectId)}/pending-round`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roundConfig, questions }),
      }).catch(() => {});
    }
    return questions;
  }

  async function generateTrainingBatch(excludeQuestions, topicHint, { isRefill = false } = {}) {
    const data = await api("/api/quiz/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: state.projectId,
        mode: "training",
        batchSize: 5,
        isRefill,
        analysis: state.analysis,
        content: state.materialPreview || undefined,
        excludeQuestions,
        topicHint,
        currentTopic: topicHint,
        examPreset: state.examPreset || "general",
      }),
    });
    await handleCreditResponse(data, isRefill ? "Training refill" : "Training pack");
    return data.quiz || data.questions || [];
  }

  function getTrainingLoopEl() {
    return document.getElementById("training-loop");
  }

  function ensureTrainingArtifact() {
    let loop = getTrainingLoopEl();
    if (loop) return loop.closest(".msg");

    const html =
      `<h3>Training mode</h3>` +
      `<p class="meta-line">One MCQ at a time — your full history stays in this session.</p>` +
      `<div id="training-loop" class="training-loop-artifact quiz-card">` +
      `<div class="training-loop-head">` +
      `<span class="training-accuracy">0% accuracy</span>` +
      `<span class="training-done">0 done</span>` +
      `</div>` +
      `<div class="training-loop-history" id="trainingLoopHistory"></div>` +
      `<div class="training-loop-active" id="trainingLoopActive"></div>` +
      `<button type="button" class="btn-round training-finish">Finish & write note</button>` +
      `</div>`;

    const msg = appendMessage("ai", html, "training-artifact");
    const finishBtn = msg.querySelector(".training-finish");
    finishBtn?.addEventListener("click", async (e) => {
      e.currentTarget.disabled = true;
      await finishTrainingAndNote();
    });
    return msg;
  }

  function updateTrainingLoopStats() {
    const loop = getTrainingLoopEl();
    if (!loop || !state.training) return;
    const accEl = loop.querySelector(".training-accuracy");
    const doneEl = loop.querySelector(".training-done");
    if (accEl) accEl.textContent = `${trainingAccuracy()}% accuracy`;
    if (doneEl) doneEl.textContent = `${state.training.total} done`;
  }

  function appendTrainingHistoryItem(entry, qNum) {
    const historyEl = document.getElementById("trainingLoopHistory");
    if (!historyEl) return;
    const nq = entry.question;
    const details = document.createElement("details");
    details.className = "training-history-item";
    details.innerHTML =
      `<summary>Q${qNum} · ${entry.isCorrect ? "✓" : "✗"} ${escapeHtml(String(nq.question).slice(0, 72))}${nq.question.length > 72 ? "…" : ""}</summary>` +
      `<p class="q-text">${escapeHtml(nq.question)}</p>` +
      `<p class="meta-line">Your answer: ${escapeHtml(displayAnswer(nq, entry.userAnswer))}</p>` +
      (entry.isCorrect ? `<p class="training-ok">Correct</p>` : `<p class="training-miss">Correct: ${escapeHtml(displayAnswer(nq, nq.correct_answer))}</p>`) +
      (nq.explanation ? `<p>${escapeHtml(nq.explanation)}</p>` : "");
    historyEl.appendChild(details);
    scheduleChatSave();
  }

  function bindTrainingQuestionOptions(activeEl, question, nq) {
    let answered = false;
    const feedback = activeEl.querySelector(".training-feedback");

    activeEl.querySelectorAll(".option-btn").forEach((btn, idx) => {
      btn.setAttribute("data-key", String.fromCharCode(65 + idx));
    });

    const onKey = (e) => {
      const key = e.key?.toUpperCase();
      if (!"ABCD".includes(key)) return;
      const idx = key.charCodeAt(0) - 65;
      const target = activeEl.querySelector(`.option-btn[data-o="${idx}"]`);
      if (target && !target.disabled) target.click();
    };
    document.addEventListener("keydown", onKey);

    activeEl.querySelectorAll(".option-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (answered) return;
        answered = true;
        document.removeEventListener("keydown", onKey);
        const selected = Number(btn.getAttribute("data-o"));
        const isCorrect = selected === Number(nq.correct_answer);
        activeEl.querySelectorAll(".option-btn").forEach((b) => {
          b.disabled = true;
          const o = Number(b.getAttribute("data-o"));
          if (o === Number(nq.correct_answer)) b.classList.add("correct");
          else if (o === selected) b.classList.add("wrong");
        });
        if (!state.training) state.training = { correct: 0, total: 0, history: [], queue: [] };
        state.training.total += 1;
        if (isCorrect) state.training.correct += 1;
        state.training.history.push({ question: nq, raw: question, userAnswer: selected, isCorrect });
        updateTrainingLoopStats();
        if (feedback) {
          feedback.classList.remove("hidden");
          feedback.innerHTML =
            (isCorrect ? `<p class="training-ok">Correct!</p>` : `<p class="training-miss">Not quite.</p>`) +
            (nq.explanation ? `<p>${escapeHtml(nq.explanation)}</p>` : "");
        }
        await new Promise((r) => setTimeout(r, 900));
        appendTrainingHistoryItem(state.training.history[state.training.history.length - 1], state.training.total);
        await showNextTrainingFromQueue();
      });
    });
  }

  function renderActiveTrainingQuestion(question) {
    const activeEl = document.getElementById("trainingLoopActive");
    if (!activeEl) return;
    const nq = normalizeQuestion(question);
    const qNum = (state.training?.total || 0) + 1;
    const imp = importanceTag(question?.importance);
    const topic = question?.topic_focus || state.studyPlan?.progress?.current_lecture?.title || state.studyPlan?.subject || "Core";

    activeEl.innerHTML =
      `<div class="training-head">` +
      `<span class="training-round">MCQ${imp ? ` ${imp}` : ""}</span>` +
      `<span class="training-topic">${escapeHtml(topic)}</span>` +
      `<span class="training-qnum">Q${qNum}</span>` +
      `</div>` +
      `<div class="quiz-question" data-qi="0">` +
      `<p class="q-text">${escapeHtml(nq.question)}</p>` +
      `<div class="answers">${buildAnswerHtml(nq, 0)}</div>` +
      `</div>` +
      `<div class="training-feedback hidden"></div>`;

    bindTrainingQuestionOptions(activeEl, question, nq);
    scheduleChatSave();
  }

  function renderTrainingLoading() {
    const activeEl = document.getElementById("trainingLoopActive");
    if (!activeEl) return;
    activeEl.innerHTML = `<div class="training-loading"><div class="typing-indicator"><span></span><span></span><span></span></div></div>`;
  }

  async function refillTrainingQueue() {
    const exclude = (state.training?.history || []).map((h) => h.question?.question).filter(Boolean);
    const topicHint = getTrainingTopicHint();
    const isRefill = (state.training?.history?.length || 0) > 0;
    const batch = await generateTrainingBatch(exclude, topicHint, { isRefill });
    if (!state.training) state.training = { correct: 0, total: 0, history: [], queue: [] };
    state.training.queue = (state.training.queue || []).concat(batch);
    scheduleChatSave();
    return batch.length;
  }

  async function showNextTrainingFromQueue() {
    if (!state.training) state.training = { correct: 0, total: 0, history: [], queue: [] };
    if (!state.training.queue?.length) {
      renderTrainingLoading();
      try {
        const n = await refillTrainingQueue();
        if (!n) throw new Error("No questions generated");
      } catch (err) {
        const activeEl = document.getElementById("trainingLoopActive");
        if (activeEl) {
          activeEl.innerHTML = `<p class="meta-line">${escapeHtml(err.message)}</p><button type="button" class="btn-text training-retry">Retry</button>`;
          activeEl.querySelector(".training-retry")?.addEventListener("click", () => showNextTrainingFromQueue());
        }
        setProcessing(false);
        return;
      }
    }
    const next = state.training.queue.shift();
    renderActiveTrainingQuestion(next);
    setProcessing(false);
    scheduleChatSave();
  }

  async function startTrainingLoop() {
    state.training = { correct: 0, total: 0, history: [], queue: [] };
    state.roundIndex = 0;
    ensureTrainingArtifact();
    setProcessing(true);
    const typing = appendTyping("Loading training questions…");
    try {
      await refillTrainingQueue();
      removeTyping(typing);
      await showNextTrainingFromQueue();
    } catch (err) {
      removeTyping(typing);
      appendErrorWithRetry(`Sorry, training failed: ${err.message}`, "retry-quiz");
      setProcessing(false);
    }
  }

  async function restoreTrainingFromState(trainingState) {
    if (!trainingState) return;
    state.training = {
      correct: trainingState.correct || 0,
      total: trainingState.total || 0,
      history: Array.isArray(trainingState.history) ? trainingState.history : [],
      queue: Array.isArray(trainingState.queue) ? trainingState.queue : [],
    };
    ensureTrainingArtifact();
    updateTrainingLoopStats();
    const historyEl = document.getElementById("trainingLoopHistory");
    if (historyEl) {
      historyEl.innerHTML = "";
      state.training.history.forEach((entry, i) => appendTrainingHistoryItem(entry, i + 1));
    }
    if (state.training.queue?.length) {
      await showNextTrainingFromQueue();
    } else if (!state.training.history.length) {
      await startTrainingLoop();
    } else {
      renderTrainingLoading();
      await showNextTrainingFromQueue();
    }
  }

  function trainingAccuracy() {
    if (!state.training || !state.training.total) return 0;
    return Math.round((state.training.correct / state.training.total) * 100);
  }

  function buildTrainingSessionFooter(question) {
    if (!state.hasUploadedMaterial) return "";
    const plan = state.studyPlan;
    const progress = plan?.progress;
    const citation = question?.source_citation || question?.source_reference || progress?.current_lecture?.citation || "";
    const score = state.training ? `${state.training.correct}/${state.training.total}` : "0/0";
    const percent = progress?.overall_percent != null ? ` · ${Math.round(progress.overall_percent)}% overall` : "";
    return (
      `<div class="training-session-footer">` +
      `<span>得分 ${score}</span>` +
      (citation ? `<span class="training-citation">| ${escapeHtml(citation)}</span>` : "") +
      (percent ? `<span>${escapeHtml(percent)}</span>` : "") +
      `</div>`
    );
  }

  async function finishTrainingAndNote() {
    if (state.training?.history?.length) {
      const results = state.training.history.map((h) => ({
        type: h.question.type,
        question: h.question.question,
        options: h.question.options,
        correct_answer: h.question.correct_answer,
        userAnswer: h.userAnswer,
        isCorrect: h.isCorrect,
        explanation: h.question.explanation,
      }));
      state.roundResults.push({
        label: "Training",
        correct: state.training.correct,
        total: state.training.total,
        missed: results
          .filter((r) => !r.isCorrect)
          .map((r) => ({
            question: r.question,
            userAnswer: displayAnswer(r, r.userAnswer),
            correctAnswer: displayAnswer(r, r.correct_answer),
          })),
      });
      try {
        await api("/api/quiz/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: state.projectId,
            subject: state.studyPlan?.subject || state.projectName,
            topics: state.studyPlan?.topics || [],
            correct: state.training.correct,
            total: state.training.total,
            roundLabel: "Training",
            questions: results,
          }),
        });
      } catch (err) {
        console.error("save training history failed", err);
      }
    }
    await finishAllRounds();
  }

  async function startQuizFlow() {
    if (loadQuizMode() === "training") {
      await startTrainingLoop();
      return;
    }
    await startMixedQuiz();
  }

  async function saveRoundHistory(roundConfig, rawQuestions, answers) {
    let correct = 0;
    const results = rawQuestions.map((rawQ, i) => {
      const q = normalizeQuestion(rawQ);
      const isCorrect = evaluateAnswer(q, answers[i]);
      if (isCorrect) correct += 1;
      return {
        type: q.type,
        question: q.question,
        options: q.options,
        correct_answer: q.correct_answer,
        userAnswer: answers[i],
        isCorrect,
        explanation: q.explanation,
      };
    });

    const missed = results
      .filter((r) => !r.isCorrect)
      .map((r) => ({
        question: r.question,
        userAnswer: displayAnswer(r, r.userAnswer),
        correctAnswer: displayAnswer(r, r.correct_answer),
      }));

    state.roundResults.push({
      label: roundConfig.label,
      correct,
      total: results.length,
      missed,
    });

    try {
      await api("/api/quiz/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: state.projectId,
          subject: state.studyPlan?.subject || state.projectName,
          topics: state.studyPlan?.topics || [],
          correct,
          total: results.length,
          roundLabel: roundConfig.label,
          questions: results,
        }),
      });
      // Clear the pending round now that the result is saved
      if (state.projectId) {
        api(`/api/quiz/projects/${encodeURIComponent(state.projectId)}/pending-round`, {
          method: "DELETE",
        }).catch(() => {});
      }
    } catch (err) {
      console.error("save history failed", err);
    }

    return { correct, total: results.length, results };
  }

  async function startMixedQuiz() {
    const roundConfig = getMixedRoundConfig();
    state.roundIndex = 0;
    const typing = appendTyping("Creating your quiz…");

    try {
      const questions = await generateRound(roundConfig);
      removeTyping(typing);
      if (!questions.length) throw new Error("No questions generated");

      renderQuizCard(roundConfig, questions, async (answers) => {
        const { correct, total, results } = await saveRoundHistory(roundConfig, questions, answers);
        renderRoundReview(roundConfig, results, correct, total, true, async () => {
          await finishAllRounds();
        });
      });
      setProcessing(false);
    } catch (err) {
      removeTyping(typing);
      appendErrorWithRetry(`Sorry, the quiz failed: ${err.message}`, "retry-quiz");
      setProcessing(false);
    }
  }

  async function finishAllRounds() {
    const typing = appendTyping("Writing your study note…");
    try {
      const data = await api(`/api/quiz/projects/${encodeURIComponent(state.projectId)}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studyPlan: state.studyPlan,
          rounds: state.roundResults,
          content: state.materialPreview || undefined,
        }),
      });
      removeTyping(typing);
      const noteMsg = appendMessage("ai", formatNoteHtml(data.note));
      noteMsg.querySelector(".share-session-btn")?.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        try {
          await createShareLink();
        } catch (err) {
          appendMessage("ai", `<p>Could not create share link: ${escapeHtml(formatUserError(err))}</p>`);
        }
      });
      appendMessage("ai", `<p class="meta-line">Session complete. Start a new study session anytime from the left.</p>`);
      setProcessing(false);
      await loadHistorySidebar();
      await loadWrongbook();
    } catch (err) {
      removeTyping(typing);
      appendErrorWithRetry(`Sorry, I couldn't write the note: ${err.message}`, "retry-note");
      setProcessing(false);
    }
  }

  function autosizeComposer() {
    els.composerInput.style.height = "auto";
    els.composerInput.style.height = Math.min(els.composerInput.scrollHeight, 200) + "px";
  }

  async function handleShortChatMessage(text) {
    setConversationActive(true);
    setActiveNav("navHome");
    appendMessage("user", `<p>${escapeHtml(text)}</p>`);
    setProcessing(true);

    const inTrainingMode = loadQuizMode() === "training";
    const hasPlan = !!(state.studyPlan && state.analysis);

    if (hasPlan && inTrainingMode) {
      appendMessage("ai", `<p>Starting <strong>training mode</strong> — one question at a time.</p>`);
      await startTrainingLoop();
      return;
    }

    if (hasPlan) {
      appendMessage(
        "ai",
        `<p>Got it. Tap <strong>Quiz me again</strong> when you want another round, or paste more notes to refresh your plan.</p>`
      );
      setProcessing(false);
      return;
    }

    if (state.projectId && state.hasUploadedMaterial) {
      setProcessing(true);
      await runStudyPlan(state.projectId, undefined);
      return;
    }

    appendMessage(
      "ai",
      "<p>Paste your notes or attach a file — then short prompts like this will work to start training or quiz you.</p>" +
        '<p class="meta-line"><button type="button" class="hint-link sample-inline">Try a sample</button></p>'
    );
    const sampleBtn = els.chatInner.querySelector(".sample-inline:last-of-type");
    sampleBtn?.addEventListener("click", () => {
      els.composerInput.value = SAMPLE_TEXT;
      autosizeComposer();
      els.composerInput.focus();
    });
    setProcessing(false);
  }

  function formatUserMaterialMessage(text, fileCount) {
    const parts = [];
    const count = Number(fileCount) || 0;
    if (count > 0) {
      parts.push(`<p class="meta-line">Uploaded ${count} file${count === 1 ? "" : "s"}</p>`);
    }
    const trimmed = String(text || "").trim();
    if (trimmed) {
      const preview = trimmed.slice(0, 600) + (trimmed.length > 600 ? "…" : "");
      parts.push(`<p class="user-paste-preview">${escapeHtml(preview)}</p>`);
    }
    return parts.join("");
  }

  function appendUserMaterialMessage(text, fileCount) {
    const html = formatUserMaterialMessage(text, fileCount);
    if (!html) return null;
    const msg = appendMessage("user", html);
    if (String(text || "").trim()) msg.dataset.rawText = String(text).trim();
    return msg;
  }

  function respondNeedMoreMaterial(text, fileCount) {
    setConversationActive(true);
    setActiveNav("navHome");
    appendUserMaterialMessage(text, fileCount);
    els.composerInput.value = "";
    autosizeComposer();
    state.pendingFiles = [];
    renderAttachmentsBar();
    appendMessage(
      "ai",
      "<p>Paste your notes or attach a file — I need enough study material to build your plan and quiz.</p>" +
        '<p class="meta-line">PDF, DOCX, TXT, and pasted text all work. <button type="button" class="hint-link sample-inline">Try a sample</button></p>'
    );
    const sampleBtn = els.chatInner.querySelector(".sample-inline:last-of-type");
    sampleBtn?.addEventListener("click", () => {
      els.composerInput.value = SAMPLE_TEXT;
      autosizeComposer();
      els.composerInput.focus();
    });
  }

  async function handleSend() {
    if (state.isProcessing) return;

    const text = els.composerInput.value.trim();
    const hasFiles = state.pendingFiles.length > 0;
    if (!text && !hasFiles) return;

    clearComposerError();
    closeMixPanel();

    // YouTube link → fetch transcript and use it as study material
    if (!hasFiles && isYouTubeUrl(text)) {
      await handleYouTubeMessage(text);
      return;
    }

    const filesToCheck = state.pendingFiles.slice();
    setProcessing(true);
    const combinedContent = await buildMaterialContent(text, filesToCheck);
    const continuing = !!(state.resumedSession && state.projectId);
    const shortContent = combinedContent.length < CONTENT_MIN_LENGTH;

    if (!continuing && shortContent) {
      setProcessing(false);
      respondNeedMoreMaterial(text, filesToCheck.length);
      return;
    }

    if (continuing && shortContent && !hasFiles) {
      setProcessing(false);
      els.composerInput.value = "";
      autosizeComposer();
      state.pendingFiles = [];
      renderAttachmentsBar();
      await handleShortChatMessage(text);
      return;
    }

    setConversationActive(true);
    setActiveNav("navHome");
    setProcessing(true);

    const usageOk = await checkUsageGate();
    if (!usageOk) {
      setProcessing(false);
      return;
    }

    if (!continuing) {
      state.roundIndex = -1;
      state.roundResults = [];
      state.analysis = null;
      state.studyPlan = null;
    }
    if (combinedContent) state.materialPreview = combinedContent;

    appendUserMaterialMessage(text, filesToCheck.length);

    els.composerInput.value = "";
    autosizeComposer();
    const filesToUpload = state.pendingFiles.slice();
    state.pendingFiles = [];
    renderAttachmentsBar();

    try {
      if (!continuing) {
        const project = await createProject(autoProjectName());
        state.projectId = project.id;
        state.projectName = project.name;
        state.resumedSession = false;
        await loadHistorySidebar();
      }

      if (filesToUpload.length) {
        state.hasUploadedMaterial = true;
        const typing = appendTyping("Reading your files…");
        const uploadResult = await uploadFilesToProject(state.projectId, filesToUpload);
        removeTyping(typing);
        renderMaterialSummary(uploadResult.files, uploadResult.skipped);
      }

      await runStudyPlan(state.projectId, combinedContent || state.materialPreview || undefined, {
        skipQuiz: continuing && !!state.studyPlan,
      });
    } catch (err) {
      appendMessage("ai", `<p>Something went wrong: ${escapeHtml(formatUserError(err))}</p>`);
      setProcessing(false);
    }
  }

  async function handleYouTubeMessage(url) {
    setConversationActive(true);
    setActiveNav("navHome");
    appendMessage("user", `<p>${escapeHtml(url)}</p>`);
    els.composerInput.value = "";
    autosizeComposer();
    setProcessing(true);

    const usageOk = await checkUsageGate();
    if (!usageOk) {
      setProcessing(false);
      return;
    }

    const typing = appendTyping("Fetching the video transcript…");
    let transcriptData;
    try {
      transcriptData = await fetchYouTubeTranscript(url);
    } catch (err) {
      removeTyping(typing);
      appendMessage(
        "ai",
        `<p>${escapeHtml(formatUserError(err))}</p>` +
          `<p class="meta-line">Tip: the video must have captions/subtitles. Try another video or paste your notes instead.</p>`
      );
      setProcessing(false);
      return;
    }
    removeTyping(typing);

    const combinedContent = String(transcriptData.transcript || "");
    state.materialPreview = combinedContent;
    state.roundIndex = -1;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;

    appendMessage(
      "ai",
      `<p class="meta-line material-summary">Transcript loaded from <strong>${escapeHtml(
        transcriptData.title || "YouTube video"
      )}</strong> (${combinedContent.length.toLocaleString()} chars). Building your study plan…</p>`
    );

    try {
      if (!(state.resumedSession && state.projectId)) {
        const project = await createProject(sanitizeSessionName(transcriptData.title) || autoProjectName());
        state.projectId = project.id;
        state.projectName = project.name;
        state.resumedSession = false;
        await loadHistorySidebar();
      }
      await runStudyPlan(state.projectId, combinedContent);
    } catch (err) {
      appendMessage("ai", `<p>Something went wrong: ${escapeHtml(formatUserError(err))}</p>`);
      setProcessing(false);
    }
  }

  function rebindTranscriptInteractive() {
    els.chatInner.querySelectorAll(".training-finish").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
      btn.addEventListener("click", async (e) => {
        e.currentTarget.disabled = true;
        await finishTrainingAndNote();
      });
    });
    const activeEl = document.getElementById("trainingLoopActive");
    if (activeEl?.querySelector(".option-btn") && state.training?.queue?.length) {
      const next = state.training.queue[0];
      if (next) renderActiveTrainingQuestion(next);
    }
    els.chatInner.querySelectorAll(".history-toggle").forEach((toggle) => {
      const msg = toggle.closest(".msg");
      if (toggle.dataset.bound || !msg) return;
      toggle.dataset.bound = "1";
      bindHistoryRoundToggle(msg);
    });
    els.chatInner.querySelectorAll(".continue-quiz-btn, .requiz-btn, .continue-plan-btn, .continue-note-btn, .new-session-btn").forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = "1";
    });
    els.chatInner.querySelectorAll(".retry-btn").forEach((btn) => bindRetryButton(btn));
  }

  async function openProject(projectId) {
    if (!projectId) return;
    setProcessing(false);
    state.training = null;
    state.projectId = projectId;
    state.roundResults = [];
    state.analysis = null;
    state.studyPlan = null;
    setResumedSession(true);
    setActiveNav("navHistory");
    setConversationActive(true);
    if (window.innerWidth < SIDEBAR_BP_MOBILE) closeSidebarIfMobile();

    els.chatInner.innerHTML = "";
    const typing = appendTyping("Loading session…");

    try {
      const [detail, transcriptRes] = await Promise.all([
        api(`/api/quiz/projects/${encodeURIComponent(projectId)}`),
        window.QuizAllTranscript?.loadTranscript(api, projectId).catch(() => null),
      ]);
      state.projectName = detail.project?.name || "Study session";
      state.hasUploadedMaterial = !!(detail.files?.length);
      if (detail.examPrep?.mindmap) {
        state.mindmap = detail.examPrep.mindmap;
      }

      try {
        const planRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/study-plan`);
        if (planRes.studyPlan) {
          state.studyPlan = planRes.studyPlan;
          state.analysis = {
            subject: planRes.studyPlan.subject,
            topics: planRes.studyPlan.topics || [],
            key_concepts: planRes.studyPlan.key_concepts || [],
          };
          state.materialPreview = buildContentFromPlan(planRes.studyPlan);
        }
      } catch {
        /* no plan */
      }

      if (transcriptRes?.messages?.length) {
        removeTyping(typing);
        els.chatInner.innerHTML = "";
        transcriptRes.messages.forEach((m) => {
          // Sanitize persisted HTML before re-injecting to prevent stored XSS
          // (transcript HTML originates from AI output saved as innerHTML).
          const safeHtml = typeof DOMPurify !== "undefined"
            ? DOMPurify.sanitize(m.html || "", {
                ALLOWED_TAGS: ["p", "br", "strong", "em", "b", "i", "ul", "ol", "li",
                               "h1", "h2", "h3", "h4", "code", "pre", "blockquote",
                               "div", "span", "button", "input", "textarea",
                               "table", "thead", "tbody", "tr", "th", "td",
                               "a", "details", "summary", "svg", "use"],
                ALLOWED_ATTR: ["class", "id", "type", "data-q", "data-o", "data-submit",
                               "data-retry", "placeholder", "rows", "maxlength",
                               "href", "target", "rel", "aria-label", "aria-live",
                               "tabindex", "viewBox", "fill", "stroke", "stroke-width",
                               "stroke-linecap", "stroke-linejoin", "d"],
              })
            : m.html || "";
          const wrap = appendMessage(m.role === "user" ? "user" : "ai", safeHtml, m.type || "message");
          if (m.ts) wrap.dataset.ts = String(m.ts);
        });
        if (transcriptRes.trainingState) {
          state.training = transcriptRes.trainingState;
          if (getTrainingLoopEl()) {
            updateTrainingLoopStats();
          }
        }
        rebindTranscriptInteractive();
        if (state.studyPlan) {
          // Check for a pending (interrupted) quiz round before showing "Quiz me again"
          let pendingRound = null;
          try {
            const pr = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/pending-round`);
            if (pr.pending?.questions?.length) pendingRound = pr.pending;
          } catch { /* non-critical */ }

          if (pendingRound) {
            const resumeMsg = appendMessage(
              "ai",
              `<p class="meta-line">⚡ You have a quiz ready from your last session — pick up where you left off.</p>` +
                `<button type="button" class="btn-round requiz-btn">Resume quiz ${icon("i-arrow-right")}</button>` +
                `<button type="button" class="btn-text-sm discard-pending-btn" style="margin-left:8px;font-size:0.78rem;color:var(--c-text-dim);background:none;border:none;cursor:pointer;">Discard</button>`
            );
            resumeMsg.querySelector(".requiz-btn").addEventListener("click", async (e) => {
              e.currentTarget.disabled = true;
              resumeMsg.querySelector(".discard-pending-btn").style.display = "none";
              state.roundIndex = 0;
              state.roundResults = [];
              const rc = pendingRound.roundConfig || getMixedRoundConfig();
              const qs = pendingRound.questions;
              renderQuizCard(rc, qs, async (answers) => {
                const { correct, total, results } = await saveRoundHistory(rc, qs, answers);
                renderRoundReview(rc, results, correct, total, true, async () => {
                  await finishAllRounds();
                });
              });
              setProcessing(false);
            });
            resumeMsg.querySelector(".discard-pending-btn").addEventListener("click", async (e) => {
              e.currentTarget.closest(".msg").remove();
              api(`/api/quiz/projects/${encodeURIComponent(projectId)}/pending-round`, { method: "DELETE" }).catch(() => {});
              const againMsg = appendMessage(
                "ai",
                `<p class="meta-line">Want another pass at this material?</p>` +
                  `<button type="button" class="btn-round requiz-btn">Quiz me again ${icon("i-arrow-right")}</button>`
              );
              againMsg.querySelector(".requiz-btn").addEventListener("click", (ev) => {
                ev.currentTarget.disabled = true;
                requizProject();
              });
            });
          } else {
            const againMsg = appendMessage(
              "ai",
              `<p class="meta-line">Want another pass at this material?</p>` +
                `<button type="button" class="btn-round requiz-btn">Quiz me again ${icon("i-arrow-right")}</button>`
            );
            againMsg.querySelector(".requiz-btn").addEventListener("click", (e) => {
              e.currentTarget.disabled = true;
              requizProject();
            });
          }
        }
        ensureComposerReady();
        updateComposerPlaceholder();
        await loadHistorySidebar();
        els.composerInput.focus();
        if (state.roundResults?.length || (transcriptRes.trainingState?.total > 0)) {
          await showAnalyticsCoach(projectId);
        }
        return;
      }

      removeTyping(typing);
      appendMessage("user", `<p>Reopened: <strong>${escapeHtml(state.projectName)}</strong></p>`);

      let planLoaded = false;
      if (state.studyPlan) {
        appendMessage("ai", formatStudyPlanHtml(state.studyPlan, { includeNextStep: false }));
        planLoaded = true;
      }

      if (state.mindmap) {
        await appendMindmapWithMastery(state.mindmap, projectId);
      }

      if (!planLoaded && detail.files?.length) {
        appendMessage(
          "ai",
          `<p>This session has ${detail.files.length} uploaded file(s), but no study plan was saved yet.</p>`
        );
      }

      let roundsLoaded = false;
      try {
        const historyRes = await api(
          `/api/quiz/history?projectId=${encodeURIComponent(projectId)}&limit=10&order=asc&includeQuestions=1`
        );
        const rounds = historyRes.results || [];
        state.roundResults = rounds.map((round) => ({
          label: round.roundLabel || "Round",
          correct: round.score,
          total: round.total,
          missed: (round.questions || [])
            .filter((q) => !q.is_correct && !q.isCorrect)
            .map((q) => ({
              question: q.question,
              userAnswer: q.user_answer ?? q.userAnswer ?? "",
              correctAnswer: q.correct_answer ?? q.correctAnswer ?? "",
            })),
        }));
        rounds.forEach((round) => {
          if (!round.questions?.length) return;
          roundsLoaded = true;
          const results = normalizeHistoryQuestions(round.questions);
          const msg = appendMessage(
            "ai",
            formatHistoryRoundHtml(round.roundLabel, round.score, round.total, results)
          );
          bindHistoryRoundToggle(msg);
        });
      } catch {
        /* no saved rounds */
      }

      let noteLoaded = false;
      try {
        const noteRes = await api(`/api/quiz/projects/${encodeURIComponent(projectId)}/note`);
        if (noteRes.note) {
          appendMessage("ai", formatNoteHtml(noteRes.note));
          noteLoaded = true;
        }
      } catch {
        if (planLoaded && !roundsLoaded) {
          const msg = appendMessage(
            "ai",
            `<p>Your study plan is ready, but quiz rounds weren't finished.</p>` +
              `<button type="button" class="btn-round continue-quiz-btn">Start quiz</button>`
          );
          msg.querySelector(".continue-quiz-btn")?.addEventListener("click", async (e) => {
            e.currentTarget.disabled = true;
            setProcessing(true);
            await startQuizFlow();
          });
        } else if (planLoaded && roundsLoaded && !noteLoaded) {
          const msg = appendMessage(
            "ai",
            `<p>Rounds are saved, but no study note was generated yet.</p>` +
              `<button type="button" class="btn-round continue-note-btn">Generate study note</button>`
          );
          msg.querySelector(".continue-note-btn")?.addEventListener("click", async (e) => {
            e.currentTarget.disabled = true;
            setProcessing(true);
            await finishAllRounds();
          });
        }
      }

      if (planLoaded) {
        const againMsg = appendMessage(
          "ai",
          `<p class="meta-line">Want another pass at this material?</p>` +
            `<button type="button" class="btn-round requiz-btn">Quiz me again ${icon("i-arrow-right")}</button>`
        );
        againMsg.querySelector(".requiz-btn").addEventListener("click", (e) => {
          e.currentTarget.disabled = true;
          requizProject();
        });
      } else if (detail.files?.length) {
        const msg = appendMessage(
          "ai",
          `<p>Pick up where you left off — I'll build your study plan from the uploaded files.</p>` +
            `<button type="button" class="btn-round continue-plan-btn">Generate study plan</button>` +
            `<p class="meta-line">Or paste more material below and press send.</p>`
        );
        msg.querySelector(".continue-plan-btn")?.addEventListener("click", async (e) => {
          e.currentTarget.disabled = true;
          setProcessing(true);
          await runStudyPlan(state.projectId);
        });
      } else {
        const msg = appendMessage(
          "ai",
          `<p>This session has no study material yet.</p>` +
            `<button type="button" class="btn-round new-session-btn">Start new session</button>`
        );
        msg.querySelector(".new-session-btn")?.addEventListener("click", resetNewChat);
      }
      if (state.roundResults?.length) {
        await showAnalyticsCoach(projectId);
      }
      await loadHistorySidebar();
      ensureComposerReady();
      updateComposerPlaceholder();
      els.composerInput.focus();
    } catch (err) {
      removeTyping(typing);
      appendMessage("ai", `<p>Could not load session: ${escapeHtml(err.message)}</p>`);
      ensureComposerReady();
    }
  }

  function buildContentFromPlan(plan) {
    const parts = [plan.summary || ""];
    (plan.key_concepts || []).forEach((k) => parts.push(`${k.concept}: ${k.detail || ""}`));
    (plan.topics || []).forEach((t) => parts.push(String(t)));
    return parts.filter(Boolean).join("\n");
  }

  async function requizProject() {
    if (!state.projectId || !state.studyPlan || state.isProcessing) return;
    const allowed = await checkUsageGate({ allowSoft: true });
    if (!allowed) return;
    setResumedSession(true);
    setProcessing(true);
    state.roundIndex = -1;
    state.roundResults = [];
    state.analysis = {
      subject: state.studyPlan.subject,
      topics: state.studyPlan.topics || [],
      key_concepts: state.studyPlan.key_concepts || [],
    };
    state.materialPreview = buildContentFromPlan(state.studyPlan);
    appendMessage(
      "ai",
      `<p>Let's go again — a fresh ${loadQuizMode() === "training" ? "training loop" : "quiz"} on <strong>${escapeHtml(state.studyPlan.subject || state.projectName)}</strong>.</p>`
    );
    await startQuizFlow();
  }

  function resetNewChat() {
    // "Start new session" must always let the user escape a stuck run.
    setProcessing(false);
    state.projectId = null;
    state.projectName = "";
    state.analysis = null;
    state.studyPlan = null;
    state.pendingFiles = [];
    state.hasUploadedMaterial = false;
    state.roundIndex = -1;
    state.roundResults = [];
    state.training = null;
    state.mindmap = null;
    state.activeTopicHint = "";
    setResumedSession(false);
    setActiveNav("navHome");
    updateComposerPlaceholder();
    els.composerInput.value = "";
    autosizeComposer();
    renderAttachmentsBar();
    renderWelcome();
    loadHistorySidebar();
    els.composerInput.focus();
  }

  // ── Native settings modal ──────────────────────────────────────────
  const TAB_TITLES = { account: "Account", appearance: "Appearance", billing: "Billing", usage: "Usage" };

  function openSettings(tab) {
    els.avatarMenu.classList.add("hidden");
    els.settingsOverlay.classList.remove("hidden");
    switchSettingsTab(tab || "account");
  }

  function closeSettings() {
    els.settingsOverlay.classList.add("hidden");
  }

  function switchSettingsTab(tab) {
    document.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.classList.toggle("is-active", btn.getAttribute("data-tab") === tab);
    });
    els.settingsTabTitle.textContent = TAB_TITLES[tab] || "Settings";
    if (tab === "account") renderAccountTab();
    else if (tab === "appearance") renderAppearanceTab();
    else if (tab === "billing") renderBillingTab();
    else if (tab === "usage") renderUsageTab();
  }

  async function renderAccountTab() {
    els.settingsBody.innerHTML = '<div class="settings-loading">Loading account…</div>';
    try {
      const data = await api("/api/auth/me");
      const user = data.user || {};
      const tier = user.subscription?.tier || "free";
      els.settingsBody.innerHTML =
        `<div class="set-row"><span class="set-k">Email</span><span class="set-v">${escapeHtml(user.email || "—")}</span></div>` +
        `<div class="set-row"><span class="set-k">Plan</span><span class="set-v"><span class="badge">${escapeHtml(tier)}</span></span></div>` +
        `<div class="set-row"><span class="set-k">Timezone</span><span class="set-v">${escapeHtml(user.timezone || "UTC")}</span></div>` +
        `<div class="set-actions"><button type="button" class="set-btn danger" id="setLogout">Log out</button></div>`;
      document.getElementById("setLogout").addEventListener("click", () => {
        window.authGuard.clearToken();
        window.location.href = "index.html";
      });
    } catch (err) {
      const token = window.authGuard?.getToken();
      const jwtEmail = token ? decodeJwtEmail(token) : null;
      if (jwtEmail && (err.code === "NETWORK_ERROR" || /failed to fetch/i.test(err.message || ""))) {
        els.settingsBody.innerHTML =
          `<div class="set-banner warn">无法连接服务器，请检查网络或稍后再试。<span class="set-debug">API: ${escapeHtml(API_BASE)}</span></div>` +
          `<div class="set-row"><span class="set-k">Email</span><span class="set-v">${escapeHtml(jwtEmail)}</span></div>` +
          `<div class="set-row"><span class="set-k">Plan</span><span class="set-v"><span class="badge">unknown</span></span></div>` +
          `<p class="set-note">Showing email from your saved login. Full account details need a server connection.</p>` +
          `<div class="set-actions"><button type="button" class="set-btn danger" id="setLogout">Log out</button></div>`;
        document.getElementById("setLogout").addEventListener("click", () => {
          window.authGuard.clearToken();
          window.location.href = "index.html";
        });
        return;
      }
      els.settingsBody.innerHTML = `<div class="settings-loading">Could not load account: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderAppearanceTab() {
    const current = window.themeManager?.getPreference?.() || localStorage.getItem("theme") || "auto";
    els.settingsBody.innerHTML =
      `<div class="theme-options">` +
      ["dark", "light", "auto"]
        .map((mode) => {
          const label = mode === "auto" ? "System" : mode.charAt(0).toUpperCase() + mode.slice(1);
          const swatch = mode === "auto" ? "system" : mode;
          return (
            `<button type="button" class="theme-option${current === mode ? " is-active" : ""}" data-mode="${mode}">` +
            `<span class="theme-swatch ${swatch}"></span>${label}</button>`
          );
        })
        .join("") +
      `</div>` +
      `<p class="set-note">Language and other preferences live in <a href="settings.html" target="_blank" rel="noopener">all settings</a>.</p>`;

    els.settingsBody.querySelectorAll(".theme-option").forEach((btn) => {
      btn.addEventListener("click", () => {
        const mode = btn.getAttribute("data-mode");
        if (window.themeManager?.set) window.themeManager.set(mode);
        else {
          localStorage.setItem("theme", mode);
          const resolved =
            mode === "auto"
              ? window.matchMedia("(prefers-color-scheme: light)").matches
                ? "light"
                : "dark"
              : mode;
          document.documentElement.setAttribute("data-theme", resolved);
        }
        els.settingsBody.querySelectorAll(".theme-option").forEach((b) => b.classList.toggle("is-active", b === btn));
      });
    });
  }

  async function renderBillingTab() {
    els.settingsBody.innerHTML = '<div class="settings-loading">Loading billing…</div>';
    try {
      const data = await api("/api/billing/status");
      const sub = data.subscription || {};
      const planLabel = sub.plan || data.plan || "free";
      const periodEnd = sub.periodEnd || sub.currentPeriodEnd || sub.current_period_end;
      const stripeConfigured = !!data.stripeConfigured;

      let actionsHtml = `<a class="set-btn" href="subscription.html" target="_blank" rel="noopener">View plans</a>`;
      if (stripeConfigured) {
        actionsHtml =
          `<button type="button" class="set-btn primary" id="setPortal">Manage subscription</button>` +
          actionsHtml;
      } else {
        actionsHtml =
          `<p class="set-note">Billing is not enabled on this server yet. You are on the free plan.</p>` +
          actionsHtml;
      }

      els.settingsBody.innerHTML =
        `<div class="set-row"><span class="set-k">Plan</span><span class="set-v"><span class="badge">${escapeHtml(planLabel)}</span></span></div>` +
        `<div class="set-row"><span class="set-k">Status</span><span class="set-v">${escapeHtml(sub.status || "none")}</span></div>` +
        (periodEnd
          ? `<div class="set-row"><span class="set-k">Renews</span><span class="set-v">${escapeHtml(new Date(periodEnd).toLocaleDateString())}</span></div>`
          : "") +
        `<div class="set-actions">${actionsHtml}</div>`;

      const portalBtn = document.getElementById("setPortal");
      if (portalBtn) {
        portalBtn.addEventListener("click", async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try {
            const res = await api("/api/billing/portal-session", { method: "POST" });
            if (res.url) window.location.href = res.url;
          } catch {
            btn.disabled = false;
            btn.textContent = "Unavailable on free plan";
          }
        });
      }
    } catch (err) {
      const msg =
        err.code === "NETWORK_ERROR"
          ? `无法连接服务器，请检查网络或稍后再试。（${API_BASE}）`
          : err.message;
      els.settingsBody.innerHTML = `<div class="settings-loading">Could not load billing: ${escapeHtml(msg)}</div>`;
    }
  }

  function usageMeter(label, used, total) {
    const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
    return (
      `<div class="usage-meter">` +
      `<div class="usage-meter-head"><span class="um-label">${escapeHtml(label)}</span><span class="um-value">${used} / ${total || "∞"}</span></div>` +
      `<div class="usage-bar"><div class="usage-bar-fill" style="width:${pct}%"></div></div>` +
      `</div>`
    );
  }

  async function renderUsageTab() {
    els.settingsBody.innerHTML = '<div class="settings-loading">Loading usage…</div>';
    try {
      const [statusData, historyItems, streakData] = await Promise.all([
        api("/api/billing/status").catch(() => null),
        window.QuizAllCreateApi?.fetchCreditHistory?.(api, 12) || Promise.resolve([]),
        api("/api/quiz/study-streak?days=7").catch(() => null),
      ]);

      let html = "";

      if (statusData?.credits) {
        const c = statusData.credits;
        html += usageMeter("Credits remaining", c.balance ?? 0, c.dailyAllowance ?? 80);
        html += `<p class="set-note">Daily allowance resets at midnight in your timezone.</p>`;
      }

      if (historyItems.length) {
        html += `<div class="credit-history"><h3 class="set-subhead">Recent usage</h3><ul class="credit-history-list">`;
        historyItems.forEach((item) => {
          html += `<li><span>−${item.credits}</span> ${escapeHtml(item.reason || "Usage")}</li>`;
        });
        html += `</ul></div>`;
      }

      if (statusData?.creditCosts) {
        html += `<div class="credit-costs-ref"><h3 class="set-subhead">Action costs</h3><ul>`;
        Object.entries(statusData.creditCosts).forEach(([key, val]) => {
          html += `<li>${escapeHtml(key)}: ${val} credits</li>`;
        });
        html += `</ul></div>`;
      }

      if (streakData && Array.isArray(streakData.heatmap)) {
        const heatmap = streakData.heatmap.slice(-7);
        const streak = streakData.currentStreak || 0;
        const dots = heatmap
          .map((d) => `<span class="streak-dot lvl-${Math.max(0, Math.min(3, d.intensity || 0))}"></span>`)
          .join("");
        html +=
          `<div class="streak-card">` +
          `<div class="streak-head">${icon("i-flame")} ${streak > 0 ? `${streak}-day streak` : "Study streak"}<span class="streak-sub">Last 7 days</span></div>` +
          `<div class="streak-dots">${dots}</div>` +
          `</div>`;
      }

      els.settingsBody.innerHTML = html || '<div class="settings-loading">No usage data yet.</div>';
    } catch (err) {
      els.settingsBody.innerHTML = `<div class="settings-loading">Could not load usage: ${escapeHtml(err.message)}</div>`;
    }
  }

  function ensureFileInput() {
    let input = document.getElementById("fileInput");
    if (!input) {
      input = document.createElement("input");
      input.type = "file";
      input.id = "fileInput";
      input.multiple = true;
      input.accept = ".pdf,.docx,.txt,.md,.csv,.json";
      input.hidden = true;
      document.body.appendChild(input);
    }
    els.fileInput = input;
    return input;
  }

  function setActiveNav(id) {
    [els.navHome, els.navUpload, els.navProjects, els.navHistory].forEach((el) => {
      if (el) el.classList.toggle("is-active", el.id === id);
    });
  }

  function triggerUpload() {
    if (state.isProcessing) return;
    (els.fileInput || ensureFileInput()).click();
  }

  function bindEvents() {
    els.newChatBtn.addEventListener("click", () => {
      resetNewChat();
    });
    if (els.viewOnlyNewSession) {
      els.viewOnlyNewSession.addEventListener("click", () => {
        resetNewChat();
      });
    }
    els.sendBtn.addEventListener("click", handleSend);

    if (els.navHome) els.navHome.addEventListener("click", () => { setActiveNav("navHome"); resetNewChat(); });
    if (els.navUpload) els.navUpload.addEventListener("click", () => { setActiveNav("navHome"); triggerUpload(); });
    if (els.navProjects) {
      els.navProjects.addEventListener("click", () => {
        window.location.href = "projects.html";
      });
    }
    if (els.navHistory) {
      els.navHistory.addEventListener("click", () => {
        focusHistorySidebar();
      });
    }

    if (els.projectMenuRename) {
      els.projectMenuRename.addEventListener("click", async () => {
        const id = projectMenuTargetId;
        closeProjectMenu();
        if (!id) return;
        try {
          await renameProject(id);
        } catch (err) {
          window.alert(err.message || "Could not rename session");
        }
      });
    }
    if (els.projectMenuDelete) {
      els.projectMenuDelete.addEventListener("click", async () => {
        const id = projectMenuTargetId;
        closeProjectMenu();
        if (!id) return;
        try {
          await deleteProject(id);
        } catch (err) {
          window.alert(err.message || "Could not delete session");
        }
      });
    }
    if (els.projectMenuMove) {
      els.projectMenuMove.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = projectMenuTargetId;
        if (!id) return;
        if (els.folderMoveSubmenu?.classList.contains("hidden")) {
          renderFolderMoveSubmenu(id);
        } else {
          els.folderMoveSubmenu.classList.add("hidden");
        }
      });
    }
    if (els.projectItemMenu) {
      els.projectItemMenu.addEventListener("click", (e) => e.stopPropagation());
    }

    const submitNameDialog = () => {
      const value = els.nameDialogInput?.value ?? "";
      closeNameDialog(value);
    };
    els.nameDialogConfirm?.addEventListener("click", submitNameDialog);
    els.nameDialogCancel?.addEventListener("click", () => closeNameDialog(null));
    els.nameDialogClose?.addEventListener("click", () => closeNameDialog(null));
    els.nameDialog?.addEventListener("click", (e) => {
      if (e.target === els.nameDialog) closeNameDialog(null);
    });
    els.nameDialogInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submitNameDialog();
      }
    });

    if (els.sampleLink) {
      els.sampleLink.addEventListener("click", () => {
        els.composerInput.value = SAMPLE_TEXT;
        autosizeComposer();
        els.composerInput.focus();
        clearComposerError();
      });
    }

    if (els.mixBtn && els.mixPanel) {
      els.mixBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const wasHidden = els.mixPanel.classList.contains("hidden");
        if (wasHidden) {
          els.mixPanel.classList.remove("hidden");
          setMixPanelExpanded(true);
          els.mixBtn.classList.add("is-active");
          els.mixBtn.setAttribute("aria-expanded", "true");
        } else {
          closeMixPanel();
        }
      });
      els.mixSummaryBtn?.addEventListener("click", (e) => {
        e.stopPropagation();
        setMixPanelExpanded(!els.mixPanel.classList.contains("is-expanded"));
      });
      document.addEventListener("click", (e) => {
        if (els.mixPanel?.contains(e.target) || els.mixBtn?.contains(e.target)) return;
        closeMixPanel();
      });
      els.mixPanel.addEventListener("click", (e) => e.stopPropagation());
      els.mixMode?.querySelectorAll(".mix-mode-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          setQuizMode(btn.getAttribute("data-mode"));
        });
      });
      els.mixPresets?.querySelectorAll(".mix-preset").forEach((btn) => {
        btn.addEventListener("click", () => {
          applyMixPreset(btn.getAttribute("data-preset"));
          setMixPanelExpanded(false);
        });
      });
      els.mixTotalDown?.addEventListener("click", (e) => {
        e.stopPropagation();
        adjustMixTotal(-1);
      });
      els.mixTotalUp?.addEventListener("click", (e) => {
        e.stopPropagation();
        adjustMixTotal(1);
      });
      document.getElementById("mixExamPresets")?.querySelectorAll(".mix-exam-preset").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          state.examPreset = btn.getAttribute("data-exam") || "general";
          document.querySelectorAll(".mix-exam-preset").forEach((b) => b.classList.toggle("is-active", b === btn));
        });
      });
    }

    els.composerInput.addEventListener("input", () => {
      autosizeComposer();
      clearComposerError();
    });
    els.composerInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    const fileInput = ensureFileInput();
    els.attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      const files = Array.from(fileInput.files || []);
      state.pendingFiles = state.pendingFiles.concat(files);
      fileInput.value = "";
      renderAttachmentsBar();
      els.composerInput.focus();
    });

    els.avatarBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeProjectMenu();
      els.avatarMenu.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      els.avatarMenu.classList.add("hidden");
      closeProjectMenu();
    });
    els.avatarMenu.addEventListener("click", (e) => e.stopPropagation());

    document.getElementById("menuSettings").addEventListener("click", () => openSettings("account"));
    document.getElementById("menuUsage").addEventListener("click", () => openSettings("usage"));
    document.getElementById("menuBilling").addEventListener("click", () => openSettings("billing"));
    document.getElementById("menuPrivacy").addEventListener("click", () => {
      els.avatarMenu.classList.add("hidden");
      window.open("privacy.html", "_blank", "noopener");
    });
    document.getElementById("menuLogout").addEventListener("click", () => {
      window.authGuard.clearToken();
      window.location.href = "index.html";
    });

    document.querySelectorAll(".settings-tab").forEach((btn) => {
      btn.addEventListener("click", () => switchSettingsTab(btn.getAttribute("data-tab")));
    });
    els.settingsClose.addEventListener("click", closeSettings);
    els.settingsOverlay.addEventListener("click", (e) => {
      if (e.target === els.settingsOverlay) closeSettings();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (!els.nameDialog?.classList.contains("hidden")) closeNameDialog(null);
        else if (!els.settingsOverlay.classList.contains("hidden")) closeSettings();
        else closeProjectMenu();
      }
    });

    els.sidebarToggleBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleSidebar();
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

  function init() {
    if (!initAuth()) return;
    initSidebar();
    bindEvents();
    renderWelcome();
    setQuizMode(loadQuizMode());
    updateMixPanelUi();
    updateComposerPlaceholder();
    loadHistorySidebar();
    loadSidebarStreak();
    loadWrongbook();
    refreshCredits();
    els.wrongbookRefresh?.addEventListener("click", () => loadWrongbook());
    api("/api/settings")
      .then((data) => {
        if (data?.settings?.features) {
          state.appSettings = { ...state.appSettings, ...data.settings.features };
        }
      })
      .catch(() => {});
    autosizeComposer();
    els.composerInput.focus();

    // Deep link: #settings or #settings/usage etc.
    const hash = (window.location.hash || "").replace(/^#/, "");
    if (hash.startsWith("settings")) {
      const tab = hash.split("/")[1];
      openSettings(TAB_TITLES[tab] ? tab : "account");
    }

    const challenge = new URLSearchParams(window.location.search).get("challenge");
    const review = new URLSearchParams(window.location.search).get("review");
    const projectId = new URLSearchParams(window.location.search).get("project");
    if (challenge) startChallengeFromToken(challenge);
    else if (projectId) openProject(projectId);
    else if (review === "1") {
      setQuizMode("training");
      appendMessage("ai", `<p class="meta-line">Review mode — practice from your wrong-answer queue. Open a session with a study plan to begin.</p>`);
      loadWrongbook();
    }
    else if (hash === "history") focusHistorySidebar();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
