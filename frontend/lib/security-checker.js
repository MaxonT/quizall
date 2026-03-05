/**
 * 前端安全检查工具
 * 在运行时检测和报告安全问题
 */

// 安全配置
const SECURITY_CONFIG = {
  // 检查间隔（毫秒）
  checkInterval: 30000, // 30秒
  
  // 允许的外部域名
  allowedDomains: [
    'fonts.googleapis.com',
    'fonts.gstatic.com',
    'cdnjs.cloudflare.com'
  ],
  
  // 危险的HTML标签
  dangerousTags: ['script', 'iframe', 'object', 'embed', 'applet'],
  
  // 敏感的事件属性
  dangerousEvents: ['onload', 'onerror', 'onclick', 'onmouseover']
};

class SecurityChecker {
  constructor() {
    this.violations = [];
    this.isChecking = false;
    this.init();
  }
  
  init() {
    console.log('[SecurityChecker] 初始化前端安全检查...');
    
    // 页面加载后进行初始检查
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.runAllChecks());
    } else {
      this.runAllChecks();
    }
    
    // 定期检查
    setInterval(() => this.runAllChecks(), SECURITY_CONFIG.checkInterval);
    
    // 监听DOM变化
    this.observeDOM();
  }
  
  runAllChecks() {
    if (this.isChecking) return;
    this.isChecking = true;
    
    try {
      this.checkInlineScripts();
      this.checkExternalResources();
      this.checkDangerousElements();
      this.checkLocalStorage();
      this.checkCSPViolations();
    } catch (error) {
      console.error('[SecurityChecker] 检查过程中发生错误:', error);
    } finally {
      this.isChecking = false;
    }
    
    this.reportViolations();
  }
  
  /**
   * 检查内联脚本
   */
  checkInlineScripts() {
    const inlineScripts = document.querySelectorAll('script:not([src])');
    
    inlineScripts.forEach(script => {
      if (script.innerHTML.trim()) {
        this.addViolation({
          type: 'INLINE_SCRIPT',
          severity: 'HIGH',
          element: script.tagName,
          message: '发现内联脚本，可能存在XSS风险',
          details: script.innerHTML.substring(0, 100)
        });
      }
    });
  }
  
  /**
   * 检查外部资源
   */
  checkExternalResources() {
    const externalElements = document.querySelectorAll('[src], [href]');
    
    externalElements.forEach(element => {
      const url = element.src || element.href;
      if (!url || url.startsWith('data:') || url.startsWith('blob:')) return;
      
      try {
        const urlObj = new URL(url, window.location.origin);
        
        // 检查是否为外部域名
        if (urlObj.origin !== window.location.origin) {
          const domain = urlObj.hostname;
          
          if (!SECURITY_CONFIG.allowedDomains.some(allowed => 
            domain === allowed || domain.endsWith('.' + allowed))) {
            this.addViolation({
              type: 'EXTERNAL_RESOURCE',
              severity: 'MEDIUM',
              element: element.tagName,
              message: '加载了未授权的外部资源',
              details: domain
            });
          }
        }
        
        // 检查协议
        if (urlObj.protocol === 'javascript:') {
          this.addViolation({
            type: 'JAVASCRIPT_PROTOCOL',
            severity: 'HIGH',
            element: element.tagName,
            message: '检测到javascript:协议，存在XSS风险',
            details: url
          });
        }
      } catch (error) {
        // URL解析失败
        this.addViolation({
          type: 'INVALID_URL',
          severity: 'MEDIUM',
          element: element.tagName,
          message: '发现无效URL',
          details: url
        });
      }
    });
  }
  
  /**
   * 检查危险元素
   */
  checkDangerousElements() {
    SECURITY_CONFIG.dangerousTags.forEach(tag => {
      const elements = document.getElementsByTagName(tag);
      
      Array.from(elements).forEach(element => {
        this.addViolation({
          type: 'DANGEROUS_ELEMENT',
          severity: 'HIGH',
          element: tag.toUpperCase(),
          message: `发现潜在危险的HTML标签: ${tag}`,
          details: element.outerHTML.substring(0, 200)
        });
      });
    });
    
    // 检查危险的事件属性
    SECURITY_CONFIG.dangerousEvents.forEach(event => {
      const elements = document.querySelectorAll(`[${event}]`);
      
      elements.forEach(element => {
        this.addViolation({
          type: 'DANGEROUS_EVENT',
          severity: 'HIGH',
          element: element.tagName,
          message: `发现内联事件处理器: ${event}`,
          details: element.getAttribute(event)
        });
      });
    });
  }
  
  /**
   * 检查本地存储安全
   */
  checkLocalStorage() {
    try {
      const sensitiveKeys = ['token', 'password', 'secret', 'key'];
      
      // 检查localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const lowerKey = key.toLowerCase();
        
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          const value = localStorage.getItem(key);
          
          // 检查值是否像是敏感信息（简单启发式）
          if (value && (value.length > 50 || value.includes('ey') || value.includes('Bearer'))) {
            this.addViolation({
              type: 'SENSITIVE_STORAGE',
              severity: 'MEDIUM',
              element: 'localStorage',
              message: `localStorage中可能存储了敏感信息: ${key}`,
              details: `值长度: ${value.length}`
            });
          }
        }
      }
      
      // 检查sessionStorage
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        const lowerKey = key.toLowerCase();
        
        if (sensitiveKeys.some(sensitive => lowerKey.includes(sensitive))) {
          const value = sessionStorage.getItem(key);
          
          if (value && (value.length > 50 || value.includes('ey') || value.includes('Bearer'))) {
            this.addViolation({
              type: 'SENSITIVE_STORAGE',
              severity: 'LOW',
              element: 'sessionStorage',
              message: `sessionStorage中可能存储了敏感信息: ${key}`,
              details: `值长度: ${value.length}`
            });
          }
        }
      }
    } catch (error) {
      console.warn('[SecurityChecker] 无法检查存储:', error);
    }
  }
  
  /**
   * 检查CSP违规
   */
  checkCSPViolations() {
    // 注册CSP违规处理器
    if (!window.cspViolationHandlerRegistered) {
      window.addEventListener('securitypolicyviolation', (e) => {
        this.addViolation({
          type: 'CSP_VIOLATION',
          severity: 'HIGH',
          element: 'CSP',
          message: `内容安全策略违规: ${e.violatedDirective}`,
          details: `被阻止的URI: ${e.blockedURI}, 源文件: ${e.sourceFile}:${e.lineNumber}`
        });
      });
      
      window.cspViolationHandlerRegistered = true;
    }
  }
  
  /**
   * 监听DOM变化
   */
  observeDOM() {
    if (typeof MutationObserver === 'undefined') return;
    
    const observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 检查新增的节点是否包含脚本或危险元素
          Array.from(mutation.addedNodes).forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              
              // 检查是否是危险标签
              if (SECURITY_CONFIG.dangerousTags.includes(element.tagName.toLowerCase())) {
                shouldCheck = true;
              }
              
              // 检查子元素
              SECURITY_CONFIG.dangerousTags.forEach(tag => {
                if (element.getElementsByTagName(tag).length > 0) {
                  shouldCheck = true;
                }
              });
            }
          });
        }
      });
      
      if (shouldCheck) {
        setTimeout(() => this.runAllChecks(), 100); // 延迟检查避免性能问题
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  /**
   * 添加安全违规记录
   */
  addViolation(violation) {
    violation.timestamp = new Date().toISOString();
    violation.url = window.location.href;
    
    // 去重
    const exists = this.violations.some(v => 
      v.type === violation.type && 
      v.element === violation.element && 
      v.details === violation.details
    );
    
    if (!exists) {
      this.violations.push(violation);
      
      // 立即报告高严重性违规
      if (violation.severity === 'HIGH') {
        console.error('[SecurityChecker] 高危安全问题:', violation);
      }
    }
  }
  
  /**
   * 报告安全违规
   */
  reportViolations() {
    if (this.violations.length === 0) return;
    
    const highViolations = this.violations.filter(v => v.severity === 'HIGH');
    const mediumViolations = this.violations.filter(v => v.severity === 'MEDIUM');
    const lowViolations = this.violations.filter(v => v.severity === 'LOW');
    
    if (highViolations.length > 0) {
      console.error(`[SecurityChecker] 发现 ${highViolations.length} 个高危安全问题:`, highViolations);
    }
    
    if (mediumViolations.length > 0) {
      console.warn(`[SecurityChecker] 发现 ${mediumViolations.length} 个中危安全问题:`, mediumViolations);
    }
    
    if (lowViolations.length > 0) {
      console.info(`[SecurityChecker] 发现 ${lowViolations.length} 个低危安全问题:`, lowViolations);
    }
    
    // 在开发环境显示违规摘要
    if (window.location.hostname === 'localhost') {
      this.showViolationSummary();
    }
  }
  
  /**
   * 显示违规摘要（开发环境）
   */
  showViolationSummary() {
    if (this.violations.length === 0) return;
    
    const summary = document.getElementById('security-summary');
    if (summary) return; // 已经显示
    
    const summaryEl = document.createElement('div');
    summaryEl.id = 'security-summary';
    summaryEl.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: #fee;
      border: 2px solid #f56565;
      border-radius: 8px;
      padding: 16px;
      max-width: 300px;
      z-index: 10000;
      font-family: monospace;
      font-size: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      float: right;
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      line-height: 1;
    `;
    closeBtn.onclick = () => summaryEl.remove();
    
    const title = document.createElement('div');
    title.style.cssText = 'font-weight: bold; color: #c53030; margin-bottom: 8px;';
    title.textContent = `🔒 发现 ${this.violations.length} 个安全问题`;
    
    const list = document.createElement('ul');
    list.style.cssText = 'margin: 0; padding-left: 16px; color: #744210;';
    
    const violationCounts = {};
    this.violations.forEach(v => {
      violationCounts[v.type] = (violationCounts[v.type] || 0) + 1;
    });
    
    Object.entries(violationCounts).forEach(([type, count]) => {
      const item = document.createElement('li');
      item.textContent = `${type}: ${count}`;
      list.appendChild(item);
    });
    
    summaryEl.appendChild(closeBtn);
    summaryEl.appendChild(title);
    summaryEl.appendChild(list);
    
    document.body.appendChild(summaryEl);
    
    // 10秒后自动隐藏
    setTimeout(() => {
      if (summaryEl.parentNode) {
        summaryEl.remove();
      }
    }, 10000);
  }
  
  /**
   * 获取安全报告
   */
  getSecurityReport() {
    return {
      timestamp: new Date().toISOString(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      violations: this.violations,
      summary: {
        total: this.violations.length,
        high: this.violations.filter(v => v.severity === 'HIGH').length,
        medium: this.violations.filter(v => v.severity === 'MEDIUM').length,
        low: this.violations.filter(v => v.severity === 'LOW').length
      }
    };
  }
}

// 导出安全检查器
window.QuizAllSecurityChecker = SecurityChecker;

// 在开发环境自动启动
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  window.quizallSecurity = new SecurityChecker();
  
  // 提供全局方法供调试使用
  window.getSecurityReport = () => window.quizallSecurity.getSecurityReport();
  
  console.log('[SecurityChecker] 开发环境安全检查已启动');
  console.log('[SecurityChecker] 使用 getSecurityReport() 获取安全报告');
}