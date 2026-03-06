/**
 * Unified Authentication State Management
 * Provides consistent auth state management across all pages
 */

(function() {
  let API_BASE = (window.QUIZALL_API_BASE && window.QUIZALL_API_BASE.trim()) || 
    (window.location && window.location.origin && window.location.origin !== "null" 
      ? window.location.origin 
      : "http://localhost:8080");
  if (typeof window !== 'undefined' && window.location && window.location.hostname.includes('.onrender.com') && API_BASE === window.location.origin) {
    API_BASE = "https://quizall-backend.onrender.com";
  }

  const TOKEN_KEY = "quizall.token";

  let currentUser = null;
  let authStateListeners = [];

  // =============================================
  // Token Management
  // =============================================

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function setToken(token) {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
    notifyListeners();
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    notifyListeners();
  }

  // =============================================
  // User Info Management
  // =============================================

  async function fetchUserInfo() {
    const token = getToken();
    if (!token) {
      currentUser = null;
      return null;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.ok && data.user) {
        currentUser = data.user;
        return data.user;
      }
      // 仅 401 时清除 token；500/502 等服务器错误不应清除刚拿到的 OAuth token
      if (response.status === 401) {
        clearToken();
      }
      currentUser = null;
      return null;
    } catch (err) {
      console.error('[authState] Error fetching user info:', err);
      currentUser = null;
      return null;
    }
  }

  // =============================================
  // State Getters
  // =============================================

  function isAuthenticated() {
    return !!currentUser && !!getToken();
  }

  function getUser() {
    return currentUser;
  }

  function getAuthState() {
    return {
      isAuthenticated: isAuthenticated(),
      user: currentUser,
      token: getToken()
    };
  }

  // =============================================
  // Event Listeners
  // =============================================

  function addListener(callback) {
    authStateListeners.push(callback);
    // Return unsubscribe function
    return () => {
      authStateListeners = authStateListeners.filter(cb => cb !== callback);
    };
  }

  function notifyListeners() {
    const state = getAuthState();
    authStateListeners.forEach(callback => {
      try {
        callback(state);
      } catch (err) {
        console.error('[authState] Listener error:', err);
      }
    });
  }

  // =============================================
  // Initialize
  // =============================================

  async function init() {
    // Check auth status on load
    await fetchUserInfo();
    
    // Listen for storage changes (cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === TOKEN_KEY) {
        fetchUserInfo();
      }
    });

    // Listen for custom auth events
    window.addEventListener('authStateChanged', async () => {
      await fetchUserInfo();
    });
  }

  // =============================================
  // Public API
  // =============================================

  window.authState = {
    getToken,
    setToken,
    clearToken,
    fetchUserInfo,
    isAuthenticated,
    getUser,
    getAuthState,
    addListener,
    init
  };

  // Auto-initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();


