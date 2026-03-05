/**
 * OAuth Authentication Handler
 * Handles Google and GitHub OAuth flows using PKCE
 */

(function() {
  const API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");

  const TOKEN_KEY = "quizall.token";

  // =============================================
  // OAuth Flow
  // =============================================

  async function initiateOAuth(provider) {
    try {
      console.log(`[oauth] Initiating ${provider} OAuth flow...`);
      console.log(`[oauth] API_BASE: ${API_BASE}`);
      
      const response = await fetch(`${API_BASE}/api/auth/oauth/${provider}/authorize`);
      console.log(`[oauth] Response status: ${response.status}`);
      
      const data = await response.json();
      console.log(`[oauth] Response data:`, data);

      if (!response.ok || !data.ok) {
        throw new Error(data.error || 'Failed to initiate OAuth');
      }

      // Store state for verification on callback
      sessionStorage.setItem(`oauth_state_${provider}`, data.state);

      // Redirect to OAuth provider
      console.log(`[oauth] Redirecting to: ${data.authUrl}`);
      window.location.href = data.authUrl;
    } catch (err) {
      console.error(`[oauth] Failed to initiate ${provider} OAuth:`, err);
      showError(err.message || `Failed to start ${provider} authentication`);
    }
  }

  // =============================================
  // OAuth Callback Handler
  // =============================================

  function handleOAuthCallback() {
    console.log('[oauth] handleOAuthCallback called');
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('oauth_token');
    const success = urlParams.get('oauth_success');
    const error = urlParams.get('oauth_error');

    console.log('[oauth] Callback params:', { token: token ? 'present' : 'missing', success, error });

    if (error) {
      console.error('[oauth] OAuth error:', error);
      showError(decodeURIComponent(error));
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (success === 'true' && token) {
      console.log('[oauth] OAuth success, saving token');
      // Save token
      localStorage.setItem(TOKEN_KEY, token);
      
      // Dispatch auth state change event
      window.dispatchEvent(new CustomEvent('authStateChanged'));
      
      // Show success message
      showSuccess('Successfully signed in!');
      
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
      
      // Refresh auth status if available
      if (window.authStatus && window.authStatus.checkAuthStatus) {
        console.log('[oauth] Refreshing auth status');
        window.authStatus.checkAuthStatus();
      } else {
        console.warn('[oauth] authStatus not available');
      }
    } else {
      console.warn('[oauth] Callback called but no success token found');
    }
  }

  // =============================================
  // UI Helpers
  // =============================================

  function showError(message) {
    // Try to use toast if available (note: showToast signature is (message, type, duration))
    if (window.showToast) {
      window.showToast(message, 'error');
    } else {
      alert(message);
    }
  }

  function showSuccess(message) {
    // Try to use toast if available (note: showToast signature is (message, type, duration))
    if (window.showToast) {
      window.showToast(message, 'success');
    } else {
      console.log('[oauth]', message);
    }
  }

  // =============================================
  // Public API
  // =============================================

  window.oauth = {
    signInWithGoogle: () => initiateOAuth('google'),
    signInWithGitHub: () => initiateOAuth('github'),
    handleCallback: handleOAuthCallback
  };

  // Auto-handle callback on page load
  if (window.location.search.includes('oauth_token') || window.location.search.includes('oauth_error')) {
    handleOAuthCallback();
  }
})();

