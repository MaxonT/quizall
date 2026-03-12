(function () {
  var data = window.examPrepTemplateData || {};
  var api = window.examPrepTemplateApi;
  if (!api) {
    console.error("[exam-prep-template] Missing window.examPrepTemplateApi");
    return;
  }

  var state = {
    projects: [],
    selectedProjectId: null,
    projectDetail: null,
    pendingFiles: [],
    selectedOutlineFileId: null,
    mindmap: null,
    selectedTypes: new Set(),
    numQuestions: 10,
    currentTab: "quiz",
    busy: false,
    activations: {
      filesUploaded: false,
      quizCompleted: false,
      mindmapGenerated: false,
      analyticsViewed: false
    }
  };

  var els = {
    heroTitle: document.getElementById("epHeroTitle"),
    heroBody: document.getElementById("epHeroBody"),
    stageNav: document.getElementById("epStageNav"),

    projectSelect: document.getElementById("epProjectSelect"),
    refreshProjectsBtn: document.getElementById("epRefreshProjectsBtn"),
    newProjectBtn: document.getElementById("epNewProjectBtn"),
    projectSummary: document.getElementById("epProjectSummary"),
    statFiles: document.getElementById("epStatFiles"),
    statQuizSessions: document.getElementById("epStatQuizSessions"),
    statAccuracy: document.getElementById("epStatAccuracy"),

    dropzone: document.getElementById("epDropzone"),
    fileInput: document.getElementById("epFileInput"),
    clearPendingBtn: document.getElementById("epClearPendingBtn"),
    saveFilesBtn: document.getElementById("epSaveFilesBtn"),
    pendingFiles: document.getElementById("epPendingFiles"),
    savedFiles: document.getElementById("epSavedFiles"),

    topicsInput: document.getElementById("epTopicsInput"),
    emailTemplate: document.getElementById("epEmailTemplate"),
    copyTemplateBtn: document.getElementById("epCopyTemplateBtn"),
    scanOutlineBtn: document.getElementById("epScanOutlineBtn"),
    generateMindmapBtn: document.getElementById("epGenerateMindmapBtn"),
    outlineCandidates: document.getElementById("epOutlineCandidates"),
    mindmapShell: document.getElementById("epMindmapShell"),
    mindmapTitle: document.getElementById("epMindmapTitle"),
    mindmapMeta: document.getElementById("epMindmapMeta"),
    mindmapTree: document.getElementById("epMindmapTree"),
    addRootNodeBtn: document.getElementById("epAddRootNodeBtn"),
    saveMindmapBtn: document.getElementById("epSaveMindmapBtn"),

    projectTabs: document.getElementById("epProjectTabs"),
    panels: document.querySelectorAll("[data-panel]"),
    typeToggles: document.getElementById("epTypeToggles"),
    numToggles: document.getElementById("epNumToggles"),
    generateQuizBtn: document.getElementById("epGenerateQuizBtn"),

    chartModeButtons: Array.prototype.slice.call(document.querySelectorAll("[data-chart-mode]")),
    chartSvg: document.getElementById("epChartSvg"),
    chartShell: document.getElementById("epChartShell"),
    chartTooltip: document.getElementById("epChartTooltip"),

    scienceGrid: document.getElementById("epScienceGrid"),
    scienceNotes: document.getElementById("epScienceNotes"),

    statusMessage: document.getElementById("epStatusMessage"),

    newProjectModal: document.getElementById("epNewProjectModal"),
    projectNameInput: document.getElementById("epProjectNameInput"),
    projectExamNameInput: document.getElementById("epProjectExamNameInput"),
    projectExamDateInput: document.getElementById("epProjectExamDateInput"),
    projectDescInput: document.getElementById("epProjectDescInput"),
    cancelProjectBtn: document.getElementById("epCancelProjectBtn"),
    createProjectBtn: document.getElementById("epCreateProjectBtn")
  };

  function escapeHtml(text) {
    var div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function smoothPath(points) {
    if (!points.length) return "";
    var d = "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (var i = 1; i < points.length; i += 1) {
      var prev = points[i - 1];
      var curr = points[i];
      var c1x = prev.x + (curr.x - prev.x) * 0.38;
      var c1y = prev.y;
      var c2x = prev.x + (curr.x - prev.x) * 0.62;
      var c2y = curr.y;
      d += " C " + c1x.toFixed(2) + " " + c1y.toFixed(2) + ", " + c2x.toFixed(2) + " " + c2y.toFixed(2) + ", " + curr.x.toFixed(2) + " " + curr.y.toFixed(2);
    }
    return d;
  }

  function setStatus(message, type) {
    els.statusMessage.textContent = message;
    els.statusMessage.className = "ep-status ep-status-global" + (type ? " " + type : "");
  }

  function setBusy(value) {
    state.busy = value;
    [
      els.refreshProjectsBtn,
      els.newProjectBtn,
      els.clearPendingBtn,
      els.saveFilesBtn,
      els.copyTemplateBtn,
      els.scanOutlineBtn,
      els.generateMindmapBtn,
      els.addRootNodeBtn,
      els.saveMindmapBtn,
      els.generateQuizBtn,
      els.cancelProjectBtn,
      els.createProjectBtn
    ].forEach(function (button) {
      if (!button) return;
      button.disabled = value;
    });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  function renderHero() {
    if (data.hero && data.hero.title) els.heroTitle.textContent = data.hero.title;
    if (data.hero && data.hero.body) els.heroBody.textContent = data.hero.body;
    if (els.emailTemplate) els.emailTemplate.value = data.emailTemplate || "";
  }

  function renderStageRail() {
    if (!els.stageNav) return;
    var steps = [
      { id: "ep-step-1", title: "Project Scope" },
      { id: "ep-step-2", title: "Materials" },
      { id: "ep-step-3", title: "Topics + Mindmap" },
      { id: "ep-step-4", title: "Tabs" },
      { id: "ep-step-5", title: "Quiz Session" },
      { id: "ep-step-6", title: "Analytics" }
    ];

    steps.forEach(function (step, idx) {
      var link = document.createElement("a");
      link.href = "#" + step.id;
      link.className = "ep-stage-link";
      link.dataset.stageId = step.id;
      link.innerHTML =
        '<span class="ep-stage-index">' + String(idx + 1).padStart(2, "0") + "</span>" +
        '<span class="ep-stage-text">' +
          '<span class="ep-stage-main">Stage ' + (idx + 1) + "</span>" +
          '<span class="ep-stage-sub">' + escapeHtml(step.title) + "</span>" +
        "</span>";
      els.stageNav.appendChild(link);
    });

    function setActive(id) {
      var links = els.stageNav.querySelectorAll(".ep-stage-link");
      links.forEach(function (link) {
        link.classList.toggle("is-active", link.dataset.stageId === id);
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries
        .filter(function (entry) { return entry.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (!visible.length) return;
      setActive(visible[0].target.id);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5] });

    steps.forEach(function (step, idx) {
      var el = document.getElementById(step.id);
      if (el) observer.observe(el);
      if (idx === 0) setActive(step.id);
    });
  }

  function renderProjectSelect() {
    if (!state.projects.length) {
      els.projectSelect.innerHTML = '<option value="">No project yet</option>';
      els.projectSelect.disabled = true;
      return;
    }
    els.projectSelect.disabled = false;
    els.projectSelect.innerHTML = state.projects.map(function (project) {
      var selected = project.id === state.selectedProjectId ? " selected" : "";
      return '<option value="' + project.id + '"' + selected + ">" + escapeHtml(project.name) + "</option>";
    }).join("");
  }

  function renderSummary() {
    var detail = state.projectDetail;
    if (!detail) {
      els.projectSummary.textContent = "Select or create a project.";
      els.statFiles.textContent = "0";
      els.statQuizSessions.textContent = "0";
      els.statAccuracy.textContent = "—";
      return;
    }

    var trend = (detail.analytics && detail.analytics.trend) || [];
    var latest = trend.length ? trend[trend.length - 1].accuracy : null;
    els.projectSummary.innerHTML =
      "<strong>" + escapeHtml(detail.name) + "</strong>" +
      (detail.examDate ? " · Exam: " + escapeHtml(detail.examDate) : "") +
      (detail.description ? "<br><span>" + escapeHtml(detail.description) + "</span>" : "");
    els.statFiles.textContent = String((detail.files || []).length);
    els.statQuizSessions.textContent = String(trend.length);
    els.statAccuracy.textContent = latest == null ? "—" : latest + "%";
  }

  function renderPendingFiles() {
    if (!state.pendingFiles.length) {
      els.pendingFiles.innerHTML = '<p class="ep-list-sub">No pending files.</p>';
      return;
    }
    els.pendingFiles.innerHTML = state.pendingFiles.map(function (file, idx) {
      return (
        '<div class="ep-list-item">' +
          '<div class="ep-list-meta">' +
            '<div class="ep-list-title">' + escapeHtml(file.name) + "</div>" +
            '<div class="ep-list-sub">' + formatBytes(file.size || 0) + "</div>" +
          "</div>" +
          '<button class="ep-btn ep-btn-soft" data-remove-pending="' + idx + '" type="button">Remove</button>' +
        "</div>"
      );
    }).join("");
  }

  function renderSavedFiles() {
    var files = (state.projectDetail && state.projectDetail.files) || [];
    if (!files.length) {
      els.savedFiles.innerHTML = '<p class="ep-list-sub">No saved files in this project.</p>';
      return;
    }
    els.savedFiles.innerHTML = files.map(function (file) {
      return (
        '<div class="ep-list-item">' +
          '<div class="ep-list-meta">' +
            '<div class="ep-list-title">' + escapeHtml(file.fileName) + "</div>" +
            '<div class="ep-list-sub">' + formatBytes(file.contentLength || 0) + (file.isOutlineCandidate ? " · outline candidate" : "") + "</div>" +
          "</div>" +
        "</div>"
      );
    }).join("");
  }

  function renderOutlineCandidates(payload) {
    var candidates = (payload && payload.candidates) || [];
    if (!candidates.length) {
      els.outlineCandidates.innerHTML = '<p class="ep-list-sub">No obvious outline files found.</p>';
      return;
    }
    if (payload.recommendedFileId && !state.selectedOutlineFileId) {
      state.selectedOutlineFileId = payload.recommendedFileId;
    }
    els.outlineCandidates.innerHTML = candidates.map(function (candidate) {
      var selected = candidate.id === state.selectedOutlineFileId;
      return (
        '<div class="ep-list-item">' +
          '<div class="ep-list-meta">' +
            '<div class="ep-list-title">' + escapeHtml(candidate.fileName) + "</div>" +
            '<div class="ep-list-sub">Score ' + candidate.score + " · " + escapeHtml(candidate.preview || "") + "</div>" +
          "</div>" +
          '<button class="ep-btn ' + (selected ? "ep-btn-primary" : "ep-btn-soft") + '" data-outline-id="' + candidate.id + '" type="button">' + (selected ? "Selected" : "Use This") + "</button>" +
        "</div>"
      );
    }).join("");
  }

  function renderToggles() {
    var types = data.types || [];
    var counts = data.questionCounts || [5, 8, 10, 15];
    state.selectedTypes = new Set(types.filter(function (item) { return item.active; }).map(function (item) { return item.value; }));
    state.numQuestions = data.defaultQuestionCount || 10;

    els.typeToggles.innerHTML = types.map(function (item) {
      var active = state.selectedTypes.has(item.value);
      return '<button type="button" class="ep-toggle' + (active ? " is-active" : "") + '" data-type="' + item.value + '">' + escapeHtml(item.label) + "</button>";
    }).join("");

    els.numToggles.innerHTML = counts.map(function (num) {
      var active = Number(num) === state.numQuestions;
      return '<button type="button" class="ep-toggle' + (active ? " is-active" : "") + '" data-num="' + num + '">' + num + "</button>";
    }).join("");
  }

  function setTab(tab, options) {
    state.currentTab = tab;
    var opts = options || {};
    var buttons = els.projectTabs.querySelectorAll("[data-tab]");
    buttons.forEach(function (button) {
      button.classList.toggle("is-active", button.getAttribute("data-tab") === tab);
    });
    els.panels.forEach(function (panel) {
      panel.classList.toggle("is-active", panel.getAttribute("data-panel") === tab);
    });

    if (tab === "analytics") {
      state.activations.analyticsViewed = true;
      renderScience();
      renderChart(chartState.mode || "theory");
    }
    if (tab === "science" && !opts.silent) {
      renderScience();
    }
  }

  function findNode(nodeId, nodes) {
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      if (node.id === nodeId) return { node: node, parentNodes: nodes, index: i };
      var found = findNode(nodeId, node.children || []);
      if (found) return found;
    }
    return null;
  }

  function renderMindNode(node, depth) {
    var wrapper = document.createElement("div");
    wrapper.className = "ep-mind-node status-" + (node.status || "gray");
    if (depth > 0) wrapper.style.marginLeft = Math.min(depth * 14, 70) + "px";

    var row = document.createElement("div");
    row.className = "ep-mind-row";
    row.innerHTML =
      '<div class="ep-mind-label" contenteditable="true" data-node-id="' + node.id + '">' + escapeHtml(node.text || "") + "</div>" +
      '<div class="ep-mind-actions">' +
        '<button class="ep-node-btn" type="button" data-node-action="add" data-node-id="' + node.id + '">+</button>' +
        '<button class="ep-node-btn" type="button" data-node-action="delete" data-node-id="' + node.id + '">-</button>' +
      "</div>";
    wrapper.appendChild(row);

    if (Array.isArray(node.children) && node.children.length) {
      var children = document.createElement("div");
      children.className = "ep-mind-children";
      node.children.forEach(function (child) {
        children.appendChild(renderMindNode(child, depth + 1));
      });
      wrapper.appendChild(children);
    }

    return wrapper;
  }

  function renderMindmap() {
    if (!state.mindmap || !Array.isArray(state.mindmap.nodes)) {
      els.mindmapShell.hidden = true;
      return;
    }

    els.mindmapShell.hidden = false;
    els.mindmapTitle.textContent = state.mindmap.title || "ExamTopics Mindmap";
    var dateText = state.mindmap.generatedAt ? new Date(state.mindmap.generatedAt).toLocaleString() : "just now";
    els.mindmapMeta.textContent = (state.mindmap.message || "Generated for this project.") + " · " + dateText;
    els.mindmapTree.innerHTML = "";
    state.mindmap.nodes.forEach(function (node) {
      els.mindmapTree.appendChild(renderMindNode(node, 0));
    });
  }

  function deriveActivations() {
    return {
      step01: state.activations.filesUploaded,
      step02: state.activations.filesUploaded,
      step03: state.activations.quizCompleted,
      step04: state.activations.quizCompleted,
      step05: state.activations.mindmapGenerated,
      step06: state.activations.analyticsViewed
    };
  }

  function renderScience() {
    var steps = data.scienceSteps || [];
    var activeMap = deriveActivations();

    els.scienceGrid.innerHTML = steps.map(function (step) {
      var active = !!activeMap[step.id];
      return (
        '<article class="ep-science-step' + (active ? " is-active" : "") + '">' +
          "<h4>Step " + String(step.number).padStart(2, "0") + " · " + escapeHtml(step.title) + "</h4>" +
          "<p>" + escapeHtml(active ? "Activated in this project." : step.unlockHint) + "</p>" +
        "</article>"
      );
    }).join("");

    var notes = [
      {
        title: "Files -> Step 01 + 02",
        text: activeMap.step01 ? "Unlocked by uploaded files." : "Upload at least one file."
      },
      {
        title: "Quiz -> Step 03 + 04",
        text: activeMap.step03 ? "Unlocked by completed quiz session." : "Complete one quiz session."
      },
      {
        title: "Mindmap -> Step 05",
        text: activeMap.step05 ? "Unlocked by generated mindmap." : "Generate a mindmap."
      },
      {
        title: "Analytics -> Step 06",
        text: activeMap.step06 ? "Unlocked by analytics tab visit." : "Open analytics tab."
      }
    ];

    els.scienceNotes.innerHTML = notes.map(function (note) {
      return '<article class="ep-note"><strong>' + escapeHtml(note.title) + "</strong>" + escapeHtml(note.text) + "</article>";
    }).join("");
  }

  var chartState = { mode: "theory" };

  function xFor(timeValue, times, view) {
    var minT = times[0];
    var maxT = times[times.length - 1];
    var ratio = (Math.log(timeValue) - Math.log(minT)) / (Math.log(maxT) - Math.log(minT));
    return view.xStart + ratio * (view.xEnd - view.xStart);
  }

  function yFor(retentionValue, view) {
    var minR = 0.1;
    var maxR = 0.95;
    var ratio = (retentionValue - minR) / (maxR - minR);
    return view.yBottom - ratio * (view.yBottom - view.yTop);
  }

  function renderChart(mode) {
    chartState.mode = mode;
    var analytics = data.analytics || {};
    var dataset = (analytics.datasets && analytics.datasets[mode]) || (analytics.datasets && analytics.datasets.theory);
    if (!dataset || !els.chartSvg) return;

    var view = { width: 980, height: 430, xStart: 86, xEnd: 946, yTop: 38, yBottom: 368 };
    var times = dataset.times || [1, 3, 7, 14, 30, 60];
    var threshold = 0.66;
    var yTicks = [0.9, 0.7, 0.5, 0.3];

    var methodPoints = times.map(function (time, idx) {
      return { x: xFor(time, times, view), y: yFor(dataset.method[idx], view), t: time, v: dataset.method[idx] };
    });
    var cramPoints = times.map(function (time, idx) {
      return { x: xFor(time, times, view), y: yFor(dataset.cramming[idx], view), t: time, v: dataset.cramming[idx] };
    });

    var upper = methodPoints.map(function (point, idx) {
      return { x: point.x, y: yFor(clamp(point.v + dataset.band[idx], 0.1, 0.95), view) };
    });
    var lower = methodPoints.map(function (point, idx) {
      return { x: point.x, y: yFor(clamp(point.v - dataset.band[idx], 0.1, 0.95), view) };
    });
    var bandPath = smoothPath(upper);
    for (var i = lower.length - 1; i >= 0; i -= 1) {
      bandPath += " L " + lower[i].x.toFixed(2) + " " + lower[i].y.toFixed(2);
    }
    bandPath += " Z";

    var methodPath = smoothPath(methodPoints);
    var crammingPath = smoothPath(cramPoints);
    var thresholdY = yFor(threshold, view);

    var gridLines = yTicks.map(function (tick) {
      var y = yFor(tick, view);
      return '<line x1="' + view.xStart + '" y1="' + y + '" x2="' + view.xEnd + '" y2="' + y + '" stroke="var(--ep-line)" stroke-width="1" />';
    }).join("");

    var xLabels = [times[0], times[2], times[4], times[5]].map(function (tick) {
      var x = xFor(tick, times, view);
      return '<text x="' + x + '" y="' + (view.yBottom + 22) + '" text-anchor="middle" fill="var(--ep-muted)" font-size="12">' + tick + "d</text>";
    }).join("");

    var methodLabel = methodPoints[methodPoints.length - 1];
    var cramLabel = cramPoints[cramPoints.length - 1];
    var calloutAnchor = methodPoints[3];
    var calloutX = clamp(calloutAnchor.x + 26, view.xStart + 20, view.xEnd - 250);
    var calloutY = clamp(calloutAnchor.y - 80, view.yTop + 20, view.yBottom - 20);

    els.chartSvg.innerHTML =
      "<g>" +
        gridLines +
        '<line x1="' + view.xStart + '" y1="' + view.yBottom + '" x2="' + view.xEnd + '" y2="' + view.yBottom + '" stroke="var(--ep-line-strong)" stroke-width="1.2" />' +
        '<line x1="' + view.xStart + '" y1="' + view.yTop + '" x2="' + view.xStart + '" y2="' + view.yBottom + '" stroke="var(--ep-line-strong)" stroke-width="1.2" />' +
        '<line x1="' + view.xStart + '" y1="' + thresholdY + '" x2="' + view.xEnd + '" y2="' + thresholdY + '" stroke="var(--ep-line-strong)" stroke-width="1" stroke-dasharray="5 5" />' +
        '<text x="' + (view.xStart + 4) + '" y="' + (thresholdY - 7) + '" fill="var(--ep-muted)" font-size="12">' + escapeHtml(analytics.thresholdLabel || "Δ Retentivity") + "</text>" +
        '<path d="' + bandPath + '" fill="rgba(59,130,246,0.16)" />' +
        '<path d="' + crammingPath + '" fill="none" stroke="rgba(239,68,68,0.9)" stroke-width="3" stroke-linecap="round" />' +
        '<path d="' + methodPath + '" fill="none" stroke="#3b82f6" stroke-width="4.2" stroke-linecap="round" />' +
        '<text x="' + (methodLabel.x + 10) + '" y="' + (methodLabel.y - 6) + '" fill="#60a5fa" font-size="14" font-weight="700">' + escapeHtml(analytics.labelMethod || "Science Method") + "</text>" +
        '<text x="' + (cramLabel.x + 10) + '" y="' + (cramLabel.y + 14) + '" fill="rgba(239,68,68,0.9)" font-size="14" font-weight="700">' + escapeHtml(analytics.labelCramming || "Traditional Cramming") + "</text>" +
        '<line x1="' + calloutAnchor.x + '" y1="' + calloutAnchor.y + '" x2="' + calloutX + '" y2="' + calloutY + '" stroke="#3b82f6" stroke-width="1.2" />' +
        '<text x="' + (calloutX + 4) + '" y="' + (calloutY - 4) + '" fill="#60a5fa" font-size="12" font-weight="700">' + escapeHtml(analytics.callout || "") + "</text>" +
        '<text x="' + (view.xStart - 8) + '" y="' + (view.yTop - 7) + '" fill="var(--ep-text)" font-size="14">' + escapeHtml(analytics.axisRetention || "Retention") + "</text>" +
        '<text x="' + (view.xEnd + 12) + '" y="' + (view.yBottom + 24) + '" fill="var(--ep-text)" font-size="14">' + escapeHtml(analytics.axisTime || "Time") + "</text>" +
        xLabels +
      "</g>" +
      '<line id="epCrossX" x1="' + view.xStart + '" y1="' + view.yTop + '" x2="' + view.xStart + '" y2="' + view.yBottom + '" stroke="var(--ep-line-strong)" stroke-dasharray="4 4" stroke-width="1" opacity="0" />' +
      '<line id="epCrossY" x1="' + view.xStart + '" y1="' + view.yTop + '" x2="' + view.xEnd + '" y2="' + view.yTop + '" stroke="var(--ep-line-strong)" stroke-dasharray="4 4" stroke-width="1" opacity="0" />';

    bindChartHover(dataset, methodPoints, cramPoints, times, view);
  }

  function bindChartHover(dataset, methodPoints, cramPoints, times, view) {
    var crossX = document.getElementById("epCrossX");
    var crossY = document.getElementById("epCrossY");
    if (!crossX || !crossY) return;

    function hide() {
      crossX.setAttribute("opacity", "0");
      crossY.setAttribute("opacity", "0");
      els.chartTooltip.hidden = true;
    }

    els.chartSvg.onmouseleave = hide;
    els.chartSvg.onmousemove = function (event) {
      var rect = els.chartSvg.getBoundingClientRect();
      var sx = ((event.clientX - rect.left) / rect.width) * view.width;

      var nearestIndex = 0;
      var minDist = Infinity;
      times.forEach(function (time, idx) {
        var px = xFor(time, times, view);
        var dist = Math.abs(px - sx);
        if (dist < minDist) {
          minDist = dist;
          nearestIndex = idx;
        }
      });

      var point = methodPoints[nearestIndex];
      crossX.setAttribute("x1", point.x);
      crossX.setAttribute("x2", point.x);
      crossX.setAttribute("opacity", "0.9");
      crossY.setAttribute("y1", point.y);
      crossY.setAttribute("y2", point.y);
      crossY.setAttribute("opacity", "0.75");

      els.chartTooltip.hidden = false;
      els.chartTooltip.innerHTML =
        "<div><strong>Day " + dataset.times[nearestIndex] + "</strong></div>" +
        "<div>Method: " + Math.round(dataset.method[nearestIndex] * 100) + "%</div>" +
        "<div>Cramming: " + Math.round(dataset.cramming[nearestIndex] * 100) + "%</div>";

      var shellRect = els.chartShell.getBoundingClientRect();
      var left = event.clientX - shellRect.left + 14;
      var top = event.clientY - shellRect.top - 42;
      els.chartTooltip.style.left = clamp(left, 8, shellRect.width - 168) + "px";
      els.chartTooltip.style.top = clamp(top, 8, shellRect.height - 66) + "px";
    };
  }

  function openModal() {
    els.newProjectModal.hidden = false;
    els.projectNameInput.focus();
  }

  function closeModal() {
    els.newProjectModal.hidden = true;
    els.projectNameInput.value = "";
    els.projectExamNameInput.value = "";
    els.projectExamDateInput.value = "";
    els.projectDescInput.value = "";
  }

  async function loadProjects() {
    setStatus("Loading projects...");
    state.projects = await api.listProjects();
    if (!state.projects.length) {
      state.selectedProjectId = null;
      state.projectDetail = null;
      renderProjectSelect();
      renderSummary();
      renderPendingFiles();
      renderSavedFiles();
      renderOutlineCandidates({ candidates: [] });
      renderMindmap();
      renderScience();
      setStatus("No project yet. Create your first project.", "success");
      return;
    }

    if (!state.selectedProjectId || !state.projects.some(function (p) { return p.id === state.selectedProjectId; })) {
      state.selectedProjectId = state.projects[0].id;
    }

    renderProjectSelect();
    await loadProjectDetail(state.selectedProjectId);
  }

  async function loadProjectDetail(projectId) {
    if (!projectId) return;
    setStatus("Loading project detail...");
    var detail = await api.getProjectDetail(projectId);
    state.projectDetail = detail;
    state.selectedProjectId = projectId;
    state.selectedOutlineFileId = detail.examPrep && detail.examPrep.selectedFileId ? detail.examPrep.selectedFileId : null;
    state.mindmap = detail.examPrep && detail.examPrep.mindmap ? detail.examPrep.mindmap : null;
    if (detail.examPrep && detail.examPrep.examTopics) els.topicsInput.value = detail.examPrep.examTopics;

    state.activations.filesUploaded = !!((detail.files || []).length);
    state.activations.quizCompleted = !!((detail.analytics && detail.analytics.trend || []).length);
    state.activations.mindmapGenerated = !!state.mindmap;
    if (state.currentTab === "analytics") state.activations.analyticsViewed = true;

    renderProjectSelect();
    renderSummary();
    renderPendingFiles();
    renderSavedFiles();
    renderOutlineCandidates({ candidates: [] });
    renderMindmap();
    renderScience();
    renderChart(chartState.mode || "theory");
    setStatus("Project ready.", "success");
  }

  function addPendingFiles(fileList) {
    Array.from(fileList || []).forEach(function (file) {
      state.pendingFiles.push({
        name: file.name,
        size: file.size || 0,
        file: file
      });
    });
    renderPendingFiles();
  }

  async function savePendingFiles() {
    if (!state.selectedProjectId) throw new Error("Select a project first.");
    if (!state.pendingFiles.length) return;

    setStatus("Saving files...");
    var payload = state.pendingFiles.map(function (entry) {
      return { name: entry.name, contentLength: entry.size };
    });
    await api.saveFiles(state.selectedProjectId, payload);
    state.pendingFiles = [];
    state.activations.filesUploaded = true;
    await loadProjectDetail(state.selectedProjectId);
    setStatus("Files saved.", "success");
  }

  async function scanOutlineCandidates() {
    if (!state.selectedProjectId) throw new Error("Select a project first.");
    setStatus("Scanning outline candidates...");
    var result = await api.scanOutlineCandidates(state.selectedProjectId);
    renderOutlineCandidates(result);
    setStatus("Outline scan complete.", "success");
  }

  async function generateMindmap() {
    if (!state.selectedProjectId) throw new Error("Select a project first.");
    if (state.pendingFiles.length) {
      await savePendingFiles();
    }

    setStatus("Generating mindmap...");
    var result = await api.generateMindmap(state.selectedProjectId, {
      selectedFileId: state.selectedOutlineFileId,
      topicsInput: els.topicsInput.value.trim()
    });
    state.mindmap = result.mindmap;
    if (result.examTopics && !els.topicsInput.value.trim()) els.topicsInput.value = result.examTopics;
    state.activations.mindmapGenerated = true;
    renderMindmap();
    renderScience();
    setStatus("Mindmap generated.", "success");
  }

  async function saveMindmap() {
    if (!state.selectedProjectId || !state.mindmap) throw new Error("Generate a mindmap first.");
    setStatus("Saving mindmap...");
    await api.saveMindmap(state.selectedProjectId, {
      examTopics: els.topicsInput.value.trim(),
      mindmap: state.mindmap
    });
    setStatus("Mindmap saved.", "success");
  }

  async function createProject() {
    var name = els.projectNameInput.value.trim();
    if (!name) throw new Error("Project name is required.");
    setStatus("Creating project...");
    var created = await api.createProject({
      name: name,
      examName: els.projectExamNameInput.value.trim(),
      examDate: els.projectExamDateInput.value || null,
      description: els.projectDescInput.value.trim()
    });
    closeModal();
    state.selectedProjectId = created.id;
    await loadProjects();
    setStatus("Project created.", "success");
  }

  async function generateQuiz() {
    if (!state.selectedProjectId) throw new Error("Select a project first.");
    if (!state.selectedTypes.size) throw new Error("Select at least one question type.");
    if (!els.topicsInput.value.trim() && !state.mindmap) {
      throw new Error("Add exam topics or generate mindmap first.");
    }

    setStatus("Generating quiz...");
    await api.generateQuiz(state.selectedProjectId, {
      examTopics: els.topicsInput.value.trim(),
      types: Array.from(state.selectedTypes),
      numQuestions: state.numQuestions
    });

    state.activations.quizCompleted = true;
    await loadProjectDetail(state.selectedProjectId);
    setStatus("Quiz generated (template mode). Connect to quiz page in your app.", "success");
  }

  function bindEvents() {
    els.dropzone.addEventListener("click", function () { els.fileInput.click(); });
    els.dropzone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        els.fileInput.click();
      }
    });
    els.dropzone.addEventListener("dragover", function (event) {
      event.preventDefault();
      els.dropzone.classList.add("is-drag");
    });
    els.dropzone.addEventListener("dragleave", function () {
      els.dropzone.classList.remove("is-drag");
    });
    els.dropzone.addEventListener("drop", function (event) {
      event.preventDefault();
      els.dropzone.classList.remove("is-drag");
      addPendingFiles(event.dataTransfer.files);
    });
    els.fileInput.addEventListener("change", function () {
      addPendingFiles(els.fileInput.files);
      els.fileInput.value = "";
    });

    els.pendingFiles.addEventListener("click", function (event) {
      var idx = event.target.getAttribute("data-remove-pending");
      if (idx == null) return;
      state.pendingFiles.splice(Number(idx), 1);
      renderPendingFiles();
    });

    els.clearPendingBtn.addEventListener("click", function () {
      state.pendingFiles = [];
      renderPendingFiles();
      setStatus("Pending files cleared.");
    });

    els.saveFilesBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await savePendingFiles();
      } catch (err) {
        setStatus(err.message || "Failed to save files.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.refreshProjectsBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await loadProjects();
      } catch (err) {
        setStatus(err.message || "Failed to load projects.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.projectSelect.addEventListener("change", async function () {
      var projectId = els.projectSelect.value;
      if (!projectId || state.busy) return;
      setBusy(true);
      try {
        await loadProjectDetail(projectId);
      } catch (err) {
        setStatus(err.message || "Failed to load project detail.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.newProjectBtn.addEventListener("click", openModal);
    els.cancelProjectBtn.addEventListener("click", closeModal);
    els.newProjectModal.addEventListener("click", function (event) {
      if (event.target === els.newProjectModal) closeModal();
    });
    els.createProjectBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await createProject();
      } catch (err) {
        setStatus(err.message || "Failed to create project.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.copyTemplateBtn.addEventListener("click", async function () {
      try {
        await navigator.clipboard.writeText(els.emailTemplate.value || "");
        setStatus("Template copied.", "success");
      } catch (_) {
        setStatus("Copy failed. Copy manually.", "error");
      }
    });

    els.scanOutlineBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await scanOutlineCandidates();
      } catch (err) {
        setStatus(err.message || "Failed to scan outline.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.outlineCandidates.addEventListener("click", function (event) {
      var fileId = event.target.getAttribute("data-outline-id");
      if (!fileId) return;
      state.selectedOutlineFileId = fileId;
      scanOutlineCandidates().catch(function () {});
    });

    els.generateMindmapBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await generateMindmap();
      } catch (err) {
        setStatus(err.message || "Failed to generate mindmap.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.mindmapTree.addEventListener("input", function (event) {
      var nodeId = event.target.getAttribute("data-node-id");
      if (!nodeId || !state.mindmap || !Array.isArray(state.mindmap.nodes)) return;
      var found = findNode(nodeId, state.mindmap.nodes);
      if (!found || !found.node) return;
      found.node.text = event.target.textContent.trim() || "Untitled node";
    });

    els.mindmapTree.addEventListener("click", function (event) {
      var action = event.target.getAttribute("data-node-action");
      var nodeId = event.target.getAttribute("data-node-id");
      if (!action || !nodeId || !state.mindmap || !Array.isArray(state.mindmap.nodes)) return;
      var found = findNode(nodeId, state.mindmap.nodes);
      if (!found) return;

      if (action === "add") {
        if (!Array.isArray(found.node.children)) found.node.children = [];
        found.node.children.push({
          id: "n_" + Date.now() + "_" + Math.random().toString(16).slice(2, 7),
          text: "New subtopic",
          status: "gray",
          children: []
        });
      }

      if (action === "delete") {
        if (found.parentNodes === state.mindmap.nodes && found.parentNodes.length === 1) {
          setStatus("At least one root node is required.", "error");
          return;
        }
        found.parentNodes.splice(found.index, 1);
      }

      renderMindmap();
    });

    els.addRootNodeBtn.addEventListener("click", function () {
      if (!state.mindmap || !Array.isArray(state.mindmap.nodes)) return;
      state.mindmap.nodes.push({
        id: "n_" + Date.now() + "_" + Math.random().toString(16).slice(2, 7),
        text: "New topic",
        status: "gray",
        children: []
      });
      renderMindmap();
    });

    els.saveMindmapBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await saveMindmap();
      } catch (err) {
        setStatus(err.message || "Failed to save mindmap.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.typeToggles.addEventListener("click", function (event) {
      var button = event.target.closest("[data-type]");
      if (!button) return;
      var type = button.getAttribute("data-type");
      if (!type) return;
      if (state.selectedTypes.has(type)) {
        if (state.selectedTypes.size === 1) return;
        state.selectedTypes.delete(type);
        button.classList.remove("is-active");
      } else {
        state.selectedTypes.add(type);
        button.classList.add("is-active");
      }
    });

    els.numToggles.addEventListener("click", function (event) {
      var button = event.target.closest("[data-num]");
      if (!button) return;
      var num = Number(button.getAttribute("data-num"));
      if (!Number.isInteger(num)) return;
      state.numQuestions = num;
      els.numToggles.querySelectorAll("[data-num]").forEach(function (item) {
        item.classList.toggle("is-active", item === button);
      });
    });

    els.generateQuizBtn.addEventListener("click", async function () {
      if (state.busy) return;
      setBusy(true);
      try {
        await generateQuiz();
      } catch (err) {
        setStatus(err.message || "Failed to generate quiz.", "error");
      } finally {
        setBusy(false);
      }
    });

    els.projectTabs.addEventListener("click", function (event) {
      var button = event.target.closest("[data-tab]");
      if (!button) return;
      setTab(button.getAttribute("data-tab"));
    });

    els.chartModeButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        var mode = button.getAttribute("data-chart-mode");
        els.chartModeButtons.forEach(function (other) {
          other.classList.toggle("is-active", other === button);
        });
        renderChart(mode);
      });
    });

    window.addEventListener("resize", function () {
      renderChart(chartState.mode || "theory");
    });
  }

  function init() {
    renderHero();
    renderStageRail();
    renderToggles();
    renderPendingFiles();
    renderSavedFiles();
    renderOutlineCandidates({ candidates: [] });
    renderScience();
    renderChart("theory");
    setTab("quiz", { silent: true });
    bindEvents();

    (async function bootstrap() {
      setBusy(true);
      try {
        await loadProjects();
      } catch (err) {
        setStatus(err.message || "Initialization failed.", "error");
      } finally {
        setBusy(false);
      }
    })();
  }

  init();
})();

