/**
 * Authentication Status Management
 * Handles authentication state display and updates across pages
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

  // DOM Elements
  const authStatusEl = document.getElementById('authStatus');
  const authButtons = document.getElementById('authButtons');
  const signInBtn = document.getElementById('signInBtn');
  const signUpBtn = document.getElementById('signUpBtn');
  const googleSignInBtn = document.getElementById('googleSignInBtn');
  const githubSignInBtn = document.getElementById('githubSignInBtn');
  const userMenu = document.getElementById('userMenu');
  const userMenuTrigger = document.getElementById('userMenuTrigger');
  const userMenuDropdown = document.getElementById('userMenuDropdown');
  const userEmailEl = document.getElementById('userEmail');
  const logoutBtn = document.getElementById('logoutBtn');

  if (!authStatusEl) {
    console.warn('[authStatus] Auth status element not found');
    return;
  }

  let currentUser = null;

  // =============================================
  // Initialization
  // =============================================

  async function init() {
    await checkAuthStatus();
    
    // Setup event listeners
    if (signInBtn) {
      signInBtn.addEventListener('click', () => {
        window.location.href = 'settings.html#accountPanel';
      });
    }
    
    if (signUpBtn) {
      signUpBtn.addEventListener('click', () => {
        window.location.href = 'settings.html#accountPanel';
      });
    }

    // Setup OAuth buttons
    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[authStatus] Google sign in button clicked');
        if (window.oauth && window.oauth.signInWithGoogle) {
          console.log('[authStatus] Calling window.oauth.signInWithGoogle()');
          window.oauth.signInWithGoogle();
        } else {
          console.error('[authStatus] window.oauth or signInWithGoogle not available');
          console.log('[authStatus] window.oauth:', window.oauth);
        }
      });
    }
    
    if (githubSignInBtn) {
      githubSignInBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('[authStatus] GitHub sign in button clicked');
        if (window.oauth && window.oauth.signInWithGitHub) {
          console.log('[authStatus] Calling window.oauth.signInWithGitHub()');
          window.oauth.signInWithGitHub();
        } else {
          console.error('[authStatus] window.oauth or signInWithGitHub not available');
          console.log('[authStatus] window.oauth:', window.oauth);
        }
      });
    }

    if (userMenuTrigger) {
      userMenuTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUserMenu();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', handleLogout);
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (userMenuDropdown && !userMenu.contains(e.target)) {
        userMenuDropdown.classList.add('hidden');
        userMenu?.classList.remove('open');
      }
    });

    // Listen for storage changes (cross-tab synchronization)
    window.addEventListener('storage', (e) => {
      if (e.key === TOKEN_KEY) {
        checkAuthStatus();
      }
    });

    // Also listen for custom auth events (same-tab updates)
    window.addEventListener('authStateChanged', checkAuthStatus);
  }

  // =============================================
  // Auth Status Check
  // =============================================

  async function checkAuthStatus() {
    const token = localStorage.getItem(TOKEN_KEY);
    
    if (!token) {
      showUnauthenticatedState();
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (response.ok && data.ok && data.user) {
        currentUser = data.user;
        showAuthenticatedState(data.user);
      } else {
        // Token invalid, clear it
        localStorage.removeItem(TOKEN_KEY);
        showUnauthenticatedState();
      }
    } catch (err) {
      console.error('[authStatus] Error checking auth status:', err);
      // On error, assume not authenticated
      showUnauthenticatedState();
    }
  }

  // =============================================
  // UI Updates
  // =============================================

  function showUnauthenticatedState() {
    currentUser = null;
    // Show all buttons when not authenticated
    if (authButtons) authButtons.classList.remove('hidden');
    if (signInBtn) signInBtn.classList.remove('hidden');
    if (signUpBtn) signUpBtn.classList.remove('hidden');
    if (googleSignInBtn) googleSignInBtn.classList.remove('hidden');
    if (githubSignInBtn) githubSignInBtn.classList.remove('hidden');
    if (userMenu) userMenu.classList.add('hidden');
  }

  function showAuthenticatedState(user) {
    // Hide Sign In and Create Account buttons when authenticated
    if (signInBtn) signInBtn.classList.add('hidden');
    if (signUpBtn) signUpBtn.classList.add('hidden');
    
    // Keep OAuth buttons (Google, GitHub) visible
    if (googleSignInBtn) googleSignInBtn.classList.remove('hidden');
    if (githubSignInBtn) githubSignInBtn.classList.remove('hidden');
    
    // Keep authButtons container visible and show user menu
    if (authButtons) authButtons.classList.remove('hidden');
    if (userMenu) userMenu.classList.remove('hidden');
    if (userEmailEl) {
      userEmailEl.textContent = user.email || 'User';
    }
  }

  function toggleUserMenu() {
    if (!userMenuDropdown) return;
    const isHidden = userMenuDropdown.classList.contains('hidden');
    
    if (isHidden) {
      userMenuDropdown.classList.remove('hidden');
      userMenu?.classList.add('open');
    } else {
      userMenuDropdown.classList.add('hidden');
      userMenu?.classList.remove('open');
    }
  }

  // =============================================
  // Logout
  // =============================================

  async function handleLogout() {
    const token = localStorage.getItem(TOKEN_KEY);
    
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }).catch(() => {
          // Ignore errors on logout
        });
      }
    } catch (err) {
      console.error('[authStatus] Logout error:', err);
    }

    // Clear token and update UI
    localStorage.removeItem(TOKEN_KEY);
    showUnauthenticatedState();
    
    // Dispatch event for other parts of the app
    window.dispatchEvent(new CustomEvent('authStateChanged'));

    // Redirect to home if not already there
    if (window.location.pathname !== '/index.html' && window.location.pathname !== '/') {
      window.location.href = 'index.html';
    }
  }

  // =============================================
  // Public API
  // =============================================

  window.authStatus = {
    checkAuthStatus,
    getUser: () => currentUser,
    isAuthenticated: () => !!currentUser
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

