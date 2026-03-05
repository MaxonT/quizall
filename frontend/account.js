/**
 * Account Page JavaScript
 * 
 * Handles:
 * - Subscription status display
 * - Daily usage limits display
 * - Billing portal access
 * - Logout
 */

(function() {
  const API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");

  // DOM Elements
  const loginRequired = document.getElementById('loginRequired');
  const accountContent = document.getElementById('accountContent');
  const subscriptionStatus = document.getElementById('subscriptionStatus');
  const planName = document.getElementById('planName');
  const periodEnd = document.getElementById('periodEnd');
  const trialEndItem = document.getElementById('trialEndItem');
  const trialEnd = document.getElementById('trialEnd');
  const cancelNotice = document.getElementById('cancelNotice');
  const manageSubscriptionBtn = document.getElementById('manageSubscriptionBtn');
  const promptUsageToday = document.getElementById('promptUsageToday');
  const wizardUsageToday = document.getElementById('wizardUsageToday');
  const userEmail = document.getElementById('userEmail');
  const memberSince = document.getElementById('memberSince');
  const logoutBtn = document.getElementById('logoutBtn');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const toastContainer = document.getElementById('toastContainer');
  const dailyResetNote = document.getElementById('dailyResetNote');

  // State
  let authToken = null;

  // =============================================
  // Initialization
  // =============================================

  async function init() {
    setupThemeToggle();
    setupEventListeners();
    
    // Check authentication - use unified authState if available
    if (window.authState && window.authState.getToken) {
      authToken = window.authState.getToken();
      // Fetch user info if needed
      if (authToken && !window.authState.getUser()) {
        await window.authState.fetchUserInfo();
      }
    } else {
      authToken = localStorage.getItem('quizall.token');
    }
    
    if (!authToken) {
      showLoginRequired();
      return;
    }
    
    showAccountContent();
    await loadAccountData();
  }

  // =============================================
  // API Calls
  // =============================================

  async function apiCall(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    const response = await window.authGuard.fetchWithAuth(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json().catch(() => ({}));
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    
    return data;
  }

  async function loadAccountData() {
    showLoading(true);
    
    try {
      const statusData = await apiCall('/api/billing/status');
      updateStatusDisplay(statusData);
      
    } catch (err) {
      console.error('Failed to load account data:', err);
      
      if (err.message.includes('token') || err.message.includes('auth') || err.message.includes('401')) {
        // Auth failed, clear and redirect
        localStorage.removeItem('quizall.token');
        showLoginRequired();
        return;
      }
      
      showToast('error', 'Failed to load account data. Please try again.');
    } finally {
      showLoading(false);
    }
  }

  async function openBillingPortal() {
    showLoading(true);
    
    try {
      const result = await apiCall('/api/billing/portal-session', {
        method: 'POST',
      });
      
      window.location.href = result.url;
      
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      showToast('error', err.message || 'Failed to open billing portal.');
      showLoading(false);
    }
  }

  // =============================================
  // UI Updates
  // =============================================

  function showLoginRequired() {
    window.authGuard?.showLoginRequired?.();
    loginRequired.classList.remove('hidden');
    accountContent.classList.add('hidden');
  }

  function showAccountContent() {
    loginRequired.classList.add('hidden');
    accountContent.classList.remove('hidden');
  }

  function updateStatusDisplay(data) {
    const { subscription, usage, limits, user, timezone, nextResetAt } = data;
    
    // Subscription Status
    subscriptionStatus.textContent = getStatusText(subscription.status);
    subscriptionStatus.className = `status-badge ${subscription.status}`;
    
    // Plan Name
    planName.textContent = subscription.plan 
      ? capitalizeFirst(subscription.plan)
      : 'None';
    
    // Period End
    if (subscription.periodEnd) {
      periodEnd.textContent = formatDate(subscription.periodEnd);
    } else {
      periodEnd.textContent = '--';
    }
    
    // Trial End
    if (subscription.status === 'trialing' && subscription.trialEnd) {
      trialEndItem.style.display = 'flex';
      trialEnd.textContent = formatDate(subscription.trialEnd);
      if (subscription.trialDaysRemaining !== null) {
        trialEnd.textContent += ` (${subscription.trialDaysRemaining} days left)`;
      }
    } else {
      trialEndItem.style.display = 'none';
    }
    
    // Cancel Notice
    if (subscription.cancelAtPeriodEnd) {
      cancelNotice.style.display = 'block';
    } else {
      cancelNotice.style.display = 'none';
    }
    
    // Manage Button
    if (subscription.status === 'active' || subscription.status === 'trialing') {
      manageSubscriptionBtn.style.display = 'inline-flex';
    } else {
      manageSubscriptionBtn.style.display = 'none';
    }

    if (promptUsageToday && wizardUsageToday) {
      const promptUsed = usage?.promptOptimization ?? 0;
      const promptDaily = limits?.promptOptimization?.daily ?? '--';
      const wizardUsed = usage?.questionWizard ?? 0;
      const wizardDaily = limits?.questionWizard?.daily ?? '--';

      promptUsageToday.textContent = `${promptUsed} / ${promptDaily}`;
      wizardUsageToday.textContent = `${wizardUsed} / ${wizardDaily}`;
    }

    if (dailyResetNote) {
      const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      if (nextResetAt) {
        const dt = new Date(nextResetAt);
        const when = dt.toLocaleString(undefined, {
          timeZone: tz,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit"
        });
        dailyResetNote.textContent = `Resets at ${when} (${tz})`;
      } else {
        dailyResetNote.textContent = `Resets daily at 00:00 (${tz})`;
      }
    }
    
    // User Info
    userEmail.textContent = user.email || '--';
    memberSince.textContent = user.createdAt ? formatDate(user.createdAt) : '--';
  }

  // =============================================
  // Event Handlers
  // =============================================

  function setupEventListeners() {
    // Manage Subscription
    manageSubscriptionBtn.addEventListener('click', openBillingPortal);
    
    // Logout
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('quizall.token');
      localStorage.removeItem('quizall.user');
      showToast('success', 'Logged out successfully.');
      setTimeout(() => {
        window.location.href = 'index.html';
      }, 1000);
    });
    
    // OAuth buttons in login-required section
    const googleLoginBtnAccount = document.getElementById('googleLoginBtnAccount');
    const githubLoginBtnAccount = document.getElementById('githubLoginBtnAccount');
    
    googleLoginBtnAccount?.addEventListener('click', () => {
      if (window.oauth && window.oauth.signInWithGoogle) {
        window.oauth.signInWithGoogle();
      } else {
        console.error("OAuth library not loaded");
        showToast('error', 'OAuth not available. Please refresh the page.');
      }
    });
    
    githubLoginBtnAccount?.addEventListener('click', () => {
      if (window.oauth && window.oauth.signInWithGitHub) {
        window.oauth.signInWithGitHub();
      } else {
        console.error("OAuth library not loaded");
        showToast('error', 'OAuth not available. Please refresh the page.');
      }
    });
  }

  function setupThemeToggle() {
    const themeToggle = document.getElementById('themeToggle');
    if (!themeToggle) return;
    
    const themeIcon = themeToggle.querySelector('.theme-icon');
    const currentTheme = window.themeManager?.get() || document.documentElement.getAttribute('data-theme');
    
    updateThemeIcon(themeIcon, currentTheme);
    
    themeToggle.addEventListener('click', () => {
      const newTheme = window.themeManager?.set() || setLocalTheme();
      updateThemeIcon(themeIcon, newTheme);
    });
    
    // 监听来自其他页面的主题变化
    document.addEventListener('themechange', (e) => {
      updateThemeIcon(themeIcon, e.detail.theme);
    });
  }
  
  function setLocalTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    return next;
  }

  function updateThemeIcon(icon, theme) {
    if (icon) {
      icon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
  }

  // =============================================
  // Utilities
  // =============================================

  function showLoading(show) {
    if (show) {
      loadingOverlay.classList.remove('hidden');
    } else {
      loadingOverlay.classList.add('hidden');
    }
  }

  function showToast(type, message) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 5000);
  }

  function getStatusText(status) {
    const statusMap = {
      'none': 'No Subscription',
      'trialing': 'Trial Active',
      'active': 'Active',
      'past_due': 'Past Due',
      'canceled': 'Canceled',
      'unpaid': 'Unpaid',
    };
    return statusMap[status] || status;
  }

  function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }


  function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // =============================================
  // Initialize
  // =============================================

  // Wait for DOM and i18n
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
