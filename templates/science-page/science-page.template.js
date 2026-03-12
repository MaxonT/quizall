(function () {
  var THEME_KEY = "theme";
  var DEFAULT_LOCALE = "en";
  var prefersDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function resolveTheme(rawTheme) {
    if (rawTheme === "auto") {
      return prefersDark && prefersDark.matches ? "dark" : "light";
    }
    return rawTheme === "light" ? "light" : "dark";
  }

  function applyThemeFromStorage() {
    var saved = localStorage.getItem(THEME_KEY) || "dark";
    var resolved = resolveTheme(saved);
    document.documentElement.setAttribute("data-theme", resolved);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
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

  function setText(id, value) {
    var el = document.getElementById(id);
    if (!el) return;
    if (typeof value === "string" && value.length) {
      el.textContent = value;
    }
  }

  function getLocaleBundle() {
    if (!window.quizallScienceLocale || typeof window.quizallScienceLocale.resolveLocale !== "function") {
      return { locale: DEFAULT_LOCALE, copy: null };
    }
    var raw = localStorage.getItem("locale") || navigator.language || DEFAULT_LOCALE;
    var locale = window.quizallScienceLocale.resolveLocale(raw);
    var copy = window.quizallScienceLocale.getCopy(locale);
    return { locale: locale, copy: copy };
  }

  function withLocalizedData(baseData, copy, locale) {
    if (!copy) return baseData;

    var localized = JSON.parse(JSON.stringify(baseData));
    if (copy.kicker) localized.meta.kicker = copy.kicker;
    if (copy.heroTitle) localized.meta.heroTitle = copy.heroTitle;
    if (copy.byline) localized.meta.byline = copy.byline;
    if (copy.heroSummary) localized.meta.summary = copy.heroSummary;
    if (copy.preface) localized.meta.preface = copy.preface;
    if (copy.journals && copy.journals.length) localized.journals = copy.journals.slice();

    if (Array.isArray(localized.steps) && typeof window.quizallScienceLocale.localizeStep === "function") {
      localized.steps = localized.steps.map(function (step) {
        return window.quizallScienceLocale.localizeStep(step, locale);
      });
    }

    if (copy.transitions) {
      Object.keys(copy.transitions).forEach(function (stepId) {
        if (localized.transitions[stepId]) {
          localized.transitions[stepId].text = copy.transitions[stepId];
        }
      });
    }

    if (copy.comparisonTitle) localized.comparison.title = copy.comparisonTitle;
    if (copy.comparisonIntro) localized.comparison.intro = copy.comparisonIntro;
    if (copy.chartModeTheory) localized.comparison.modeTheory = copy.chartModeTheory;
    if (copy.chartModeActual) localized.comparison.modeActual = copy.chartModeActual;
    if (copy.chartLabelMethod) localized.comparison.labelMethod = copy.chartLabelMethod;
    if (copy.chartLabelCramming) localized.comparison.labelCramming = copy.chartLabelCramming;
    if (copy.chartRetention) localized.comparison.axisRetention = copy.chartRetention;
    if (copy.chartTime) localized.comparison.axisTime = copy.chartTime;
    if (copy.chartThreshold) localized.comparison.thresholdLabel = copy.chartThreshold;
    if (copy.chartCalloutStep06) localized.comparison.callout = copy.chartCalloutStep06;

    if (copy.citationsTitle) localized.citationsTitle = copy.citationsTitle;
    if (copy.citationsIntro) localized.citationsIntro = copy.citationsIntro;

    if (copy.ctaTitle) localized.cta.title = copy.ctaTitle;
    if (copy.ctaBody) localized.cta.body = copy.ctaBody;
    if (copy.ctaPrimary) localized.cta.primaryLabel = copy.ctaPrimary;
    if (copy.ctaSecondary) localized.cta.secondaryLabel = copy.ctaSecondary;

    return localized;
  }

  function renderHeader(data) {
    setText("scienceKicker", data.meta.kicker);
    setText("scienceHeroTitle", data.meta.heroTitle);
    setText("scienceByline", data.meta.byline);
    setText("scienceSummary", data.meta.summary);
    setText("sciencePreface", data.meta.preface);

    var journalList = document.getElementById("scienceJournalList");
    if (journalList) {
      journalList.innerHTML = "";
      data.journals.forEach(function (journal) {
        var chip = document.createElement("span");
        chip.className = "science-journal-chip";
        chip.textContent = journal;
        journalList.appendChild(chip);
      });
    }
  }

  function renderStageNav(steps) {
    var nav = document.getElementById("scienceStageNav");
    if (!nav) return;

    steps.forEach(function (step) {
      var link = document.createElement("a");
      link.className = "science-stage-link";
      link.href = "#" + step.id;
      link.dataset.stageId = step.id;
      link.innerHTML =
        '<span class="science-stage-index">' + String(step.number).padStart(2, "0") + "</span>" +
        '<span class="science-stage-text">' +
          '<span class="science-stage-main">Stage ' + step.number + "</span>" +
          '<span class="science-stage-sub">' + escapeHtml(step.title) + "</span>" +
        "</span>";
      nav.appendChild(link);
    });

    function setActive(id) {
      var links = nav.querySelectorAll(".science-stage-link");
      links.forEach(function (el) {
        el.classList.toggle("is-active", el.dataset.stageId === id);
      });
    }

    var observer = new IntersectionObserver(function (entries) {
      var visible = entries
        .filter(function (entry) { return entry.isIntersecting; })
        .sort(function (a, b) { return a.boundingClientRect.top - b.boundingClientRect.top; });
      if (!visible.length) return;
      setActive(visible[0].target.id);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0.2, 0.5] });

    steps.forEach(function (step, index) {
      var section = document.getElementById(step.id);
      if (section) observer.observe(section);
      if (index === 0) setActive(step.id);
    });
  }

  function buildStepElement(step, transitions, opts) {
    var section = document.createElement("section");
    section.className = "science-step";
    section.id = step.id;

    var findings = step.keyFindings.map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    }).join("");

    var citations = step.citations.map(function (item) {
      return "<li>" + escapeHtml(item) + "</li>";
    }).join("");

    var detailsHtml = (step.papers || []).map(function (paper, idx) {
      return (
        '<details class="science-expand-item">' +
          "<summary>" +
            '<span class="science-expand-index">' + String(idx + 1).padStart(2, "0") + "</span>" +
            "<span>Expand Core Conclusion</span>" +
            '<span class="science-expand-arrow" aria-hidden="true"></span>' +
          "</summary>" +
          '<div class="science-expand-body">' +
            "<p>" + escapeHtml(paper.abstract || "") + "</p>" +
            "<p><strong>" + escapeHtml(paper.citation || "") + "</strong></p>" +
          "</div>" +
        "</details>"
      );
    }).join("");

    var why = step.why || {};

    section.innerHTML =
      '<div class="science-step-head">' +
        "<div>" +
          '<div class="science-step-kicker">Step ' + String(step.number).padStart(2, "0") + " / 06</div>" +
          "<h2>" + escapeHtml(step.title) + "</h2>" +
          '<div class="science-step-tagline">' + escapeHtml(step.tagline || "") + "</div>" +
        "</div>" +
      "</div>" +
      '<p class="science-step-desc">' + escapeHtml(step.description || "") + "</p>" +
      (step.quote
        ? '<blockquote class="science-pull-quote">' +
            "<span>" + escapeHtml(step.quote.text || "") + "</span>" +
            "<small>" + escapeHtml(step.quote.author || "") + "</small>" +
          "</blockquote>"
        : "") +
      (step.id === "step01" && opts && opts.mindmapHtml ? opts.mindmapHtml : "") +
      '<div class="science-step-grid">' +
        '<article class="science-panel">' +
          "<h3>Key Findings</h3>" +
          "<ul>" + findings + "</ul>" +
          '<div class="science-why">' +
            "<h4>The Why</h4>" +
            "<p><strong>" + escapeHtml(why.question || "") + "</strong></p>" +
            "<p>" + escapeHtml(why.answer || "") + "</p>" +
            (why.operationalCue ? "<p>" + escapeHtml(why.operationalCue) + "</p>" : "") +
          "</div>" +
          (detailsHtml
            ? '<div class="science-expand"><p class="science-expand-kicker">Core takeaways shown above. Click to expand detailed paper abstracts.</p>' + detailsHtml + "</div>"
            : "") +
        "</article>" +
        '<article class="science-panel">' +
          "<h3>Citations</h3>" +
          "<ol>" + citations + "</ol>" +
        "</article>" +
      "</div>";

    if (transitions && transitions[step.id]) {
      var t = transitions[step.id];
      var transitionEl = document.createElement("section");
      transitionEl.className = "science-transition";
      transitionEl.innerHTML = "<p>" + escapeHtml(t.text || "") + "</p>";
      section.appendChild(transitionEl);
    }

    return section;
  }

  function renderPipeline(data) {
    var pipeline = document.getElementById("sciencePipeline");
    if (!pipeline) return;

    var mindmapFigure =
      '<figure class="science-panel" style="margin-top:12px;">' +
      "<h3>Mindmap</h3>" +
      '<img src="/assets/science/6-step-mindmap.svg" alt="6-step mindmap" style="width:100%;display:block;border-radius:10px;border:1px solid var(--science-line);" />' +
      '<figcaption style="margin-top:8px;color:var(--science-muted);font-size:0.84rem;">Mindmap view: one cognitive loop, six coordinated learning stages.</figcaption>' +
      "</figure>";

    data.steps.forEach(function (step) {
      pipeline.appendChild(buildStepElement(step, data.transitions, { mindmapHtml: mindmapFigure }));
    });
  }

  function renderCitations(data) {
    setText("scienceCitationsTitle", data.citationsTitle || "Full Citation Index");
    setText("scienceCitationsIntro", data.citationsIntro || "All references listed below.");

    var list = document.getElementById("scienceCitationList");
    if (!list) return;
    list.innerHTML = "";
    data.fullCitations.forEach(function (citation) {
      var li = document.createElement("li");
      li.textContent = citation;
      list.appendChild(li);
    });
  }

  function renderCta(data) {
    setText("scienceCtaTitle", data.cta.title);
    setText("scienceCtaBody", data.cta.body);
    setText("scienceCtaPrimary", data.cta.primaryLabel);
    setText("scienceCtaSecondary", data.cta.secondaryLabel);
    var primary = document.getElementById("scienceCtaPrimary");
    var secondary = document.getElementById("scienceCtaSecondary");
    if (primary && data.cta.primaryHref) primary.href = data.cta.primaryHref;
    if (secondary && data.cta.secondaryHref) secondary.href = data.cta.secondaryHref;
  }

  function renderComparison(data) {
    setText("scienceComparisonTitle", data.title);
    setText("scienceComparisonIntro", data.intro);
    setText("scienceChartModeTheory", data.modeTheory || "Theoretical Prediction");
    setText("scienceChartModeActual", data.modeActual || "Actual User Data");

    var svg = document.getElementById("scienceChartSvg");
    var shell = document.getElementById("scienceChartShell");
    var tooltip = document.getElementById("scienceChartTooltip");
    if (!svg || !shell || !tooltip) return;

    var chartModes = Array.prototype.slice.call(document.querySelectorAll("[data-chart-mode]"));
    var state = { mode: "theory" };
    var view = { width: 980, height: 470, left: 88, right: 38, top: 42, bottom: 62 };
    var xAxisStart = view.left;
    var xAxisEnd = view.width - view.right;
    var yAxisTop = view.top;
    var yAxisBottom = view.height - view.bottom;
    var yTicks = [0.9, 0.7, 0.5, 0.3];
    var threshold = 0.66;

    function xFor(timeValue, times) {
      var minT = times[0];
      var maxT = times[times.length - 1];
      var ratio = (Math.log(timeValue) - Math.log(minT)) / (Math.log(maxT) - Math.log(minT));
      return xAxisStart + ratio * (xAxisEnd - xAxisStart);
    }

    function yFor(retentionValue) {
      var minR = 0.1;
      var maxR = 0.95;
      var ratio = (retentionValue - minR) / (maxR - minR);
      return yAxisBottom - ratio * (yAxisBottom - yAxisTop);
    }

    function buildPoints(datasetValues, times) {
      return times.map(function (timeValue, idx) {
        return {
          x: xFor(timeValue, times),
          y: yFor(datasetValues[idx]),
          t: timeValue,
          v: datasetValues[idx]
        };
      });
    }

    function buildBandPath(midPoints, spreadValues) {
      var upper = midPoints.map(function (point, idx) {
        return { x: point.x, y: yFor(clamp(point.v + spreadValues[idx], 0.1, 0.95)) };
      });
      var lower = midPoints.map(function (point, idx) {
        return { x: point.x, y: yFor(clamp(point.v - spreadValues[idx], 0.1, 0.95)) };
      });
      var d = smoothPath(upper);
      for (var i = lower.length - 1; i >= 0; i -= 1) {
        d += " L " + lower[i].x.toFixed(2) + " " + lower[i].y.toFixed(2);
      }
      d += " Z";
      return d;
    }

    function render(mode) {
      state.mode = mode;
      var payload = data.datasets[mode] || data.datasets.theory;
      var times = payload.times;
      var quizPoints = buildPoints(payload.quizall, times);
      var cramPoints = buildPoints(payload.cramming, times);
      var band = buildBandPath(quizPoints, payload.band);
      var quizPath = smoothPath(quizPoints);
      var cramPath = smoothPath(cramPoints);
      var thresholdY = yFor(threshold);

      var gridLines = yTicks.map(function (tick) {
        var y = yFor(tick);
        return '<line x1="' + xAxisStart + '" y1="' + y + '" x2="' + xAxisEnd + '" y2="' + y + '" stroke="var(--chart-grid)" stroke-width="1" />';
      }).join("");

      var xTicks = [times[0], times[2], times[4], times[5]].map(function (tick) {
        var x = xFor(tick, times);
        return '<text x="' + x + '" y="' + (yAxisBottom + 22) + '" text-anchor="middle" fill="var(--chart-muted)" font-size="12">' + tick + "d</text>";
      }).join("");

      var calloutAnchor = quizPoints[3];
      var calloutX = clamp(calloutAnchor.x + 24, xAxisStart + 12, xAxisEnd - 260);
      var calloutY = clamp(calloutAnchor.y - 90, yAxisTop + 10, yAxisBottom - 30);
      var methodLabel = quizPoints[quizPoints.length - 1];
      var cramLabel = cramPoints[cramPoints.length - 1];

      svg.innerHTML =
        '<g>' +
          gridLines +
          '<line x1="' + xAxisStart + '" y1="' + yAxisBottom + '" x2="' + xAxisEnd + '" y2="' + yAxisBottom + '" stroke="var(--chart-axis)" stroke-width="1.2" />' +
          '<line x1="' + xAxisStart + '" y1="' + yAxisTop + '" x2="' + xAxisStart + '" y2="' + yAxisBottom + '" stroke="var(--chart-axis)" stroke-width="1.2" />' +
          '<line x1="' + xAxisStart + '" y1="' + thresholdY + '" x2="' + xAxisEnd + '" y2="' + thresholdY + '" stroke="var(--chart-axis)" stroke-width="1" stroke-dasharray="5 5" />' +
          '<text x="' + (xAxisStart + 4) + '" y="' + (thresholdY - 8) + '" fill="var(--chart-muted)" font-size="12">' + escapeHtml(data.thresholdLabel || "Δ Retentivity") + "</text>" +
          '<path d="' + band + '" fill="var(--chart-band)" />' +
          '<path d="' + cramPath + '" fill="none" stroke="var(--chart-plain)" stroke-width="3" stroke-linecap="round" />' +
          '<path d="' + quizPath + '" fill="none" stroke="var(--chart-accent)" stroke-width="4.2" stroke-linecap="round" />' +
          '<text x="' + (methodLabel.x + 10) + '" y="' + (methodLabel.y - 6) + '" fill="var(--chart-accent)" font-size="14" font-weight="700">' + escapeHtml(data.labelMethod || "Science Method") + "</text>" +
          '<text x="' + (cramLabel.x + 10) + '" y="' + (cramLabel.y + 14) + '" fill="var(--chart-plain)" font-size="14" font-weight="700">' + escapeHtml(data.labelCramming || "Traditional Cramming") + "</text>" +
          '<line x1="' + calloutAnchor.x + '" y1="' + calloutAnchor.y + '" x2="' + calloutX + '" y2="' + calloutY + '" stroke="var(--chart-accent)" stroke-width="1.2" />' +
          '<text x="' + (calloutX + 4) + '" y="' + (calloutY - 4) + '" fill="var(--chart-accent)" font-size="12" font-weight="700">' + escapeHtml(data.callout || "Step 06 intervention flattens the forgetting slope.") + "</text>" +
          '<text x="' + (xAxisStart - 14) + '" y="' + (yAxisTop - 6) + '" fill="var(--chart-ink)" font-size="14" text-anchor="start">' + escapeHtml(data.axisRetention || "Retention") + "</text>" +
          '<text x="' + (xAxisEnd + 14) + '" y="' + (yAxisBottom + 24) + '" fill="var(--chart-ink)" font-size="14" text-anchor="start">' + escapeHtml(data.axisTime || "Time") + "</text>" +
          xTicks +
        "</g>";

      var overlay =
        '<line id="scienceCrossX" x1="' + xAxisStart + '" y1="' + yAxisTop + '" x2="' + xAxisStart + '" y2="' + yAxisBottom + '" stroke="var(--chart-axis)" stroke-width="1" stroke-dasharray="4 4" opacity="0" />' +
        '<line id="scienceCrossY" x1="' + xAxisStart + '" y1="' + yAxisTop + '" x2="' + xAxisEnd + '" y2="' + yAxisTop + '" stroke="var(--chart-axis)" stroke-width="1" stroke-dasharray="4 4" opacity="0" />';
      svg.insertAdjacentHTML("beforeend", overlay);

      bindHover(payload, quizPoints, cramPoints, times);
    }

    function bindHover(payload, quizPoints, cramPoints, times) {
      var lineX = document.getElementById("scienceCrossX");
      var lineY = document.getElementById("scienceCrossY");
      if (!lineX || !lineY) return;

      function hideTip() {
        lineX.setAttribute("opacity", "0");
        lineY.setAttribute("opacity", "0");
        tooltip.hidden = true;
      }

      svg.onmouseleave = hideTip;
      svg.onmousemove = function (event) {
        var rect = svg.getBoundingClientRect();
        var sx = ((event.clientX - rect.left) / rect.width) * 980;
        var nearestIndex = 0;
        var minDist = Infinity;
        times.forEach(function (timeValue, idx) {
          var px = xFor(timeValue, times);
          var dist = Math.abs(px - sx);
          if (dist < minDist) {
            minDist = dist;
            nearestIndex = idx;
          }
        });

        var point = quizPoints[nearestIndex];
        var cram = cramPoints[nearestIndex];
        lineX.setAttribute("x1", point.x);
        lineX.setAttribute("x2", point.x);
        lineX.setAttribute("opacity", "0.9");
        lineY.setAttribute("y1", point.y);
        lineY.setAttribute("y2", point.y);
        lineY.setAttribute("opacity", "0.75");

        tooltip.hidden = false;
        tooltip.innerHTML =
          '<div><strong>Day ' + payload.times[nearestIndex] + '</strong></div>' +
          '<div>Method: ' + Math.round(payload.quizall[nearestIndex] * 100) + '%</div>' +
          '<div>Cramming: ' + Math.round(payload.cramming[nearestIndex] * 100) + "%</div>";

        var shellRect = shell.getBoundingClientRect();
        var left = event.clientX - shellRect.left + 14;
        var top = event.clientY - shellRect.top - 44;
        tooltip.style.left = clamp(left, 8, shellRect.width - 170) + "px";
        tooltip.style.top = clamp(top, 8, shellRect.height - 66) + "px";
      };
    }

    chartModes.forEach(function (button) {
      button.addEventListener("click", function () {
        var mode = button.dataset.chartMode;
        chartModes.forEach(function (b) { b.classList.toggle("is-active", b === button); });
        render(mode);
      });
    });

    render("theory");
  }

  applyThemeFromStorage();

  if (prefersDark && prefersDark.addEventListener) {
    prefersDark.addEventListener("change", function () {
      if ((localStorage.getItem(THEME_KEY) || "dark") === "auto") {
        applyThemeFromStorage();
      }
    });
  }

  window.addEventListener("storage", function (event) {
    if (event.key === THEME_KEY) applyThemeFromStorage();
  });

  document.addEventListener("themechange", applyThemeFromStorage);

  var localeBundle = getLocaleBundle();
  if (localeBundle.locale) {
    document.documentElement.lang = localeBundle.locale;
    document.documentElement.dir = localeBundle.locale === "ar" ? "rtl" : "ltr";
  }

  var rawData = window.scienceTemplateData;
  if (!rawData) {
    // Fail fast with clear signal in template mode.
    console.error("[science-template] Missing window.scienceTemplateData");
    return;
  }

  var data = withLocalizedData(rawData, localeBundle.copy, localeBundle.locale || DEFAULT_LOCALE);

  renderHeader(data);
  renderPipeline(data);
  renderStageNav(data.steps);
  renderComparison(data.comparison);
  renderCitations(data);
  renderCta(data);
})();
