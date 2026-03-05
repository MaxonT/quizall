/**
 * 安全工具函数
 */

/**
 * HTML转义函数，防止XSS攻击
 * @param {string} str - 需要转义的字符串
 * @returns {string} 转义后的安全字符串
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * 安全地设置HTML内容（推荐使用textContent）
 * @param {HTMLElement} element - 目标元素
 * @param {string} content - 内容
 * @param {boolean} isHtml - 是否为HTML内容（需要转义）
 */
export function safeSetContent(element, content, isHtml = false) {
  if (!element) return;
  
  if (isHtml) {
    element.innerHTML = escapeHtml(content);
  } else {
    element.textContent = content;
  }
}

/**
 * 创建安全的HTML字符串（用于模板）
 * @param {string} template - HTML模板
 * @param {Object} data - 数据对象
 * @returns {string} 安全的HTML字符串
 */
export function safeTemplate(template, data) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = data[key];
    return value ? escapeHtml(String(value)) : '';
  });
}

/**
 * 验证URL是否安全（防止javascript:等协议）
 * @param {string} url - URL字符串
 * @returns {boolean} 是否为安全URL
 */
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:'];
  try {
    const parsed = new URL(url, window.location.origin);
    return allowedProtocols.includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * 清理CSS类名，防止CSS注入
 * @param {string} className - CSS类名
 * @returns {string} 清理后的类名
 */
export function sanitizeClassName(className) {
  if (typeof className !== 'string') return '';
  return className.replace(/[^a-zA-Z0-9_-]/g, '');
}