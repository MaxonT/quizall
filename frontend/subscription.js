/**
 * Subscription Page JavaScript (v2 - with State Machine & Auth Modal)
 * 
 * Handles:
 * - Auth Modal flow (inline login/register)
 * - Subscription State Machine integration
 * - Analytics tracking
 * - Stripe Checkout with idempotency
 * - Trial start
 * - Status display
 */

import { SubscriptionStateMachine, SubscriptionState } from './lib/subscriptionStateMachine.js';
import { track, EVENTS } from './lib/analytics.js';

(function() {
  const API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");

  // DOM Elements
  const statusBanner = document.getElementById('statusBanner');
  const trialBanner = document.getElementById('trialBanner');
  const statusValue = document.getElementById('statusValue');
  const usageLimitsValue = document.getElementById('usageLimitsValue');
  const startTrialBtn = document.getElementById('startTrialBtn');
  const monthlyToggle = document.getElementById('monthlyToggle');
  const yearlyToggle = document.getElementById('yearlyToggle');
  const loadingOverlay = document.getElementById('loadingOverlay');
  const toastContainer = document.getElementById('toastContainer');
  const subscribeButtons = document.querySelectorAll('.subscribe-btn');
  const pricingCards = document.querySelectorAll('.pricing-card');
  const betaModal = document.getElementById('betaModal');
  const betaModalClose = betaModal?.querySelector('.beta-modal-close');
  const betaModalOk = document.getElementById('betaModalOk');
  
  // Auth Modal Elements
  const authModal = document.getElementById('authModal');
  const authModalClose = authModal?.querySelector('.auth-modal-close');
  const showLoginBtn = document.getElementById('showLoginBtn');
  const showRegisterBtn = document.getElementById('showRegisterBtn');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const stepper = document.querySelector('.checkout-stepper');
  const authMessageEl = document.getElementById('authMessage');

  // State
  let currentPlan = 'monthly';
  let billingStatus = null;
  let authToken = null;
  let stateMachine = null;
  let selectedPlan = null;
  let idempotencyKey = null;
  let billingPlans = null;
  let subscriptionsAvailable = null;

  // =============================================
  // Initialization
  // =============================================

  async function init() {
    setupThemeToggle();
    setupBillingToggle();
    setupSubscribeButtons();
    setupTrialButton();
    setupBetaModal();
    setupAuthModal();
    setupCouponRedeem();
    
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
    
    // Initialize State Machine
    stateMachine = new SubscriptionStateMachine();
    stateMachine.onStateChange(handleStateChange);

    await loadBillingPlans();
    
    if (authToken) {
      await loadBillingStatus();
    } else {
      showTrialBanner(true);
    }
    
    // Check for interrupted flow
    recoverInterruptedFlow();
  }

  // =============================================
  // State Machine Handlers
  // =============================================

  function handleStateChange(oldState, newState) {
    console.log(`[subscription] State: ${oldState} → ${newState}`);
    track(EVENTS.STATE_CHANGE, { from: oldState, to: newState });
    
    updateStepperUI(newState);
    
    // State-specific actions
    switch (newState) {
      case SubscriptionState.AUTH_MODAL:
        showAuthModal();
        break;
      case SubscriptionState.CREATING_CHECKOUT:
        createCheckoutSession();
        break;
      case SubscriptionState.CHECKOUT_FAILED:
        const error = stateMachine.error || 'Failed to create checkout session';
        const errorMessage = error || 'Failed to create checkout session';
        
        // Show detailed error toast with retry option
        showErrorToast(errorMessage, () => {
          // Retry callback
          if (selectedPlan) {
            stateMachine.error = null;
            stateMachine.transitionTo(SubscriptionState.IDLE);
            subscribe(selectedPlan);
          }
        });
        break;
      case SubscriptionState.ERROR:
        const errorMsg = stateMachine.error || 'An error occurred';
        
        // Show detailed error toast with retry option
        showErrorToast(errorMsg, () => {
          // Retry callback
          if (selectedPlan) {
            stateMachine.error = null;
            stateMachine.transitionTo(SubscriptionState.IDLE);
            subscribe(selectedPlan);
          }
        });
        break;
    }
  }

  function updateStepperUI(state) {
    if (!stepper) return;
    
    const steps = stepper.querySelectorAll('.step');
    steps.forEach(step => {
      step.classList.remove('active', 'completed');
    });
    
    // Map states to stepper steps
    if ([SubscriptionState.CHECK_AUTH, SubscriptionState.AUTH_MODAL].includes(state)) {
      steps[0]?.classList.add('active');
    } else if ([SubscriptionState.CREATING_CHECKOUT, SubscriptionState.REDIRECTING_TO_STRIPE].includes(state)) {
      steps[0]?.classList.add('completed');
      steps[1]?.classList.add('active');
    } else if ([SubscriptionState.CONFIRMING_PAYMENT, SubscriptionState.ACTIVATED].includes(state)) {
      steps[0]?.classList.add('completed');
      steps[1]?.classList.add('completed');
      steps[2]?.classList.add('active');
    }
  }

  function recoverInterruptedFlow() {
    const saved = sessionStorage.getItem('subscription_pending');
    if (!saved) return;
    
    try {
      const data = JSON.parse(saved);
      const { plan, sessionId, timestamp } = data;
      
      // Only recover if less than 1 hour old
      if (Date.now() - timestamp < 3600000 && authToken) {
        console.log('[subscription] Recovering interrupted flow', data);
        selectedPlan = plan;
        stateMachine.transitionTo(SubscriptionState.CHECK_AUTH);
        track(EVENTS.CHECKOUT_FLOW_RECOVERED, { plan, sessionId });
      } else {
        sessionStorage.removeItem('subscription_pending');
      }
    } catch (err) {
      console.error('[subscription] Failed to recover flow:', err);
      sessionStorage.removeItem('subscription_pending');
    }
  }

  // =============================================
  // Auth Modal
  // =============================================

  function setupAuthModal() {
    // Close button
    authModalClose?.addEventListener('click', () => {
      hideAuthModal();
      stateMachine.transitionTo(SubscriptionState.IDLE);
    });
    
    // Click outside to close
    authModal?.addEventListener('click', (e) => {
      if (e.target === authModal) {
        hideAuthModal();
        stateMachine.transitionTo(SubscriptionState.IDLE);
      }
    });
    
    // Toggle between login/register
    showLoginBtn?.addEventListener('click', () => {
      loginForm.classList.remove('hidden');
      registerForm.classList.add('hidden');
      showLoginBtn.classList.add('active');
      showRegisterBtn.classList.remove('active');
      track(EVENTS.AUTH_TAB_SWITCHED, { tab: 'login' });
    });
    
    showRegisterBtn?.addEventListener('click', () => {
      registerForm.classList.remove('hidden');
      loginForm.classList.add('hidden');
      showRegisterBtn.classList.add('active');
      showLoginBtn.classList.remove('active');
      track(EVENTS.AUTH_TAB_SWITCHED, { tab: 'register' });
    });
    
    // Form submissions
    loginForm?.addEventListener('submit', handleLogin);
    registerForm?.addEventListener('submit', handleRegister);
    
    // OAuth buttons
    const googleSignInBtnAuth = document.getElementById('googleSignInBtnAuth');
    const githubSignInBtnAuth = document.getElementById('githubSignInBtnAuth');
    
    if (googleSignInBtnAuth) {
      googleSignInBtnAuth.addEventListener('click', () => {
        if (window.oauth && window.oauth.signInWithGoogle) {
          window.oauth.signInWithGoogle();
        } else {
          console.error('[subscription] OAuth module not loaded');
          showToast('error', 'OAuth authentication is not available. Please refresh the page.');
        }
      });
    }
    
    if (githubSignInBtnAuth) {
      githubSignInBtnAuth.addEventListener('click', () => {
        if (window.oauth && window.oauth.signInWithGitHub) {
          window.oauth.signInWithGitHub();
        } else {
          console.error('[subscription] OAuth module not loaded');
          showToast('error', 'OAuth authentication is not available. Please refresh the page.');
        }
      });
    }
  }

  function showAuthModal() {
    authModal?.classList.remove('hidden');
    track(EVENTS.AUTH_MODAL_OPENED, { plan: selectedPlan });
  }

  function hideAuthModal() {
    authModal?.classList.add('hidden');
    setAuthMessage(''); // Clear message when closing
    track(EVENTS.AUTH_MODAL_CLOSED);
  }

  function setAuthMessage(message = "", isError = false) {
    if (!authMessageEl) return;
    authMessageEl.textContent = message;
    authMessageEl.style.color = isError ? "#f87171" : "var(--accent, #0ea5e9)";
  }

  async function submitAuthForm(path, payload) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

  async function handleLogin(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      email: (formData.get("loginEmail") || "").toString().trim(),
      password: formData.get("loginPassword")
    };
    
    if (!payload.email || !payload.password) {
      setAuthMessage('Please enter both email and password', true);
      return;
    }
    
    try {
      const data = await submitAuthForm("/api/auth/login", payload);
      // Use unified authState if available
      if (window.authState && window.authState.setToken) {
        window.authState.setToken(data.token);
        await window.authState.fetchUserInfo();
      } else {
        localStorage.setItem('quizall.token', data.token);
      }
      authToken = data.token;
      
      setAuthMessage("Signed in successfully!");
      e.target.reset();
      
      track(EVENTS.AUTH_LOGIN_SUCCESS, { email: payload.email });
      
      // Small delay to show success message before closing modal
      setTimeout(() => {
        hideAuthModal();
        // Continue with checkout
        if (stateMachine && selectedPlan) {
          stateMachine.transitionTo(SubscriptionState.CREATING_CHECKOUT);
        }
      }, 1000);
      
    } catch (err) {
      console.error('Login failed:', err);
      setAuthMessage(err.message || 'Login failed. Please check your credentials.', true);
      track(EVENTS.AUTH_LOGIN_FAILED, { email: payload.email, error: err.message });
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = {
      email: (formData.get("registerEmail") || "").toString().trim(),
      password: formData.get("registerPassword")
    };
    const confirm = formData.get("registerConfirm");
    
    if (!payload.email || !payload.password || !confirm) {
      setAuthMessage('Please fill in all fields', true);
      return;
    }
    
    if (payload.password !== confirm) {
      setAuthMessage('Passwords do not match', true);
      return;
    }
    
    try {
      const data = await submitAuthForm("/api/auth/register", payload);
      // Use unified authState if available
      if (window.authState && window.authState.setToken) {
        window.authState.setToken(data.token);
        await window.authState.fetchUserInfo();
      } else {
        localStorage.setItem('quizall.token', data.token);
      }
      authToken = data.token;
      
      // Dispatch auth state change event
      window.dispatchEvent(new CustomEvent('authStateChanged'));
      
      setAuthMessage("Account created and signed in.");
      e.target.reset();
      
      track(EVENTS.AUTH_REGISTER_SUCCESS, { email: payload.email });
      
      // Small delay to show success message before closing modal
      setTimeout(() => {
        hideAuthModal();
        // Continue with checkout
        if (stateMachine && selectedPlan) {
          stateMachine.transitionTo(SubscriptionState.CREATING_CHECKOUT);
        }
      }, 1000);
      
    } catch (err) {
      console.error('Registration failed:', err);
      setAuthMessage(err.message || 'Registration failed. Please try again.', true);
      track(EVENTS.AUTH_REGISTER_FAILED, { email: payload.email, error: err.message });
    }
  }

  // =============================================
  // API Calls
  // =============================================

  async function apiCall(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    
    return data;
  }

  async function loadBillingPlans() {
    try {
      const res = await fetch(`${API_BASE}/api/billing/plans`, { method: 'GET' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to load plans');
      }

      billingPlans = data;
      subscriptionsAvailable = !!data.subscriptionsAvailable;
    } catch (err) {
      console.error('[subscription] Failed to load billing plans:', err);
      subscriptionsAvailable = false;
    }
  }

  function getBetaMessage() {
    return window.i18n
      ? window.i18n.t('subscription.beta_modal_message')
      : 'Subscriptions and trials are not available yet. Coming soon.';
  }

  async function loadBillingStatus() {
    try {
      billingStatus = await apiCall('/api/billing/status');
      updateStatusDisplay();
    } catch (err) {
      console.error('Failed to load billing status:', err);
      if (err.message.includes('token') || err.message.includes('auth')) {
        localStorage.removeItem('quizall.token');
        authToken = null;
        showTrialBanner(true);
      }
    }
  }

  async function startTrial() {
    track(EVENTS.TRIAL_START_CLICKED);

    if (subscriptionsAvailable === false) {
      showBetaModal();
      return;
    }
    
    if (!authToken) {
      selectedPlan = 'trial';
      stateMachine.transitionTo(SubscriptionState.CHECK_AUTH);
      stateMachine.transitionTo(SubscriptionState.AUTH_MODAL);
      return;
    }
    
    showLoading(true);
    
    try {
      const fingerprint = await getFingerprint();
      
      const result = await apiCall('/api/billing/start-trial', {
        method: 'POST',
        body: JSON.stringify({ fingerprint }),
      });
      
      if (result.requiresPaymentMethod) {
        window.location.href = result.checkoutUrl;
        return;
      }
      
      showToast('success', 'Trial started successfully!');
      track(EVENTS.TRIAL_STARTED);
      await loadBillingStatus();
      
    } catch (err) {
      console.error('Failed to start trial:', err);
      showToast('error', err.message || 'Failed to start trial');
      track(EVENTS.TRIAL_START_FAILED, { error: err.message });
    } finally {
      showLoading(false);
    }
  }

  async function subscribe(plan) {
    selectedPlan = plan;
    track(EVENTS.SUBSCRIBE_CLICKED, { plan });
    
    // Check auth
    stateMachine.transitionTo(SubscriptionState.CHECK_AUTH);
    
    if (!authToken) {
      stateMachine.transitionTo(SubscriptionState.AUTH_MODAL);
      return;
    }
    
    // Proceed to checkout
    stateMachine.transitionTo(SubscriptionState.CREATING_CHECKOUT);
  }

  async function createCheckoutSession() {
    console.log('[subscription] createCheckoutSession() called for plan:', selectedPlan);
    showLoading(true);
    
    try {
      track(EVENTS.CHECKOUT_SESSION_CREATING, { plan: selectedPlan });
    } catch (err) {
      console.warn('[subscription] Analytics tracking failed:', err);
    }
    
    try {
      // Generate idempotency key
      idempotencyKey = `checkout_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      console.log('[subscription] Calling /api/billing/checkout-session with plan:', selectedPlan);
      const result = await apiCall('/api/billing/checkout-session', {
        method: 'POST',
        body: JSON.stringify({ 
          plan: selectedPlan,
          idempotencyKey,
        }),
      });
      
      console.log('[subscription] Checkout session created:', result);
      
      if (!result || !result.url) {
        throw new Error('Invalid response from server: missing checkout URL');
      }
      
      // Save pending state
      sessionStorage.setItem('subscription_pending', JSON.stringify({
        plan: selectedPlan,
        sessionId: result.sessionId,
        idempotencyKey,
        timestamp: Date.now(),
      }));
      
      try {
        track(EVENTS.CHECKOUT_SESSION_CREATED, { 
          plan: selectedPlan,
          sessionId: result.sessionId,
          reused: result.reused || false,
        });
      } catch (err) {
        console.warn('[subscription] Analytics tracking failed:', err);
      }
      
      // Transition to redirect
      stateMachine.transitionTo(SubscriptionState.REDIRECTING_TO_STRIPE);
      
      // Redirect to Stripe
      console.log('[subscription] Redirecting to Stripe checkout:', result.url);
      window.location.href = result.url;
      
    } catch (err) {
      console.error('[subscription] Failed to create checkout session:', err);
      const errorMessage = err.message || 'Failed to start checkout';
      showToast('error', errorMessage);
      
      try {
        track(EVENTS.CHECKOUT_SESSION_FAILED, { plan: selectedPlan, error: errorMessage });
      } catch (trackErr) {
        console.warn('[subscription] Analytics tracking failed:', trackErr);
      }
      
      stateMachine.error = errorMessage;
      stateMachine.transitionTo(SubscriptionState.CHECKOUT_FAILED);
    } finally {
      showLoading(false);
    }
  }

  // =============================================
  // UI Updates
  // =============================================

  function updateStatusDisplay() {
    if (!billingStatus) return;
    
    const { subscription, limits } = billingStatus;
    
    if (statusBanner) {
      statusBanner.classList.remove('hidden');
    }
    
    const statusText = getStatusText(subscription.status);
    if (statusValue) {
      statusValue.textContent = statusText;
      statusValue.className = `status-value ${subscription.status}`;
    }
    
    if (usageLimitsValue && billingStatus?.credits) {
      const c = billingStatus.credits;
      usageLimitsValue.textContent = `${c.balance ?? 0} credits remaining · ${c.dailyAllowance ?? 80}/day`;
    } else if (usageLimitsValue && limits?.promptOptimization?.daily && limits?.questionWizard?.daily) {
      const promptDaily = limits.promptOptimization.daily;
      const wizardDaily = limits.questionWizard.daily;
      const translated = window.i18n
        ? window.i18n.t('subscription.usage_limits_value', { promptDaily, wizardDaily })
        : null;
      usageLimitsValue.textContent =
        translated && translated !== 'subscription.usage_limits_value'
          ? translated
          : `${promptDaily} prompt optimizations/day · ${wizardDaily} question-wizard sessions/day`;
    }
    
    showTrialBanner(subscription.canStartTrial && subscription.status === 'none');
    
    updateSubscribeButtons(subscription);
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

  function showTrialBanner(show) {
    if (show) {
      trialBanner.classList.remove('hidden');
    } else {
      trialBanner.classList.add('hidden');
    }
  }

  function updateSubscribeButtons(subscription) {
    subscribeButtons.forEach(btn => {
      if (subscription.status === 'active' || subscription.status === 'trialing') {
        btn.textContent = window.i18n ? window.i18n.t('subscription.manage') : 'Manage';
        btn.onclick = () => openBillingPortal();
      }
    });
  }

  async function openBillingPortal() {
    showLoading(true);
    track(EVENTS.BILLING_PORTAL_OPENED);
    
    try {
      const result = await apiCall('/api/billing/portal-session', {
        method: 'POST',
      });
      
      window.location.href = result.url;
      
    } catch (err) {
      console.error('Failed to open billing portal:', err);
      showToast('error', err.message || 'Failed to open billing portal');
    } finally {
      showLoading(false);
    }
  }

  // =============================================
  // Event Handlers
  // =============================================

  function setupBillingToggle() {
    monthlyToggle.addEventListener('click', () => {
      currentPlan = 'monthly';
      monthlyToggle.classList.add('active');
      yearlyToggle.classList.remove('active');
      updatePlanDisplay();
      track(EVENTS.PRICING_TOGGLE_CLICKED, { plan: 'monthly' });
    });
    
    yearlyToggle.addEventListener('click', () => {
      currentPlan = 'yearly';
      yearlyToggle.classList.add('active');
      monthlyToggle.classList.remove('active');
      updatePlanDisplay();
      track(EVENTS.PRICING_TOGGLE_CLICKED, { plan: 'yearly' });
    });
  }

  function updatePlanDisplay() {
    pricingCards.forEach(card => {
      const plan = card.dataset.plan;
      
      if (plan === currentPlan) {
        card.classList.add('featured');
      } else {
        card.classList.remove('featured');
        if (plan === 'yearly') {
          card.classList.add('featured');
        }
      }
    });
  }

  function setupSubscribeButtons() {
    subscribeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const plan = btn.dataset.plan;
        console.log('[subscription] Subscribe button clicked, plan:', plan);
        
        // Free plan doesn't need subscription flow
        if (plan === 'free') {
          const message = window.i18n ? window.i18n.t('subscription.already_free_plan') : 'You are already on the free plan';
          showToast('info', message);
          return;
        }

        if (billingStatus?.subscription?.status === 'active' || billingStatus?.subscription?.status === 'trialing') {
          openBillingPortal();
          return;
        }

        if (subscriptionsAvailable === false) {
          showBetaModal();
          return;
        }
        
        // Ensure state machine is initialized
        if (!stateMachine) {
          console.error('[subscription] State machine not initialized');
          showToast('error', 'Please refresh the page and try again');
          return;
        }
        
        subscribe(plan);
      });
    });
  }

  function setupTrialButton() {
    if (startTrialBtn) {
      startTrialBtn.addEventListener('click', startTrial);
    }
  }

  function setupBetaModal() {
    betaModalClose?.addEventListener('click', hideBetaModal);
    betaModalOk?.addEventListener('click', hideBetaModal);
    betaModal?.addEventListener('click', (e) => {
      if (e.target === betaModal) hideBetaModal();
    });
  }

  function setupCouponRedeem() {
    const btn = document.getElementById('redeemCouponBtn');
    const input = document.getElementById('couponInput');
    const msgEl = document.getElementById('couponMessage');
    if (!btn || !input) return;

    function showCouponMsg(text, type) {
      if (!msgEl) return;
      msgEl.textContent = text;
      msgEl.className = `coupon-message ${type}`;
      msgEl.classList.remove('hidden');
    }

    async function doRedeem() {
      const code = input.value.trim();
      if (!code) { showCouponMsg('Please enter a coupon code.', 'error'); return; }

      const token = authToken || localStorage.getItem('quizall.token');
      if (!token) {
        showCouponMsg('Please log in first to redeem a coupon.', 'error');
        return;
      }

      btn.disabled = true;
      btn.textContent = 'Redeeming…';
      msgEl?.classList.add('hidden');

      try {
        const res = await fetch(`${API_BASE}/api/billing/redeem-coupon`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();
        if (data.ok) {
          showCouponMsg('🎉 Coupon redeemed! Your subscription has been activated.', 'success');
          input.value = '';
          // Refresh billing status
          if (typeof loadBillingStatus === 'function') await loadBillingStatus();
        } else {
          showCouponMsg(data.error || 'Invalid coupon code.', 'error');
        }
      } catch {
        showCouponMsg('Network error — please try again.', 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Redeem';
      }
    }

    btn.addEventListener('click', doRedeem);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRedeem(); });
  }

  function showBetaModal() {
    if (!betaModal) return;
    const msg = document.getElementById('betaModalMessage');
    if (msg) msg.textContent = getBetaMessage();
    betaModal.classList.remove('hidden');
  }

  function hideBetaModal() {
    if (!betaModal) return;
    betaModal.classList.add('hidden');
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
    // Ensure toast container exists
    let container = toastContainer;
    if (!container) {
      container = document.getElementById('toastContainer');
      if (!container) {
        // Create toast container if it doesn't exist
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
      }
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    // Force a reflow to ensure animation
    toast.offsetHeight;
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 5000);
  }

  function showErrorToast(message, retryCallback) {
    const toast = document.createElement('div');
    toast.className = 'toast error';
    
    const messageDiv = document.createElement('div');
    messageDiv.textContent = message;
    messageDiv.style.marginBottom = '0.5rem';
    toast.appendChild(messageDiv);
    
    if (retryCallback) {
      const retryBtn = document.createElement('button');
      retryBtn.textContent = 'Retry';
      retryBtn.className = 'toast-retry-btn';
      retryBtn.style.cssText = `
        background: white;
        color: #dc2626;
        border: none;
        padding: 0.25rem 0.75rem;
        border-radius: 4px;
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        margin-top: 0.5rem;
      `;
      retryBtn.onclick = () => {
        toast.remove();
        retryCallback();
      };
      toast.appendChild(retryBtn);
    }
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
      toast.remove();
    }, 8000); // Longer timeout for error with retry
  }

  async function getFingerprint() {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
    ];
    
    const text = components.join('|');
    
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return hash.toString(36);
  }

  // =============================================
  // URL Parameter Handling
  // =============================================

  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    
    if (params.has('session_id')) {
      // This will be handled by checkout-success.html
      showToast('success', 'Processing your subscription...');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    
    if (params.has('canceled')) {
      showToast('error', 'Checkout was canceled');
      track(EVENTS.CHECKOUT_CANCELED);
      sessionStorage.removeItem('subscription_pending');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // =============================================
  // Initialize
  // =============================================

  if (window.i18n) {
    window.i18n.on('initialized', () => {
      init();
      handleUrlParams();
    });
    
    setTimeout(() => {
      init();
      handleUrlParams();
    }, 500);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      handleUrlParams();
    });
  }
})();
