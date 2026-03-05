
(function(){
  const THEME_KEY="theme", LANG_KEY="quizall.lang", CONSENT_KEY="quizall.consent";
  const prefersDark=window.matchMedia("(prefers-color-scheme: dark)");
  let lastMetrics = {}; // Store metrics for redraws
  
  // Helper for theme-aware colors
  function getThemeColors() {
    const theme = document.documentElement.getAttribute("data-theme");
    const isDark = theme === "dark" || (theme !== "light" && prefersDark.matches);
    
    return {
      grid: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)',
      text: isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(71, 85, 105, 0.7)',
      textStrong: isDark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(15, 23, 42, 0.9)',
      bg: isDark ? '#0B0F1A' : '#FFFFFF',
      shadow: isDark ? 'rgba(0, 0, 0, 0.3)' : 'rgba(0, 0, 0, 0.1)',
      needle: isDark ? '#FFFFFF' : '#1E293B',
      tick: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.2)'
    };
  }

  // Translations removed - now using locales/*.json via i18n.init.js
  const LANG_OPTIONS=[["en","English"],["zh-CN","中文"],["es","Español"],["fr","Français"],["ja","日本語"],["ko","한국어"],["ar","العربية"],["pt","Português"],["hi","हिन्दी"]];
  const API_BASE=(window.QUIZALL_API_BASE&&window.QUIZALL_API_BASE.trim())||(window.location&&window.location.origin&&window.location.origin!="null"?window.location.origin:"http://localhost:8080");
  const WIZARD_SESSION_KEY="quizall.wizard.session";
  function $(s){return document.querySelector(s)} function $all(s){return Array.from(document.querySelectorAll(s))}
  
  function applyTheme(theme){
    document.documentElement.setAttribute("data-theme", theme==="auto"?(prefersDark.matches?"dark":"light"):theme);
    // Trigger chart redraw when theme changes
    requestAnimationFrame(() => renderCharts());
  }
  // initHeader removed - logic handled by i18n.init.js
  
  function consentBanner(){if(localStorage.getItem("quizall.consent"))return; const b=document.createElement("div"); b.className="banner";
    // Use i18n if available, otherwise fallback to English
    const getText = (key) => {
      if (window.i18n) return window.i18n.t(key);
      // Fallback translations for consent banner
      const fallback = { consent_text: "We use cookies to improve your experience and remember preferences.", consent_btn: "Accept", deny_btn: "Deny" };
      return fallback[key] || key;
    };
    b.innerHTML=`<span data-i18n="common.consent_text">${getText("common.consent_text")}</span>
    <div style="display:flex;gap:8px">
      <button class="btn" id="consentDenyBtn" data-i18n="common.deny_btn">${getText("common.deny_btn")}</button>
      <button class="btn" id="consentBtn" data-i18n="common.consent_btn">${getText("common.consent_btn")}</button>
    </div>`;
    document.body.appendChild(b); 
    // Re-translate after i18n is ready - SCOPED TO BANNER ONLY
    if (window.i18n) {
      setTimeout(() => {
        b.querySelectorAll('[data-i18n]').forEach(el => {
          const key = el.getAttribute('data-i18n');
          if (key) el.textContent = window.i18n.t(key);
        });
      }, 100);
    }
    document.getElementById("consentBtn").addEventListener("click",()=>{localStorage.setItem("quizall.consent","1"); b.remove();});
    document.getElementById("consentDenyBtn").addEventListener("click",()=>{localStorage.setItem("quizall.consent","0"); b.remove();});}
  // ============================================
  // Enhanced Professional Data Visualization
  // ============================================
  
  // 1. Growth Over Iterations - Line Chart with Growth %
  function drawLine(c, series, col = "--accent") {
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth;
    const h = c.height = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    
    const theme = getThemeColors();
    const pad = 40; // Increased padding for labels
    const padBottom = 50;
    const padLeft = 50;
    
    // Calculate min/max with some padding for visual appeal
    const min = Math.min(...series, 0);
    const max = Math.max(...series, 1);
    const range = max - min || 1;
    
    // Draw grid lines (horizontal)
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = h - padBottom - (i / 5) * (h - pad - padBottom);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = min + (range * i / 5);
      ctx.fillStyle = theme.text;
      ctx.font = '10px Inter, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(value.toFixed(1), padLeft - 10, y + 4);
    }
    
    // Calculate coordinates
    const xs = series.map((_, i) => padLeft + i * ((w - padLeft - 20) / Math.max(series.length - 1, 1)));
    const ys = series.map(v => h - padBottom - ((v - min) / range) * (h - pad - padBottom));
    
    // Draw area fill under line
    ctx.fillStyle = 'rgba(34, 211, 238, 0.1)';
    ctx.beginPath();
    ctx.moveTo(xs[0], h - padBottom);
    xs.forEach((x, i) => ctx.lineTo(x, ys[i]));
    ctx.lineTo(xs[xs.length - 1], h - padBottom);
    ctx.closePath();
    ctx.fill();
    
    // Draw main line
    ctx.lineWidth = 3;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(col) || "#06b6d4";
    ctx.shadowColor = 'rgba(34, 211, 238, 0.5)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    xs.forEach((x, i) => {
      const y = ys[i];
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw data points
    ctx.fillStyle = '#22D3EE';
    xs.forEach((x, i) => {
      ctx.beginPath();
      ctx.arc(x, ys[i], 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = theme.bg === '#FFFFFF' ? '#FFFFFF' : '#0B0F1A';
      ctx.lineWidth = 2;
      ctx.stroke();
    });
    
    // Calculate and display growth percentage (green)
    if (series.length >= 2) {
      const firstValue = series[0];
      const lastValue = series[series.length - 1];
      const growth = ((lastValue - firstValue) / (firstValue || 1)) * 100;
      
      ctx.fillStyle = growth >= 0 ? '#22C55E' : '#EF4444';
      ctx.font = 'bold 16px Inter, system-ui';
      ctx.textAlign = 'right';
      const growthText = `${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`;
      ctx.fillText(growthText, w - 25, 30);
      
      // Growth label
      ctx.fillStyle = theme.text;
      ctx.font = '10px Inter, system-ui';
      ctx.fillText('Growth', w - 25, 45);
    }
    
    // X-axis labels
    ctx.fillStyle = theme.text;
    ctx.font = '10px Inter, system-ui';
    ctx.textAlign = 'center';
    xs.forEach((x, i) => {
      ctx.fillText(`Run ${i + 1}`, x, h - padBottom + 20);
    });
  }
  // 2. Change Contribution - Bar Chart with Labels
  function drawBars(c, series, col = "--primary") {
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth;
    const h = c.height = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    
    const theme = getThemeColors();
    const pad = 40;
    const padBottom = 50;
    const padLeft = 50;
    const max = Math.max(...series, 1);
    const bw = (w - padLeft - 20) / series.length * 0.6;
    
    // Draw grid lines (horizontal)
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 5; i++) {
      const y = h - padBottom - (i / 5) * (h - pad - padBottom);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(w - 20, y);
      ctx.stroke();
      
      // Y-axis labels
      const value = (max * i / 5).toFixed(0);
      ctx.fillStyle = theme.text;
      ctx.font = '10px Inter, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(value, padLeft - 10, y + 4);
    }
    
    // Draw bars with gradient
    series.forEach((v, i) => {
      const x = padLeft + i * ((w - padLeft - 20) / series.length) + ((w - padLeft - 20) / series.length - bw) / 2;
      const bh = (v / max) * (h - pad - padBottom);
      
      // Create gradient
      const gradient = ctx.createLinearGradient(x, h - padBottom - bh, x, h - padBottom);
      const baseColor = getComputedStyle(document.documentElement).getPropertyValue(col) || "#7c3aed";
      gradient.addColorStop(0, baseColor);
      gradient.addColorStop(1, baseColor + '80');
      
      // Draw bar
      ctx.fillStyle = gradient;
      ctx.fillRect(x, h - padBottom - bh, bw, bh);
      
      // Draw bar outline
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, h - padBottom - bh, bw, bh);
      
      // Value on top of bar
      ctx.fillStyle = '#22D3EE';
      ctx.font = 'bold 11px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(v.toFixed(1), x + bw / 2, h - padBottom - bh - 8);
      
      // X-axis labels
      ctx.fillStyle = theme.text;
      ctx.font = '10px Inter, system-ui';
      ctx.fillText(`Change ${i + 1}`, x + bw / 2, h - padBottom + 20);
    });
    
    // Y-axis label
    ctx.save();
    ctx.translate(15, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = theme.text;
    ctx.font = '11px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('Impact Score', 0, 0);
    ctx.restore();
  }
  // 3. Pass vs Fail - Donut Chart with Percentages and Legend
  function drawPie(c, vals, cols = ["--ok", "--err"]) {
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth;
    const h = c.height = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    
    const theme = getThemeColors();
    const r = Math.min(w, h) / 2 - 40;
    const innerR = r * 0.6; // Donut hole
    const cx = w / 2;
    const cy = h / 2 - 10;
    const sum = vals.reduce((a, b) => a + b, 0) || 1;
    let a = -Math.PI / 2;
    
    const labels = ['Pass', 'Fail'];
    const colorValues = [
      getComputedStyle(document.documentElement).getPropertyValue(cols[0]) || "#22C55E",
      getComputedStyle(document.documentElement).getPropertyValue(cols[1]) || "#EF4444"
    ];
    
    // Draw donut segments
    vals.forEach((v, i) => {
      const seg = (v / sum) * Math.PI * 2;
      
      // Draw segment
      ctx.beginPath();
      ctx.arc(cx, cy, r, a, a + seg);
      ctx.arc(cx, cy, innerR, a + seg, a, true);
      ctx.closePath();
      ctx.fillStyle = colorValues[i];
      ctx.fill();
      
      // Add subtle shadow
      ctx.strokeStyle = theme.shadow;
      ctx.lineWidth = 1;
      ctx.stroke();
      
      // Draw percentage label in the middle of segment
      const midAngle = a + seg / 2;
      const labelR = (r + innerR) / 2;
      const labelX = cx + Math.cos(midAngle) * labelR;
      const labelY = cy + Math.sin(midAngle) * labelR;
      
      const percentage = ((v / sum) * 100).toFixed(1);
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 14px Inter, system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${percentage}%`, labelX, labelY);
      
      a += seg;
    });
    
    // Draw center circle (donut hole)
    ctx.beginPath();
    ctx.arc(cx, cy, innerR, 0, Math.PI * 2);
    ctx.fillStyle = theme.bg;
    ctx.fill();
    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Center text - total
    ctx.fillStyle = theme.textStrong;
    ctx.font = 'bold 20px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${sum}`, cx, cy - 8);
    ctx.fillStyle = theme.text;
    ctx.font = '11px Inter, system-ui';
    ctx.fillText('Total', cx, cy + 10);
    
    // Legend at bottom
    const legendY = h - 20;
    const legendSpacing = 80;
    const startX = cx - (labels.length * legendSpacing) / 2;
    
    labels.forEach((label, i) => {
      const x = startX + i * legendSpacing;
      
      // Color box
      ctx.fillStyle = colorValues[i];
      ctx.fillRect(x, legendY - 8, 12, 12);
      ctx.strokeStyle = theme.tick;
      ctx.strokeRect(x, legendY - 8, 12, 12);
      
      // Label text
      ctx.fillStyle = theme.text;
      ctx.font = '11px Inter, system-ui';
      ctx.textAlign = 'left';
      ctx.fillText(`${label}: ${vals[i]}`, x + 18, legendY);
    });
  }
  // 4. Progress Meter - Semi-Circle Gauge with Color Gradient
  function drawGauge(c, p) {
    const ctx = c.getContext("2d");
    const w = c.width = c.clientWidth;
    const h = c.height = c.clientHeight;
    ctx.clearRect(0, 0, w, h);
    
    const theme = getThemeColors();
    const cx = w / 2;
    const cy = h * 0.75;
    const r = Math.min(w, h) * 0.35;
    const lineWidth = 18;
    const start = Math.PI;
    const end = 2 * Math.PI;
    const progress = Math.max(0, Math.min(1, p));
    
    // Draw background arc
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = theme.grid;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, end);
    ctx.stroke();
    
    // Draw progress arc with gradient
    const progressAngle = start + (end - start) * progress;
    
    // Create gradient based on progress
    let gradient;
    if (progress < 0.5) {
      // Red to Yellow
      gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      gradient.addColorStop(0, '#EF4444');
      gradient.addColorStop(1, '#F59E0B');
    } else if (progress < 0.75) {
      // Yellow to Cyan
      gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      gradient.addColorStop(0, '#F59E0B');
      gradient.addColorStop(1, '#22D3EE');
    } else {
      // Cyan to Green
      gradient = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
      gradient.addColorStop(0, '#22D3EE');
      gradient.addColorStop(1, '#22C55E');
    }
    
    ctx.strokeStyle = gradient;
    ctx.shadowColor = progress >= 0.75 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(34, 211, 238, 0.5)';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(cx, cy, r, start, progressAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;
    
    // Draw tick marks
    ctx.strokeStyle = theme.tick;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 10; i++) {
      const angle = start + (end - start) * (i / 10);
      const x1 = cx + Math.cos(angle) * (r - lineWidth / 2 - 5);
      const y1 = cy + Math.sin(angle) * (r - lineWidth / 2 - 5);
      const x2 = cx + Math.cos(angle) * (r - lineWidth / 2 - 12);
      const y2 = cy + Math.sin(angle) * (r - lineWidth / 2 - 12);
      
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      
      // Labels for 0%, 50%, 100%
      if (i === 0 || i === 5 || i === 10) {
        const labelX = cx + Math.cos(angle) * (r - lineWidth / 2 - 25);
        const labelY = cy + Math.sin(angle) * (r - lineWidth / 2 - 25);
        ctx.fillStyle = theme.text;
        ctx.font = '10px Inter, system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(`${i * 10}%`, labelX, labelY);
      }
    }
    
    // Draw needle
    const needleAngle = start + (end - start) * progress;
    const needleLength = r - lineWidth / 2 - 15;
    ctx.strokeStyle = theme.needle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(
      cx + Math.cos(needleAngle) * needleLength,
      cy + Math.sin(needleAngle) * needleLength
    );
    ctx.stroke();
    
    // Center dot
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fillStyle = theme.needle;
    ctx.fill();
    ctx.strokeStyle = theme.bg === '#FFFFFF' ? '#FFFFFF' : '#0B0F1A';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Center percentage text
    ctx.fillStyle = progress >= 0.75 ? '#22C55E' : '#22D3EE';
    ctx.font = 'bold 32px Inter, system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(progress * 100)}%`, cx, cy + r + 35);
    
    // Status label
    const status = progress >= 0.75 ? 'Excellent' : progress >= 0.5 ? 'Good' : progress >= 0.25 ? 'Fair' : 'Poor';
    ctx.fillStyle = theme.text;
    ctx.font = '12px Inter, system-ui';
    ctx.fillText(status, cx, cy + r + 55);
  }
  function getRunUrl() {
    return null;
  }
  function formatPercent(value) {
    if (window.i18nManager) return window.i18nManager.formatPercent(value);
    return value == null ? "—" : `${(value * 100).toFixed(1)}%`;
  }
  function formatNumber(value) {
    if (window.i18nManager) return window.i18nManager.formatNumber(value);
    return value == null ? "—" : new Intl.NumberFormat().format(value);
  }
  function renderMetrics(metrics = {}) {
    const valAcc = document.getElementById("valAcc");
    const valF1 = document.getElementById("valF1");
    const valPass = document.getElementById("valPass");
    const valCost = document.getElementById("valCost");
    const valProg = document.getElementById("valProg");
    if (valAcc) valAcc.textContent = formatPercent(metrics.accuracy);
    if (valF1) valF1.textContent = metrics.f1 ? metrics.f1.toFixed(2) : "—";
    if (valPass) valPass.textContent = formatPercent(metrics.pass_rate ?? metrics.passRate);
    if (valCost) valCost.textContent = formatNumber(metrics.token_cost ?? metrics.tokenCost);
    if (valProg) valProg.textContent = formatPercent((metrics.progress_pct ?? metrics.progressPct) / 100);
    const delta = document.getElementById("deltaAcc");
    if (delta) delta.textContent = "";
    renderCharts(metrics);
  }
  function renderCharts(metrics = {}) {
    // Update lastMetrics if new data provided, otherwise use cached
    if (Object.keys(metrics).length > 0) {
      lastMetrics = metrics;
    } else {
      metrics = lastMetrics;
    }

    const line = document.getElementById("lineGrowth");
    const bar = document.getElementById("barContrib");
    const pie = document.getElementById("piePass");
    const gauge = document.getElementById("gaugeProg");
    
    // Check if canvas elements exist
    if (!line || !bar || !pie || !gauge) {
      console.log('[renderCharts] Canvas elements not found yet');
      return; // Canvas elements not ready yet
    }
    
    // Check if canvas has dimensions (not rendered yet)
    if (line.clientWidth === 0 || line.clientHeight === 0) {
      // Canvas not sized yet, retry after a short delay
      console.log('[renderCharts] Canvas not sized yet, retrying...', {
        width: line.clientWidth,
        height: line.clientHeight
      });
      setTimeout(() => renderCharts(metrics), 100);
      return;
    }

    console.log('[renderCharts] Rendering charts with metrics:', metrics);

    // Provide default demo data if no metrics available
    const hasData = Object.keys(metrics).length > 0 || Object.keys(lastMetrics).length > 0;
    if (!hasData) {
      // Use default demo data for initial display
      metrics = {
        progress_pct: 65,
        pass_rate: 0.75,
        history: [45, 55, 60, 65],
        contributions: [20, 15, 10, 20]
      };
      lastMetrics = metrics;
    }

    const progress = Math.max(0, Math.min(1, (metrics.progress_pct ?? metrics.progressPct ?? 0) / 100));
    
    // Use real historical data if available, otherwise fallback to current progress or demo data
    const historyData = metrics.history && metrics.history.length > 0 
      ? metrics.history 
      : (progress > 0 ? [progress * 0.7 * 100, progress * 0.85 * 100, progress * 0.95 * 100, progress * 100] : [45, 55, 60, 65]);
    
    const contributionData = metrics.contributions && metrics.contributions.length > 0
      ? metrics.contributions
      : (progress > 0 ? [progress * 0.3 * 100, progress * 0.5 * 100, progress * 0.7 * 100, progress * 100] : [20, 15, 10, 20]);
    
    const passRate = metrics.pass_rate ?? metrics.passRate ?? 0.75;
    const passPercent = Math.round(passRate * 100);
    const failPercent = Math.round((1 - passRate) * 100);
    
    // Only render if canvas has dimensions
    if (line.clientWidth > 0 && line.clientHeight > 0) drawLine(line, historyData);
    if (bar.clientWidth > 0 && bar.clientHeight > 0) drawBars(bar, contributionData);
    if (pie.clientWidth > 0 && pie.clientHeight > 0) drawPie(pie, [passPercent, failPercent]);
    if (gauge.clientWidth > 0 && gauge.clientHeight > 0) drawGauge(gauge, progress);
  }
  
  // Expose renderCharts to global scope for use in index.html
  window.renderCharts = renderCharts;
  
  async function fetchLatestRun() {
    console.warn("[quizall] fetchLatestRun disabled - pipeline uses /api/pipeline/*");
    return { ok: false, error: "Outcome runner retired" };
  }
  function getStoredWizardSession(){try{const raw=localStorage.getItem(WIZARD_SESSION_KEY);return raw?JSON.parse(raw):null;}catch{return null;}}
  function setStoredWizardSession(sessionId){if(!sessionId)return;try{localStorage.setItem(WIZARD_SESSION_KEY,JSON.stringify({sessionId,startedAt:Date.now()}));}catch{}}
  function clearStoredWizardSession(){try{localStorage.removeItem(WIZARD_SESSION_KEY);}catch{}}
  
  // Global status indicator element
  let globalStatusIndicator = null;
  
  function createGlobalStatusIndicator() {
    if (globalStatusIndicator) return globalStatusIndicator;
    
    // Create the global status indicator if not exists
    globalStatusIndicator = document.createElement('div');
    globalStatusIndicator.id = 'quizallGlobalStatus';
    globalStatusIndicator.className = 'quizall-global-status hidden';
    globalStatusIndicator.innerHTML = `
      <div class="global-status-content">
        <span class="global-status-icon">⚠️</span>
        <span class="global-status-message">Question Wizard is running</span>
        <a href="wizard.html" class="global-status-cta">Go to Wizard →</a>
        <button class="global-status-dismiss" aria-label="Dismiss">&times;</button>
          </div>
    `;
    
    // Add dismiss handler
    const dismissBtn = globalStatusIndicator.querySelector('.global-status-dismiss');
    if (dismissBtn) {
      dismissBtn.addEventListener('click', () => {
        globalStatusIndicator.classList.add('hidden');
      });
    }
    
    document.body.appendChild(globalStatusIndicator);
    return globalStatusIndicator;
    }
  
  function updateGlobalStatus(options = {}) {
    const { message, details, autoHide = false, autoHideDelay = 5000, sessionId } = options;
    const indicator = createGlobalStatusIndicator();
    
    const msgEl = indicator.querySelector('.global-status-message');
    if (msgEl && message) {
      msgEl.textContent = message;
    }
    
    indicator.classList.remove('hidden');
    
    if (autoHide) {
      setTimeout(() => {
        indicator.classList.add('hidden');
      }, autoHideDelay);
    }
  }
  
  function hideGlobalStatus() {
    if (globalStatusIndicator) {
      globalStatusIndicator.classList.add('hidden');
  }
  }
  
  // Enhanced wizard session API - includes global status indicator
  window.quizallWizardSession = {
    markRunning: (sessionId) => {
      setStoredWizardSession(sessionId);
    },
    clear: () => {
      clearStoredWizardSession();
      hideGlobalStatus();
    },
    getActive: getStoredWizardSession,
    update: updateGlobalStatus,
    showGlobal: updateGlobalStatus,
    hideGlobal: hideGlobalStatus
  };
  // Remove markdown formatting for cleaner display
  function removeMarkdown(text) {
    if (!text || typeof text !== "string") return text;
    return text
      // Remove bold/italic: **text** or *text* or __text__ or _text_
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/__([^_]+)__/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
      // Remove headers: # Header, ## Header, etc.
      .replace(/^#{1,6}\s+/gm, '')
      // Remove code blocks: ```code``` or `code`
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove links: [text](url)
      .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
      // Remove images: ![alt](url)
      .replace(/!\[([^\]]*)\]\([^\)]+\)/g, '$1')
      // Remove strikethrough: ~~text~~
      .replace(/~~([^~]+)~~/g, '$1')
      // Clean up extra whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function formatBestPrompt(rawOutput) {
    if (!rawOutput) return "";
    let text = "";
    if (typeof rawOutput === "string") {
      text = rawOutput;
    } else {
      try {
        text = JSON.stringify(rawOutput, null, 2);
      } catch {
        text = String(rawOutput);
      }
    }
    // Remove markdown formatting for cleaner display
    return removeMarkdown(text);
  }

  async function refreshMetrics() {
    const data = await fetchLatestRun();
    const bestPromptEl = document.getElementById("bestPrompt");

    if (!data || !data.ok || !data.run) {
      console.warn("[quizall] refreshMetrics: No data available (pipeline now uses SSE)");
      // Do NOT modify the UI when data is unavailable - let SSE handle updates
      return;
    }

    const run = data.run;
    const bestContent = run?.result?.best?.content || "";
    const metrics = run.metrics || run.result?.metrics || run.result?.best?.metrics || {};

    renderMetrics(metrics);

    if (bestPromptEl && bestContent) {
        bestPromptEl.value = formatBestPrompt(bestContent);
        bestPromptEl.classList.remove("error-state", "processing-animation");
        bestPromptEl.classList.add("success-highlight");
        bestPromptEl.style.borderColor = "#22C55E";
    }
  }
  // Expose refreshMetrics globally so other scripts can call it
  window.quizallRefreshMetrics = refreshMetrics;
  // Expose function to get localized text for cross-script access
  window.quizallGetText = function(key) {
    if (window.i18n) {
      return window.i18n.t(key);
    }
    return key; // Fallback if i18n not ready
  };

  document.addEventListener("DOMContentLoaded", () => {
    const themeSel = document.getElementById("themeSelect");
    // Language selector is now handled by i18n.init.js
    // Keep theme selector logic

    if (themeSel) {
      const saved = localStorage.getItem(THEME_KEY) || "auto";
      themeSel.value = saved;
      applyTheme(saved);
      themeSel.addEventListener("change", () => {
        const v = themeSel.value;
        localStorage.setItem(THEME_KEY, v);
        applyTheme(v);
      });
      prefersDark.addEventListener("change", () => {
        if ((localStorage.getItem(THEME_KEY) || "auto") === "auto") {
          applyTheme("auto");
        }
      });
    }
    consentBanner();
    // Note: runBtn click handler is now in index.html to coordinate with animation
    // refreshMetrics() - REMOVED: pipeline now uses SSE for all updates
    const ro = new ResizeObserver(() => renderCharts());
    ["lineGrowth", "barContrib", "piePass", "gaugeProg"].forEach(id => {
      const c = document.getElementById(id);
      if (c) ro.observe(c);
    });
    
    // Initial render after a short delay to ensure canvas elements are sized
    setTimeout(() => {
      renderCharts();
    }, 200);
  });
})();
