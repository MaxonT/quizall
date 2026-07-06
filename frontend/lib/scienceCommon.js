(function () {
  const data = window.quizallScienceData;
  if (!data) return;

  const DISMISSED_BADGES_KEY = "quizall.science.dismissedBadges";
  const DISABLE_ALL_BADGES_KEY = "quizall.science.disableAllBadges";
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

  const SEMANTIC_CATEGORIES = {
    mechanism: { id: "mechanism", label: "Mechanism" },
    action: { id: "action", label: "Action" },
    evidence: { id: "evidence", label: "Evidence" },
    outcome: { id: "outcome", label: "Outcome" },
    reference: { id: "reference", label: "Reference" }
  };

  const SEMANTIC_RULES = {
    mechanism: [
      /schema|cognitive|memory|encoding|retrieval|zpd|flow|forgetting|spacing|transfer|calibration|iteration|boundary|model|mechanism|gradient|workload|load/gi,
      /认知|记忆|编码|提取|检索|图式|负荷|遗忘|间隔|迁移|边界|模型|机制/gi
    ],
    action: [
      /upload|generate|practice|review|activate|track|test|explain|quiz|mindmap|apply|operational|workflow|session|output/gi,
      /上传|生成|练习|复习|激活|追踪|测试|解释|测验|思维导图|工作流|输出/gi
    ],
    evidence: [
      /study|studies|research|effect|finding|evidence|meta|experiment|replicated|paper|journal|result/gi,
      /研究|证据|效应|发现|实验|论文|期刊|结果|元分析/gi
    ],
    outcome: [
      /retention|durable|improve|improves|performance|mastery|accuracy|generalization|stability|long-term|better/gi,
      /保持|长期|提升|效果|表现|掌握|准确|泛化|稳定/gi
    ]
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

  function areAllBadgesDisabled() {
    return localStorage.getItem(DISABLE_ALL_BADGES_KEY) === "1";
  }

  function setAllBadgesDisabled(disabled) {
    if (disabled) {
      localStorage.setItem(DISABLE_ALL_BADGES_KEY, "1");
      return;
    }
    localStorage.removeItem(DISABLE_ALL_BADGES_KEY);
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
    return "/science/index.html" + hash;
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
      .qa-science-modal-legend {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 10px 0 2px;
      }
      .qa-sem-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        border: 1px solid var(--sem-line, rgba(148, 163, 184, 0.4));
        background: var(--sem-bg, rgba(15, 23, 42, 0.46));
        color: var(--sem-color, #cbd5e1);
        padding: 3px 9px;
        font-size: 0.72rem;
        font-weight: 700;
        letter-spacing: 0.01em;
        line-height: 1;
      }
      .qa-sem-chip::before {
        content: "";
        width: 7px;
        height: 7px;
        border-radius: 999px;
        background: currentColor;
        opacity: 0.94;
      }
      .qa-sem-chip.qa-cat-mechanism {
        --sem-bg: rgba(167, 139, 250, 0.18);
        --sem-line: rgba(167, 139, 250, 0.42);
        --sem-color: #c4b5fd;
      }
      .qa-sem-chip.qa-cat-action {
        --sem-bg: rgba(34, 211, 238, 0.16);
        --sem-line: rgba(34, 211, 238, 0.38);
        --sem-color: #67e8f9;
      }
      .qa-sem-chip.qa-cat-evidence {
        --sem-bg: rgba(251, 191, 36, 0.16);
        --sem-line: rgba(251, 191, 36, 0.4);
        --sem-color: #fcd34d;
      }
      .qa-sem-chip.qa-cat-outcome {
        --sem-bg: rgba(52, 211, 153, 0.16);
        --sem-line: rgba(52, 211, 153, 0.38);
        --sem-color: #6ee7b7;
      }
      .qa-sem-chip.qa-cat-reference {
        --sem-bg: rgba(251, 113, 133, 0.16);
        --sem-line: rgba(251, 113, 133, 0.36);
        --sem-color: #fda4af;
      }
      .qa-science-anno {
        display: inline-flex;
        align-items: flex-start;
        flex-wrap: wrap;
        gap: 8px;
      }
      .qa-science-anno .qa-science-anno-text {
        flex: 1 1 auto;
        min-width: 0;
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
      .qa-science-badge-optout {
        margin-top: 8px;
        font-size: 0.78rem;
        color: rgba(203, 213, 225, 0.88);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        user-select: none;
      }
      .qa-science-badge-optout input {
        width: 14px;
        height: 14px;
        accent-color: #22d3ee;
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
      '<div id="qaScienceModalLegend" class="qa-science-modal-legend" aria-label="Semantic categories"></div>' +
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
    const legendEl = modal.querySelector("#qaScienceModalLegend");
    const findingsEl = modal.querySelector("#qaScienceModalFindings");
    const citationsEl = modal.querySelector("#qaScienceModalCitations");

    if (!titleEl || !stepEl || !taglineEl || !descEl || !legendEl || !findingsEl || !citationsEl) return;

    stepEl.textContent = "STEP " + step.number;
    stepEl.style.color = step.color.accent;
    titleEl.textContent = step.title;
    taglineEl.innerHTML = renderSemanticLine(step.tagline, "action");
    descEl.innerHTML = renderSemanticLine(step.description, "mechanism");
    legendEl.innerHTML = buildSemanticLegend();

    findingsEl.innerHTML = "";
    step.keyFindings.forEach(function (finding) {
      const li = document.createElement("li");
      li.innerHTML = renderSemanticLine(finding, "evidence");
      findingsEl.appendChild(li);
    });

    citationsEl.innerHTML = "";
    step.citations.slice(0, 3).forEach(function (citation) {
      const li = document.createElement("li");
      li.innerHTML = renderSemanticLine(citation, "reference");
      citationsEl.appendChild(li);
    });

    modal.classList.add("open");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function scoreCategory(textValue, categoryId) {
    const rules = SEMANTIC_RULES[categoryId] || [];
    const input = String(textValue || "");
    let score = 0;
    rules.forEach(function (rule) {
      const matches = input.match(rule);
      if (matches && matches.length) score += matches.length;
    });
    return score;
  }

  function resolveSemanticCategory(textValue, fallbackId) {
    const normalizedFallback = SEMANTIC_CATEGORIES[fallbackId] ? fallbackId : "mechanism";
    if (normalizedFallback === "reference") return SEMANTIC_CATEGORIES.reference;
    let bestId = normalizedFallback;
    let bestScore = 0;
    ["mechanism", "action", "evidence", "outcome"].forEach(function (categoryId) {
      const score = scoreCategory(textValue, categoryId);
      if (score > bestScore) {
        bestScore = score;
        bestId = categoryId;
      }
    });
    return SEMANTIC_CATEGORIES[bestScore > 0 ? bestId : normalizedFallback];
  }

  function renderSemanticChip(categoryId) {
    const category = SEMANTIC_CATEGORIES[categoryId] || SEMANTIC_CATEGORIES.mechanism;
    return '<span class="qa-sem-chip qa-cat-' + category.id + '">' + category.label + '</span>';
  }

  function buildSemanticLegend() {
    return [
      renderSemanticChip("mechanism"),
      renderSemanticChip("action"),
      renderSemanticChip("evidence"),
      renderSemanticChip("outcome"),
      renderSemanticChip("reference")
    ].join("");
  }

  function renderSemanticLine(textValue, fallbackId) {
    const category = resolveSemanticCategory(textValue, fallbackId);
    return (
      '<span class="qa-science-anno">' +
        renderSemanticChip(category.id) +
        '<span class="qa-science-anno-text">' + escapeHtml(textValue) + '</span>' +
      '</span>'
    );
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
    if (areAllBadgesDisabled()) return false;
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
      '</div>' +
      '<label class="qa-science-badge-optout"><input type="checkbox" data-disable-all="1" />Do not show this again</label>';

    host.appendChild(card);

    const dismissBtn = card.querySelector("[data-dismiss='1']");
    if (dismissBtn) {
      dismissBtn.addEventListener("click", function () {
        const disableAllInput = card.querySelector("[data-disable-all='1']");
        if (disableAllInput && disableAllInput.checked) {
          setAllBadgesDisabled(true);
        }
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

  function renderSciencePrescription({ weakTopics, dueReviews, lastSession } = {}) {
    const due = Number(dueReviews) || 0;
    if (due > 0) {
      return {
        step: 6,
        text: `You have ${due} topics due for spaced review. Open your wrong-answer queue before they decay.`,
        href: toScienceUrl("step06"),
      };
    }
    if (weakTopics?.length) {
      return {
        step: 4,
        text: `Weak on ${weakTopics.slice(0, 2).join(", ")} — use Training mode for variable practice (Step 04).`,
        href: toScienceUrl("step04"),
      };
    }
    if (lastSession === "quiz") {
      return {
        step: 3,
        text: "Great retrieval session. Schedule a follow-up quiz within 48 hours (Step 03).",
        href: toScienceUrl("step03"),
      };
    }
    return {
      step: 1,
      text: "Start with structure: upload materials and build a study plan (Step 01).",
      href: toScienceUrl("step01"),
    };
  }

  window.quizallScience = {
    BADGES: BADGES,
    toScienceUrl: toScienceUrl,
    openStepModal: openStepModal,
    renderStepGrid: renderStepGrid,
    showBadge: showBadge,
    isBadgeDismissed: isBadgeDismissed,
    dismissBadge: dismissBadge,
    areAllBadgesDisabled: areAllBadgesDisabled,
    setAllBadgesDisabled: setAllBadgesDisabled,
    markProjectFlags: markProjectFlags,
    getProjectFlags: getProjectFlags,
    deriveProjectActivations: deriveProjectActivations,
    queuePendingBadge: queuePendingBadge,
    consumePendingBadge: consumePendingBadge,
    renderSciencePrescription: renderSciencePrescription,
  };
})();
