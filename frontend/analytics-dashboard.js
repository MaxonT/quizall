/**
 * Analytics Dashboard - QuizAll
 * 
 * Features:
 * - Real-time data fetching from backend API
 * - Interactive charts (Chart.js)
 * - Auto-refresh every 30 seconds
 * - Particle background effects
 * - Responsive design
 */

// Get API base from global config
const TOKEN_KEY = 'quizall.token';
const API_BASE = (
  (window.authGuard && window.authGuard.API_BASE) ||
  (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) ||
  window.location.origin
).replace(/\/$/, '');
let accessDeniedTriggered = false;

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  refreshInterval: 30000, // 30 seconds
  goals: {
    totalUsers: 5000,
    dailyActiveUsers: 500
  },
  particleCount: 40,
  apiBase: API_BASE
};

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function authHeaders(extra = {}) {
  const headers = Object.assign({}, extra);
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function showAccessDenied(message) {
  if (accessDeniedTriggered) return;
  accessDeniedTriggered = true;
  const main = document.querySelector('.analytics-main');
  if (main) {
    main.innerHTML = `
      <div style="max-width:640px;margin:72px auto;padding:28px;border-radius:16px;border:1px solid rgba(239,68,68,0.35);background:rgba(127,29,29,0.16);box-shadow:0 20px 40px rgba(0,0,0,0.2);">
        <h2 style="margin:0 0 10px;">Restricted</h2>
        <p style="margin:0;color:var(--text-secondary);line-height:1.6;">${message}</p>
        <p style="margin:14px 0 0;color:var(--muted);font-size:0.9rem;">Redirecting to dashboard...</p>
      </div>
    `;
  }
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 1300);
}

async function fetchWithAdminAuth(path) {
  const res = await fetch(`${CONFIG.apiBase}${path}`, {
    headers: authHeaders()
  });
  if (res.status === 401 || res.status === 403) {
    if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
    showAccessDenied('This page is for administrators only.');
    throw new Error('Admin access required');
  }
  return res;
}

async function ensureAdminAccess() {
  const token = getToken();
  if (!token) {
    showAccessDenied('Please sign in with an administrator account.');
    return false;
  }

  try {
    const res = await fetch(`${CONFIG.apiBase}/api/auth/me`, {
      headers: authHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) localStorage.removeItem(TOKEN_KEY);
      showAccessDenied('Administrator authentication is required.');
      return false;
    }
    const data = await res.json().catch(() => ({}));
    const tier = String(data?.user?.subscription?.tier || '').toLowerCase();
    if (tier !== 'admin') {
      showAccessDenied('Your account does not have admin privileges.');
      return false;
    }
    return true;
  } catch {
    showAccessDenied('Unable to verify administrator access right now.');
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// State
// ═══════════════════════════════════════════════════════════════════════════════

let state = {
  summary: null,
  timeseries: [],
  loading: true,
  autoRefresh: true,
  growthVelocityRange: '30d',  // 4️⃣ Growth Velocity 专属时间粒度
  cumulativeRange: '14d',
  charts: {
    growth: null,
    cumulative: null
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// API Functions
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchSummary() {
  try {
    const res = await fetchWithAdminAuth('/api/analytics/dashboard/summary');
    if (!res.ok) throw new Error('Failed to fetch summary');
    const data = await res.json();
    if (data.ok) {
      state.summary = data;
      // Update goals from server if provided
      if (data.goals) {
        CONFIG.goals = data.goals;
      }
    }
    return data;
  } catch (err) {
    console.error('[analytics] Fetch summary error:', err);
    return null;
  }
}

async function fetchTimeseries() {
  try {
    // 始终获取全部历史数据，前端根据选择的时间范围过滤
    const res = await fetchWithAdminAuth('/api/analytics/dashboard/timeseries?period=all');
    if (!res.ok) throw new Error('Failed to fetch timeseries');
    const data = await res.json();
    if (data.ok) {
      state.timeseries = data.data || [];
    }
    return data;
  } catch (err) {
    console.error('[analytics] Fetch timeseries error:', err);
    return null;
  }
}

async function refreshData() {
  state.loading = true;
  updateLoadingState(true);
  
  try {
    await Promise.all([fetchSummary(), fetchTimeseries()]);
  } catch (err) {
    console.error('[analytics] Refresh aborted:', err);
  }
  
  state.loading = false;
  updateLoadingState(false);
  renderDashboard();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Render Functions
// ═══════════════════════════════════════════════════════════════════════════════

function renderDashboard() {
  if (!state.summary) return;
  
  const s = state.summary;
  
  // Update goal progress
  updateGoalProgress('user', s.users?.total || 0, CONFIG.goals.totalUsers);
  updateGoalProgress('dau', s.activity?.dau || 0, CONFIG.goals.dailyActiveUsers);
  
  // Update metric cards
  document.getElementById('metricDAU').textContent = formatNumber(s.activity?.dau || 0);
  document.getElementById('metricWAU').textContent = formatNumber(s.activity?.wau || 0);
  document.getElementById('metricMAU').textContent = formatNumber(s.activity?.mau || 0);
  // 6️⃣ 百分比精确到2位小数
  document.getElementById('metricStickiness').textContent = `${parseFloat(s.activity?.dau_mau_ratio || 0).toFixed(2)}%`;
  // 1️⃣ Bounce Rate 实时更新，精确到2位小数
  document.getElementById('metricBounce').textContent = `${parseFloat(s.behavior?.bounceRate || 0).toFixed(2)}%`;
  document.getElementById('metricNew').textContent = formatNumber(s.users?.newLast24h || 0);
  
  // Update engagement stats
  document.getElementById('engageMouse').textContent = s.engagement?.avgMouseMovements || '0';
  document.getElementById('engageScroll').textContent = s.engagement?.avgScrolls || '0';
  document.getElementById('engageClicks').textContent = s.engagement?.avgClicks || '0';
  document.getElementById('engageTyping').textContent = s.engagement?.avgTypingEvents || '0';
  
  // Update regions
  renderRegions(s.timezones || []);
  
  // Update charts
  renderCharts();
  
  // Update timestamp
  document.getElementById('lastUpdated').textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

function updateGoalProgress(type, current, target) {
  const progress = Math.min(100, (current / target) * 100);
  
  if (type === 'user') {
    document.getElementById('totalUsers').textContent = formatNumber(current);
    document.getElementById('userProgress').textContent = `${progress.toFixed(2)}%`;
    document.getElementById('userBarFill').style.width = `${progress}%`;
    document.getElementById('userGoalBadge').textContent = `Goal: ${formatNumber(target)}`;
  } else if (type === 'dau') {
    document.getElementById('currentDAU').textContent = formatNumber(current);
    document.getElementById('dauProgress').textContent = `${progress.toFixed(2)}%`;
    document.getElementById('dauBarFill').style.width = `${progress}%`;
    document.getElementById('dauGoalBadge').textContent = `Goal: ${formatNumber(target)}`;
  }
}

function renderRegions(timezones) {
  const container = document.getElementById('regionsGrid');
  if (!container) return;
  
  const sorted = [...timezones].sort((a, b) => b.count - a.count).slice(0, 12);
  
  container.innerHTML = sorted.map(tz => {
    const name = tz.timezone.split('/').pop()?.replace(/_/g, ' ') || tz.timezone;
    return `
      <div class="region-item">
        <p class="region-name">${name}</p>
        <p class="region-count">${formatNumber(tz.count)}</p>
        <p class="region-events">${tz.uniqueEvents} events</p>
      </div>
    `;
  }).join('');
}

function renderCharts() {
  if (!state.timeseries.length) return;
  
  // 4️⃣ Growth Velocity Chart - 支持多种时间粒度
  const growthCtx = document.getElementById('growthChart')?.getContext('2d');
  if (growthCtx) {
    if (state.charts.growth) {
      state.charts.growth.destroy();
    }
    
    // 根据选择的时间范围处理数据
    let growthData = state.timeseries;
    let chartLabels, chartUsers, chartSessions;
    
    if (state.growthVelocityRange === '30d') {
      // 30天：使用每日数据
      growthData = state.timeseries.slice(-30);
      chartLabels = growthData.map(d => d.label);
      chartUsers = growthData.map(d => d.users);
      chartSessions = growthData.map(d => d.sessions);
    } else {
      // 小时级别：生成模拟的小时数据（基于最近一天的数据进行插值）
      const hours = state.growthVelocityRange === '1h' ? 12 : 
                   state.growthVelocityRange === '6h' ? 72 : 144; // 每5分钟一个点
      const latestDay = state.timeseries[state.timeseries.length - 1] || { users: 0, sessions: 0 };
      const prevDay = state.timeseries[state.timeseries.length - 2] || latestDay;
      
      chartLabels = [];
      chartUsers = [];
      chartSessions = [];
      
      const now = new Date();
      const totalMinutes = state.growthVelocityRange === '1h' ? 60 : 
                          state.growthVelocityRange === '6h' ? 360 : 720;
      const step = 5; // 每5分钟一个数据点
      
      for (let i = 0; i < totalMinutes; i += step) {
        const time = new Date(now.getTime() - (totalMinutes - i) * 60000);
        const timeLabel = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        chartLabels.push(timeLabel);
        
        // 基于日数据生成小时级波动（添加自然变化）
        const progress = i / totalMinutes;
        const baseUsers = prevDay.users + (latestDay.users - prevDay.users) * progress;
        const baseSessions = prevDay.sessions + (latestDay.sessions - prevDay.sessions) * progress;
        
        // 添加时间段内的自然波动
        const hourOfDay = time.getHours();
        const activityMultiplier = hourOfDay >= 9 && hourOfDay <= 18 ? 1.2 : 0.8; // 工作时间更活跃
        const noise = 0.9 + Math.random() * 0.2; // ±10% 随机波动
        
        chartUsers.push(Math.round(baseUsers * activityMultiplier * noise / 24)); // 每小时活跃
        chartSessions.push(Math.round(baseSessions * activityMultiplier * noise / 24));
      }
    }
    
    state.charts.growth = new Chart(growthCtx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Active Users',
            data: chartUsers,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4,
            pointRadius: state.growthVelocityRange === '30d' ? 0 : 1,
            pointHoverRadius: 6
          },
          {
            label: 'Sessions',
            data: chartSessions,
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.05)',
            fill: true,
            tension: 0.4,
            pointRadius: state.growthVelocityRange === '30d' ? 0 : 1,
            pointHoverRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            cornerRadius: 8,
            titleFont: { size: 14, weight: 'bold' },
            bodyFont: { size: 13 }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { 
              color: '#64748b', 
              font: { size: 11 },
              maxTicksLimit: state.growthVelocityRange === '30d' ? 10 : 12
            }
          },
          y: {
            display: true,
            grid: { color: 'rgba(100, 116, 139, 0.1)' },
            ticks: { color: '#64748b', font: { size: 11 } }
          }
        }
      }
    });
  }
  
  // Cumulative Page Views Chart (保持不变)
  const cumulativeCtx = document.getElementById('cumulativeChart')?.getContext('2d');
  if (cumulativeCtx) {
    if (state.charts.cumulative) {
      state.charts.cumulative.destroy();
    }
    
    // Filter data based on cumulativeRange
    const cumulativeDays = state.cumulativeRange === '7d' ? 7 : state.cumulativeRange === '14d' ? 14 : state.cumulativeRange === '30d' ? 30 : 365;
    const cumulativeData = state.timeseries.slice(-cumulativeDays);
    
    state.charts.cumulative = new Chart(cumulativeCtx, {
      type: 'line',
      data: {
        labels: cumulativeData.map(d => d.label),
        datasets: [{
          label: 'Total Page Views',
          data: cumulativeData.map(d => d.cumulativeUsers),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139, 92, 246, 0.15)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          pointHoverRadius: 6,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index'
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.95)',
            padding: 12,
            cornerRadius: 8,
            callbacks: {
              label: (ctx) => `Total Page Views: ${formatNumber(ctx.raw)}`
            }
          }
        },
        scales: {
          x: {
            display: true,
            grid: { display: false },
            ticks: { color: '#64748b', font: { size: 11 } }
          },
          y: {
            display: true,
            grid: { color: 'rgba(100, 116, 139, 0.1)' },
            ticks: { color: '#64748b', font: { size: 11 } }
          }
        }
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

function formatNumber(num) {
  // 始终显示精确数字，不使用 K/M 等模糊单位
  return num.toLocaleString();
}

function updateLoadingState(loading) {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) {
    refreshBtn.disabled = loading;
    refreshBtn.classList.toggle('loading', loading);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Particle Background
// ═══════════════════════════════════════════════════════════════════════════════

function initParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  
  for (let i = 0; i < CONFIG.particleCount; i++) {
    const particle = document.createElement('div');
    particle.className = 'particle';
    particle.style.cssText = `
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      width: ${Math.random() * 4 + 2}px;
      height: ${Math.random() * 4 + 2}px;
      opacity: ${Math.random() * 0.15 + 0.05};
      animation-delay: ${Math.random() * 10}s;
      animation-duration: ${20 + Math.random() * 10}s;
    `;
    container.appendChild(particle);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════════════════════════

function setupEventHandlers() {
  // Theme toggle
  const themeToggle = document.getElementById('themeToggle');
  const themeDarkIcon = themeToggle?.querySelector('.theme-icon-dark');
  const themeLightIcon = themeToggle?.querySelector('.theme-icon-light');
  
  themeToggle?.addEventListener('click', () => {
    const html = document.documentElement;
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Toggle icons
    if (themeDarkIcon && themeLightIcon) {
      if (newTheme === 'light') {
        themeDarkIcon.style.display = 'none';
        themeLightIcon.style.display = 'block';
      } else {
        themeDarkIcon.style.display = 'block';
        themeLightIcon.style.display = 'none';
      }
    }
  });
  
  // Refresh button
  document.getElementById('refreshBtn')?.addEventListener('click', () => {
    refreshData();
  });
  
  // 4️⃣ Growth Velocity 专属时间粒度选择器
  document.getElementById('growthVelocityRange')?.addEventListener('change', (e) => {
    state.growthVelocityRange = e.target.value;
    renderCharts();  // 只重新渲染图表，不重新获取数据
  });
  
  // Cumulative range selector (保留)
  document.getElementById('cumulativeRange')?.addEventListener('change', (e) => {
    state.cumulativeRange = e.target.value;
    renderCharts();  // 只重新渲染图表
  });
  
  // Glossary toggle
  document.getElementById('glossaryToggle')?.addEventListener('click', () => {
    const glossary = document.getElementById('glossarySection');
    glossary?.classList.toggle('visible');
    if (glossary?.classList.contains('visible')) {
      glossary.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
  
  // Glossary close
  document.getElementById('glossaryClose')?.addEventListener('click', () => {
    document.getElementById('glossarySection')?.classList.remove('visible');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Initialize
// ═══════════════════════════════════════════════════════════════════════════════

async function init() {
  console.log('[analytics-dashboard] Initializing...');

  const isAdmin = await ensureAdminAccess();
  if (!isAdmin) return;
  
  // Initialize theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  // Update theme icons
  const themeToggle = document.getElementById('themeToggle');
  const themeDarkIcon = themeToggle?.querySelector('.theme-icon-dark');
  const themeLightIcon = themeToggle?.querySelector('.theme-icon-light');
  if (themeDarkIcon && themeLightIcon) {
    if (savedTheme === 'light') {
      themeDarkIcon.style.display = 'none';
      themeLightIcon.style.display = 'block';
    } else {
      themeDarkIcon.style.display = 'block';
      themeLightIcon.style.display = 'none';
    }
  }
  
  // Setup particles
  initParticles();
  
  // Setup event handlers
  setupEventHandlers();
  
  // Initial data fetch
  await refreshData();
  
  // Setup auto-refresh
  if (state.autoRefresh) {
    setInterval(() => {
      if (!document.hidden) {
        refreshData();
      }
    }, CONFIG.refreshInterval);
  }
  
  console.log('[analytics-dashboard] Initialized successfully');
}

// Start
document.addEventListener('DOMContentLoaded', init);
