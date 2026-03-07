/**
 * OAuth Authentication Handler
 * Handles Google and GitHub OAuth flows using PKCE
 */

(function() {
  let API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");

  // Failsafe: 在 Render 前端域名下，绝不应向同源请求 /api（会拿到 404.html 的 HTML）
  if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('.onrender.com') && API_BASE === window.location.origin) {
    API_BASE = "https://quizall-backend.onrender.com";
    console.warn("[oauth] API_BASE was pointing to frontend, overridden to backend");
  }

  const TOKEN_KEY = "quizall.token";

  // =============================================
  // OAuth Flow
  // =============================================

  async function initiateOAuth(provider) {
    try {
      console.log(`[oauth] Initiating ${provider} OAuth flow...`);
      console.log(`[oauth] API_BASE: ${API_BASE}`);
      // So backend redirects back to this origin after OAuth (avoids cross-origin redirect / security blocks)
      const returnOrigin = typeof window !== 'undefined' && window.location && window.location.origin ? window.location.origin : '';
      const authorizeUrl = returnOrigin
        ? `${API_BASE}/api/auth/oauth/${provider}/authorize?return_origin=${encodeURIComponent(returnOrigin)}`
        : `${API_BASE}/api/auth/oauth/${provider}/authorize`;
      const response = await fetch(authorizeUrl);
      console.log(`[oauth] Response status: ${response.status}`);

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error("[oauth] Response is not JSON (got HTML?):", text.slice(0, 200));
        throw new Error("API 返回了非 JSON 响应，请确认后端地址配置正确（config.js 中的 RENDER_BACKEND_URL）");
      }
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
    // 行业标准：token 经 fragment (#) 回传，不进入 Referer；错误仍用 query
    const hash = window.location.hash.slice(1);
    const search = window.location.search;
    const fromHash = hash ? new URLSearchParams(hash) : null;
    const fromSearch = search ? new URLSearchParams(search) : null;
    const token = (fromHash && fromHash.get('oauth_token')) || (fromSearch && fromSearch.get('oauth_token'));
    const success = (fromHash && fromHash.get('oauth_success')) || (fromSearch && fromSearch.get('oauth_success'));
    const error = (fromSearch && fromSearch.get('oauth_error')) || (fromHash && fromHash.get('oauth_error'));

    if (error) {
      showError(decodeURIComponent(error));
      window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
      return;
    }

    if (success === 'true' && token) {
      localStorage.setItem(TOKEN_KEY, token);
      window.dispatchEvent(new CustomEvent('authStateChanged'));
      showSuccess('Successfully signed in!');
      window.history.replaceState({}, document.title, window.location.pathname);
      if (window.authState && window.authState.fetchUserInfo) {
        window.authState.fetchUserInfo();
      }
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

  // Auto-handle callback on page load（fragment 或 query 任一含 oauth 参数即处理）
  const hash = window.location.hash.slice(1);
  if (window.location.search.includes('oauth_token') || window.location.search.includes('oauth_error') ||
      (hash && (hash.includes('oauth_token') || hash.includes('oauth_error')))) {
    handleOAuthCallback();
  }
})();

