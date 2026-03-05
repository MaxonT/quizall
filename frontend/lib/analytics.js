/**
 * Analytics Event Tracking
 */

export const EVENTS = {
  // Page Views
  PAGE_VIEW_SUBSCRIPTION: 'subscription_page_view',
  PAGE_VIEW_CHECKOUT_SUCCESS: 'checkout_success_page_view',
  PAGE_VIEW_CHECKOUT_CANCEL: 'checkout_cancel_page_view',
  
  // User Actions
  CLICK_SUBSCRIBE: 'click_subscribe',
  CLICK_BILLING_TOGGLE: 'click_billing_toggle',
  CLICK_START_TRIAL: 'click_start_trial',
  CLICK_MANAGE_SUBSCRIPTION: 'click_manage_subscription',
  
  // Auth Flow
  AUTH_MODAL_SHOWN: 'auth_modal_shown',
  AUTH_LOGIN_SUCCESS: 'auth_login_success',
  AUTH_LOGIN_FAILED: 'auth_login_failed',
  AUTH_REGISTER_SUCCESS: 'auth_register_success',
  AUTH_REGISTER_FAILED: 'auth_register_failed',
  AUTH_MODAL_CLOSED: 'auth_modal_closed',
  
  // Checkout Flow
  CHECKOUT_SESSION_CREATED: 'checkout_session_created',
  CHECKOUT_SESSION_FAILED: 'checkout_session_failed',
  CHECKOUT_REDIRECT_START: 'checkout_redirect_start',
  
  // Payment Result
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  PAYMENT_CANCELED: 'payment_canceled',
  
  // Activation
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',
  ACTIVATION_TIMEOUT: 'activation_timeout',
  ACTIVATION_RETRY: 'activation_retry',
  
  // Errors
  NETWORK_ERROR: 'network_error',
  API_ERROR: 'api_error',
};

let sessionId = null;

function getSessionId() {
  if (!sessionId) {
    sessionId = localStorage.getItem('quizall.analytics_session') || generateId();
    localStorage.setItem('quizall.analytics_session', sessionId);
  }
  return sessionId;
}

function getUserId() {
  try {
    const token = localStorage.getItem('quizall.token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.sub;
    }
  } catch (e) {
    // ignore
  }
  return null;
}

function generateId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function track(event, properties = {}) {
  const API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");

  const payload = {
    event,
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    userId: getUserId(),
    properties: {
      ...properties,
      page: window.location.pathname,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
    },
  };
  
  // 发送到后端 (non-blocking)
  if (navigator.sendBeacon) {
    navigator.sendBeacon(
      `${API_BASE}/api/analytics/track`,
      JSON.stringify([payload])
    );
  } else {
    // Fallback for older browsers
    fetch(`${API_BASE}/api/analytics/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([payload]),
      keepalive: true,
    }).catch(() => {}); // Ignore errors
  }
  
  // 同时输出到控制台（开发环境）
  if (window.QUIZALL_DEBUG || localStorage.getItem('quizall.debug') === '1') {
    console.log('[analytics]', event, properties);
  }
}

// Auto-track page views
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    const path = window.location.pathname;
    if (path.includes('subscription')) {
      track(EVENTS.PAGE_VIEW_SUBSCRIPTION);
    } else if (path.includes('checkout-success')) {
      track(EVENTS.PAGE_VIEW_CHECKOUT_SUCCESS);
    } else if (path.includes('checkout-cancel')) {
      track(EVENTS.PAGE_VIEW_CHECKOUT_CANCEL);
    }
  });
}
