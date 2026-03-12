/**
 * 全局主题管理器 (Global Theme Manager)
 * ================================================
 * 
 * 用途：
 * - 在页面加载时立即应用保存的主题设置
 * - 跨页面同步主题
 * - 避免主题闪烁问题
 * 
 * 使用方法：
 * 在 HTML <head> 中添加：
 * <script src="lib/themeManager.js"></script>
 */

(function() {
  // 主题存储键 - 与其他页面保持一致
  const THEME_STORAGE_KEY = 'theme';
  
  /**
   * 初始化主题 - 在 DOM 完全加载前调用
   */
  function initTheme() {
    // 1. 获取保存的主题或使用默认值 'dark'
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    
    // 2. 立即应用到 HTML 元素（避免闪烁）
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  
  /**
   * 切换主题（供其他脚本调用）
   * @param {string} theme - 'dark' 或 'light'，不指定则自动切换
   */
  function setTheme(theme) {
    if (!theme) {
      // 自动切换
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      theme = current === 'dark' ? 'light' : 'dark';
    }
    
    // 应用主题
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    
    // 触发自定义事件，其他页面可以监听
    const event = new CustomEvent('themechange', {
      detail: { theme }
    });
    document.dispatchEvent(event);
    
    return theme;
  }
  
  /**
   * 获取当前主题
   */
  function getTheme() {
    return document.documentElement.getAttribute('data-theme') || 'dark';
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
      return target instanceof Element && !!target.closest(
        "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']), textarea, [contenteditable='true'], [contenteditable=''], [data-cursor='select']"
      );
    }

    function isClickableTarget(target) {
      if (!(target instanceof Element)) return false;
      const clickable = target.closest("[data-cursor='click'],a[href],button,summary,label[for],select,[role='button'],[tabindex]:not([tabindex='-1'])");
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

    window.addEventListener("pointermove", (event) => {
      if (event.pointerType && event.pointerType !== "mouse") return;
      updateMode(event.target);
    }, { passive: true });
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
  
  // 页面加载时立即初始化主题（在解析 <head> 时执行）
  initTheme();

  // 全站统一 cursor 模式初始化（在 body 就绪后执行）
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCursorFxGlobal, { once: true });
  } else {
    initCursorFxGlobal();
  }
  
  // 向全局暴露接口
  window.themeManager = {
    init: initTheme,
    set: setTheme,
    get: getTheme,
    STORAGE_KEY: THEME_STORAGE_KEY
  };
})();
