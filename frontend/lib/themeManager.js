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
  
  // 页面加载时立即初始化主题（在解析 <head> 时执行）
  initTheme();
  
  // 向全局暴露接口
  window.themeManager = {
    init: initTheme,
    set: setTheme,
    get: getTheme,
    STORAGE_KEY: THEME_STORAGE_KEY
  };
})();
