(function () {
  const data = window.quizallScienceData;
  if (!data) return;

  const DISMISSED_BADGES_KEY = "quizall.science.dismissedBadges";
  const PROJECT_FLAGS_KEY = "quizall.science.projectFlags";
  const PENDING_BADGE_KEY = "quizall.science.pendingBadge";

  const BADGES = {
    files_uploaded: {
      id: "files_uploaded",
      title: "Why this upload step matters",
      body: "You just activated Step 01 and Step 02: schema activation and broad exposure. Uploading materials first gives the model enough context to build better retrieval paths.",
      stepIds: ["step01", "step02"],
      linkStepId: "step01"
    },
    mindmap_generated: {
      id: "mindmap_generated",
      title: "Why the mindmap step works",
      body: "You just activated Step 05: variability training. Seeing the same concept through multiple branches improves transfer and reduces overfitting to one format.",
      stepIds: ["step05"],
      linkStepId: "step05"
    },
    quiz_completed: {
      id: "quiz_completed",
      title: "This is the highest-impact moment",
      body: "You just activated Step 03 and Step 04: retrieval practice and boundary iteration. Output-first learning is where durable memory updates happen.",
      stepIds: ["step03", "step04"],
      linkStepId: "step03"
    },
    analytics_opened: {
      id: "analytics_opened",
      title: "Why analytics matters",
      body: "You just activated Step 06: spaced repetition. Performance tracking is how you time review before forgetting accelerates.",
      stepIds: ["step06"],
      linkStepId: "step06"
    }
  };

  function safeJsonParse(value, fallback) {
    try {
      if (!value) return fallback;
      return JSON.parse(value);
    } catch (_) {
      return fallback;
    }
  }

  function readStore(key, fallback) {
    return safeJsonParse(localStorage.getItem(key), fallback);
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getDismissedBadges() {
    return readStore(DISMISSED_BADGES_KEY, {});
  }

  function isBadgeDismissed(badgeId) {
    const dismissed = getDismissedBadges();
    return dismissed[badgeId] === true;
  }

  function dismissBadge(badgeId) {
    const dismissed = getDismissedBadges();
    dismissed[badgeId] = true;
    writeStore(DISMISSED_BADGES_KEY, dismissed);
  }

  function getProjectFlags(projectId) {
    if (!projectId) return {};
    const allFlags = readStore(PROJECT_FLAGS_KEY, {});
    return allFlags[projectId] || {};
  }

  function markProjectFlags(projectId, nextFlags) {
    if (!projectId || !nextFlags || typeof nextFlags !== "object") return;
    const allFlags = readStore(PROJECT_FLAGS_KEY, {});
    const current = allFlags[projectId] || {};
    allFlags[projectId] = Object.assign({}, current, nextFlags, {
      updatedAt: new Date().toISOString()
    });
    writeStore(PROJECT_FLAGS_KEY, allFlags);
  }

  function deriveProjectActivations(projectId, projectDetail) {
    const detail = projectDetail || {};
    const files = Array.isArray(detail.files) ? detail.files : [];
    const analyticsTrend = Array.isArray(detail.analytics && detail.analytics.trend)
      ? detail.analytics.trend
      : [];
    const hasMindmap = !!(detail.examPrep && detail.examPrep.mindmap);

    const flags = getProjectFlags(projectId);
    const hasFiles = files.length > 0 || !!flags.filesUploaded;
    const hasQuiz = analyticsTrend.length > 0 || !!flags.quizCompleted;
    const hasMindmapActivated = hasMindmap || !!flags.mindmapGenerated;
    const hasAnalyticsViewed = !!flags.analyticsViewed;

    return {
      step01: hasFiles,
      step02: hasFiles,
      step03: hasQuiz,
      step04: hasQuiz,
      step05: hasMindmapActivated,
      step06: hasAnalyticsViewed
    };
  }

  function toScienceUrl(stepId) {
    const hash = stepId ? "#" + stepId : "";
    return "/science" + hash;
  }

  function ensureModalStyles() {
    if (document.getElementById("quizallScienceCommonStyles")) return;

    const style = document.createElement("style");
    style.id = "quizallScienceCommonStyles";
    style.textContent = `
      .qa-science-modal-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1200;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(2, 6, 23, 0.72);
        padding: 16px;
      }
      .qa-science-modal-backdrop.open { display: flex; }
      .qa-science-modal {
        width: min(760px, 95vw);
        max-height: 88vh;
        overflow: auto;
        border: 1px solid rgba(148, 163, 184, 0.35);
        border-radius: 16px;
        background: linear-gradient(180deg, rgba(10,15,34,0.97), rgba(7,12,28,0.98));
        box-shadow: 0 22px 48px rgba(2, 6, 23, 0.62);
        padding: 18px;
        color: #e2e8f0;
      }
      .qa-science-modal-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
      }
      .qa-science-modal-step {
        font-size: 0.76rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .qa-science-modal h3 {
        margin: 0;
        font-size: 1.28rem;
      }
      .qa-science-modal p {
        margin: 10px 0;
        line-height: 1.6;
        color: rgba(226, 232, 240, 0.95);
      }
      .qa-science-modal ul {
        margin: 12px 0 0;
        padding-left: 20px;
        display: grid;
        gap: 6px;
      }
      .qa-science-modal li {
        line-height: 1.55;
      }
      .qa-science-citations {
        margin-top: 14px;
        border-top: 1px solid rgba(148, 163, 184, 0.26);
        padding-top: 10px;
      }
      .qa-science-citations ol {
        margin: 0;
        padding-left: 18px;
        display: grid;
        gap: 7px;
      }
      .qa-science-citations li {
        font-size: 0.86rem;
        color: rgba(226, 232, 240, 0.88);
        line-height: 1.45;
      }
      .qa-science-close {
        border: 1px solid rgba(148, 163, 184, 0.35);
        background: rgba(15,23,42,0.8);
        color: #e2e8f0;
        border-radius: 8px;
        padding: 6px 10px;
        cursor: pointer;
        font: inherit;
      }
      .qa-science-close:hover { border-color: rgba(34, 211, 238, 0.62); }

      .qa-science-badge-host {
        position: fixed;
        top: 88px;
        right: 16px;
        z-index: 1100;
        width: min(400px, calc(100vw - 32px));
        pointer-events: none;
      }
      .qa-science-badge {
        pointer-events: auto;
        border-radius: 14px;
        border: 1px solid rgba(148,163,184,0.36);
        background: linear-gradient(155deg, rgba(12,18,40,0.97), rgba(7,12,26,0.97));
        box-shadow: 0 18px 36px rgba(2, 6, 23, 0.5);
        padding: 14px;
      }
      .qa-science-badge h4 {
        margin: 0;
        font-size: 1rem;
      }
      .qa-science-badge p {
        margin: 8px 0 10px;
        line-height: 1.54;
        color: rgba(226, 232, 240, 0.94);
        font-size: 0.92rem;
      }
      .qa-science-badge-actions {
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }
      .qa-science-badge-link {
        color: #67e8f9;
        text-decoration: none;
        font-weight: 700;
      }
      .qa-science-badge-link:hover { text-decoration: underline; }
      .qa-science-badge-dismiss {
        border: 1px solid rgba(148,163,184,0.34);
        border-radius: 8px;
        padding: 6px 10px;
        background: rgba(15,23,42,0.75);
        color: #cbd5e1;
        font: inherit;
        cursor: pointer;
      }
      .qa-science-badge-dismiss:hover { border-color: rgba(148,163,184,0.6); }

      .qa-science-step-grid {
        display: grid;
        gap: 10px;
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
      .qa-science-step-btn {
        border: 1px solid rgba(148,163,184,0.28);
        border-radius: 12px;
        background: rgba(15,23,42,0.5);
        color: #e2e8f0;
        padding: 10px 8px;
        min-height: 78px;
        cursor: pointer;
        text-align: left;
        transition: border-color .2s ease, transform .2s ease, background-color .2s ease;
      }
      .qa-science-step-btn:hover {
        border-color: rgba(34,211,238,0.55);
        transform: translateY(-1px);
      }
      .qa-science-step-btn .num {
        display: inline-block;
        font-weight: 800;
        font-size: 0.78rem;
        letter-spacing: 0.08em;
        margin-bottom: 8px;
      }
      .qa-science-step-btn .txt {
        display: block;
        font-size: 0.8rem;
        line-height: 1.35;
      }
      .qa-science-step-btn.locked {
        opacity: 0.68;
      }
      .qa-science-step-btn .state {
        display: block;
        font-size: 0.72rem;
        margin-top: 6px;
        color: #94a3b8;
      }
      @media (max-width: 980px) {
        .qa-science-step-grid {
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
      }
      @media (max-width: 560px) {
        .qa-science-step-grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureModal() {
    ensureModalStyles();
    let backdrop = document.getElementById("qaScienceModalBackdrop");
    if (backdrop) return backdrop;

    backdrop = document.createElement("div");
    backdrop.id = "qaScienceModalBackdrop";
    backdrop.className = "qa-science-modal-backdrop";
    backdrop.innerHTML =
      '<div class="qa-science-modal" role="dialog" aria-modal="true" aria-labelledby="qaScienceModalTitle">' +
      '<div class="qa-science-modal-head">' +
      '<div>' +
      '<div id="qaScienceModalStep" class="qa-science-modal-step"></div>' +
      '<h3 id="qaScienceModalTitle"></h3>' +
      '</div>' +
      '<button type="button" class="qa-science-close" id="qaScienceModalClose">Close</button>' +
      '</div>' +
      '<p id="qaScienceModalTagline"></p>' +
      '<p id="qaScienceModalDescription"></p>' +
      '<ul id="qaScienceModalFindings"></ul>' +
      '<div class="qa-science-citations">' +
      '<strong>Top citations</strong>' +
      '<ol id="qaScienceModalCitations"></ol>' +
      '</div>' +
      '</div>';

    document.body.appendChild(backdrop);

    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) {
        backdrop.classList.remove("open");
      }
    });

    const closeBtn = backdrop.querySelector("#qaScienceModalClose");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        backdrop.classList.remove("open");
      });
    }

    return backdrop;
  }

  function openStepModal(stepId) {
    const step = data.getStepById(stepId);
    if (!step) return;

    const modal = ensureModal();
    const titleEl = modal.querySelector("#qaScienceModalTitle");
    const stepEl = modal.querySelector("#qaScienceModalStep");
    const taglineEl = modal.querySelector("#qaScienceModalTagline");
    const descEl = modal.querySelector("#qaScienceModalDescription");
    const findingsEl = modal.querySelector("#qaScienceModalFindings");
    const citationsEl = modal.querySelector("#qaScienceModalCitations");

    if (!titleEl || !stepEl || !taglineEl || !descEl || !findingsEl || !citationsEl) return;

    stepEl.textContent = "STEP " + step.number;
    stepEl.style.color = step.color.accent;
    titleEl.textContent = step.title;
    taglineEl.textContent = step.tagline;
    descEl.textContent = step.description;

    findingsEl.innerHTML = "";
    step.keyFindings.forEach(function (finding) {
      const li = document.createElement("li");
      li.textContent = finding;
      findingsEl.appendChild(li);
    });

    citationsEl.innerHTML = "";
    step.citations.slice(0, 3).forEach(function (citation) {
      const li = document.createElement("li");
      li.textContent = citation;
      citationsEl.appendChild(li);
    });

    modal.classList.add("open");
  }

  function renderStepGrid(container, options) {
    if (!container) return;
    ensureModalStyles();

    const opts = options || {};
    const activations = opts.activations || {};

    container.classList.add("qa-science-step-grid");
    container.innerHTML = "";

    data.steps.forEach(function (step) {
      const isActive = activations[step.id] !== false;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "qa-science-step-btn" + (isActive ? "" : " locked");
      button.setAttribute("data-step-id", step.id);
      button.style.borderColor = isActive ? step.color.darkTint : "rgba(148,163,184,0.28)";
      button.style.background = isActive ? "linear-gradient(155deg, " + step.color.darkTint + ", rgba(15,23,42,0.5))" : "rgba(15,23,42,0.45)";

      const stateText = isActive
        ? (opts.activeLabel || "Activated")
        : ((opts.lockedHints && opts.lockedHints[step.id]) || opts.lockedLabel || "Locked");

      button.innerHTML =
        '<span class="num" style="color:' + step.color.accent + ';">STEP ' + step.number + '</span>' +
        '<span class="txt">' + step.title + '</span>' +
        '<span class="state">' + stateText + '</span>';

      button.addEventListener("click", function () {
        if (typeof opts.onStepClick === "function") {
          opts.onStepClick(step);
          return;
        }
        openStepModal(step.id);
      });

      container.appendChild(button);
    });
  }

  function getBadgeHost(explicitHost) {
    ensureModalStyles();
    if (explicitHost) return explicitHost;

    let host = document.getElementById("scienceBadgeHost");
    if (host) {
      host.classList.add("qa-science-badge-host");
      return host;
    }

    host = document.createElement("div");
    host.id = "scienceBadgeHost";
    host.className = "qa-science-badge-host";
    document.body.appendChild(host);
    return host;
  }

  function showBadge(badgeId, options) {
    const badge = BADGES[badgeId];
    if (!badge) return false;
    if (isBadgeDismissed(badgeId)) return false;

    const opts = options || {};
    const host = getBadgeHost(opts.host || null);

    host.innerHTML = "";

    const card = document.createElement("div");
    card.className = "qa-science-badge";

    const stepLink = toScienceUrl(opts.stepId || badge.linkStepId);
    card.innerHTML =
      '<h4>' + badge.title + '</h4>' +
      '<p>' + badge.body + '</p>' +
      '<div class="qa-science-badge-actions">' +
      '<a class="qa-science-badge-link" href="' + stepLink + '">Read the full research -></a>' +
      '<button type="button" class="qa-science-badge-dismiss" data-dismiss="1">Dismiss</button>' +
      '</div>';

    host.appendChild(card);

    const dismissBtn = card.querySelector("[data-dismiss='1']");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", function () {
        dismissBadge(badgeId);
        host.innerHTML = "";
      });
    }

    return true;
  }

  function queuePendingBadge(payload) {
    if (!payload || !payload.badgeId) return;
    writeStore(PENDING_BADGE_KEY, {
      badgeId: payload.badgeId,
      projectId: payload.projectId || null,
      stepId: payload.stepId || null,
      queuedAt: new Date().toISOString()
    });
  }

  function consumePendingBadge() {
    const pending = readStore(PENDING_BADGE_KEY, null);
    if (!pending || !pending.badgeId) return null;
    localStorage.removeItem(PENDING_BADGE_KEY);
    return pending;
  }

  window.quizallScience = {
    BADGES: BADGES,
    toScienceUrl: toScienceUrl,
    openStepModal: openStepModal,
    renderStepGrid: renderStepGrid,
    showBadge: showBadge,
    isBadgeDismissed: isBadgeDismissed,
    dismissBadge: dismissBadge,
    markProjectFlags: markProjectFlags,
    getProjectFlags: getProjectFlags,
    deriveProjectActivations: deriveProjectActivations,
    queuePendingBadge: queuePendingBadge,
    consumePendingBadge: consumePendingBadge
  };
})();
