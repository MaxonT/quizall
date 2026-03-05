/**
 * 内容安全策略（CSP）配置
 */

export const cspConfig = {
  directives: {
    defaultSrc: ["'self'"],
    styleSrc: [
      "'self'",
      "'unsafe-inline'", // 允许内联样式（考虑移除）
      "fonts.googleapis.com",
      "cdnjs.cloudflare.com"
    ],
    scriptSrc: [
      "'self'",
      "'unsafe-eval'", // i18next可能需要，考虑移除
      "cdnjs.cloudflare.com"
    ],
    fontSrc: [
      "'self'",
      "fonts.gstatic.com",
      "data:"
    ],
    imgSrc: [
      "'self'",
      "data:",
      "blob:",
      "*.githubusercontent.com" // GitHub头像等
    ],
    connectSrc: [
      "'self'",
      process.env.NODE_ENV === 'development' ? 'ws://localhost:*' : null, // 开发环境WebSocket
      "api.openai.com",
      "api.stripe.com"
    ].filter(Boolean),
    mediaSrc: ["'self'", "data:", "blob:"],
    objectSrc: ["'none'"],
    frameSrc: [
      "'self'",
      "*.stripe.com" // Stripe结账框架
    ],
    frameAncestors: ["'none'"], // 防止点击劫持
    baseUri: ["'self'"],
    formAction: ["'self'"]
  },
  reportOnly: process.env.NODE_ENV === 'development', // 开发环境仅报告，不阻止
  reportUri: '/api/security/csp-report'
};

/**
 * 生成CSP头部字符串
 */
export function generateCSPHeader() {
  const directives = Object.entries(cspConfig.directives)
    .map(([key, value]) => {
      const kebabCase = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${kebabCase} ${value.join(' ')}`;
    })
    .join('; ');
  
  return directives;
}

/**
 * CSP中间件
 */
export function cspMiddleware(req, res, next) {
  const cspHeader = generateCSPHeader();
  
  if (cspConfig.reportOnly) {
    res.setHeader('Content-Security-Policy-Report-Only', cspHeader);
  } else {
    res.setHeader('Content-Security-Policy', cspHeader);
  }
  
  // 其他安全头部
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  
  next();
}

/**
 * CSP违规报告处理器
 */
export function handleCSPReport(req, res) {
  try {
    const report = req.body;
    
    // 记录CSP违规（在生产环境中发送到监控系统）
    console.warn('[CSP] Content Security Policy violation:', {
      documentUri: report['document-uri'],
      violatedDirective: report['violated-directive'],
      blockedUri: report['blocked-uri'],
      sourceFile: report['source-file'],
      lineNumber: report['line-number'],
      timestamp: new Date().toISOString()
    });
    
    // 在生产环境中，这里应该发送到安全监控系统
    if (process.env.NODE_ENV === 'production') {
      // TODO: 集成安全监控服务
      // securityMonitor.reportCSPViolation(report);
    }
    
    res.status(204).send(); // 204 No Content
  } catch (error) {
    console.error('[CSP] Error handling CSP report:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}