/**
 * 全局主题管理器 (Global Theme Manager)
 * ================================================
 *
 * - 页面加载时立即应用保存的主题（支持 System / auto）
 * - 跨页面同步主题偏好
 * - 避免主题闪烁
 */

(function () {
  const THEME_STORAGE_KEY = "theme";
  const prefersDark = window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  function resolveTheme(preference) {
    const pref = preference || "auto";
    if (pref === "auto") {
      return prefersDark && prefersDark.matches ? "dark" : "light";
    }
    return pref === "light" ? "light" : "dark";
  }

  function getPreference() {
    return localStorage.getItem(THEME_STORAGE_KEY) || "auto";
  }

  function applyPreference(preference) {
    const resolved = resolveTheme(preference);
    document.documentElement.setAttribute("data-theme", resolved);
    return resolved;
  }

  function initTheme() {
    applyPreference(getPreference());
  }

  /**
   * @param {string} [preference] - 'auto' | 'light' | 'dark'；不传则切换 light/dark
   */
  function setTheme(preference) {
    let nextPreference = preference;
    if (!nextPreference) {
      const current = getPreference();
      if (current === "auto") {
        nextPreference = resolveTheme("auto") === "dark" ? "light" : "dark";
      } else {
        nextPreference = current === "dark" ? "light" : "dark";
      }
    }

    localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    const resolved = applyPreference(nextPreference);

    document.dispatchEvent(
      new CustomEvent("themechange", {
        detail: { theme: resolved, preference: nextPreference },
      })
    );

    return resolved;
  }

  function getTheme() {
    return resolveTheme(getPreference());
  }

  function initCursorFxGlobal() {
    if (window.__quizallCursorFxInitialized) return;
    if (!window.matchMedia) return;

    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!finePointer.matches || reducedMotion.matches) return;

    const body = document.body;
    if (!body) return;

    window.__quizallCursorFxInitialized = true;
    body.classList.remove("qa-cursor-mode-type", "qa-cursor-pressing", "qa-cursor-active");
    body.classList.add("qa-cursor-enabled", "qa-cursor-mode-normal");

    let currentMode = "normal";
    function setMode(mode) {
      if (!body || mode === currentMode) return;
      currentMode = mode;
      body.classList.toggle("qa-cursor-mode-normal", mode === "normal");
      body.classList.toggle("qa-cursor-mode-click", mode === "click");
      body.classList.toggle("qa-cursor-mode-select", mode === "select");
    }

    function isSelectTarget(target) {
      return (
        target instanceof Element &&
        !!target.closest(
          "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']), textarea, [contenteditable='true'], [contenteditable=''], [data-cursor='select']"
        )
      );
    }

    function isClickableTarget(target) {
      if (!(target instanceof Element)) return false;
      const clickable = target.closest(
        "[data-cursor='click'],a[href],button,summary,label[for],select,[role='button'],[tabindex]:not([tabindex='-1'])"
      );
      return !!(clickable && !clickable.matches("[disabled],[aria-disabled='true']"));
    }

    function updateMode(target) {
      if (isSelectTarget(target)) return setMode("select");
      if (isClickableTarget(target)) return setMode("click");
      setMode("normal");
    }

    function resetCursorState() {
      setMode("normal");
      body.classList.remove("qa-cursor-active", "qa-cursor-pressing");
    }

    window.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType && event.pointerType !== "mouse") return;
        updateMode(event.target);
      },
      { passive: true }
    );
    window.addEventListener("pointerdown", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      setMode("click");
    });
    window.addEventListener("pointerup", (event) => {
      if (event && event.target) updateMode(event.target);
    });
    document.addEventListener("focusin", (event) => updateMode(event.target));
    document.addEventListener("focusout", () => setMode("normal"));
    window.addEventListener("blur", resetCursorState);
    document.addEventListener("mouseleave", resetCursorState);
    window.addEventListener("mouseout", (event) => {
      if (!event.relatedTarget && !event.toElement) resetCursorState();
    });

    const handlePointerPrefChange = (event) => {
      if (!body) return;
      if (!event.matches) {
        body.classList.remove("qa-cursor-enabled");
        resetCursorState();
        return;
      }
      body.classList.add("qa-cursor-enabled");
      updateMode(document.activeElement || body);
    };
    if (finePointer.addEventListener) finePointer.addEventListener("change", handlePointerPrefChange);
    if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", handlePointerPrefChange);

    updateMode(document.activeElement || body);
  }

  if (prefersDark && prefersDark.addEventListener) {
    prefersDark.addEventListener("change", () => {
      if (getPreference() === "auto") applyPreference("auto");
    });
  }

  initTheme();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCursorFxGlobal, { once: true });
  } else {
    initCursorFxGlobal();
  }

  window.themeManager = {
    init: initTheme,
    set: setTheme,
    get: getTheme,
    getPreference,
    resolve: resolveTheme,
    STORAGE_KEY: THEME_STORAGE_KEY,
  };
})();
