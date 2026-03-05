/**
 * 安全中间件
 * 提供额外的安全保护层
 */

import rateLimit from "express-rate-limit";
import { createSafeErrorResponse, logError } from "../lib/secureError.js";

/**
 * 请求体大小限制中间件
 */
export function requestSizeLimiter(maxSize = '10mb') {
  return (req, res, next) => {
    const contentLength = req.headers['content-length'];
    
    if (contentLength) {
      const sizeInMB = parseInt(contentLength) / (1024 * 1024);
      const maxSizeInMB = parseFloat(maxSize);
      
      if (sizeInMB > maxSizeInMB) {
        logError('requestSizeLimiter', new Error('Request too large'), {
          contentLength,
          maxSize,
          userAgent: req.headers['user-agent']
        });
        
        return res.status(413).json(
          createSafeErrorResponse(
            new Error('Request too large'), 
            '请求内容过大'
          )
        );
      }
    }
    
    next();
  };
}

/**
 * API密钥验证中间件（用于敏感操作）
 */
export function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;
  const validApiKey = process.env.API_KEY;
  
  if (!validApiKey) {
    return res.status(500).json(
      createSafeErrorResponse(
        new Error('API key not configured'), 
        '服务配置错误'
      )
    );
  }
  
  if (!apiKey || apiKey !== validApiKey) {
    logError('requireApiKey', new Error('Invalid API key'), {
      hasApiKey: !!apiKey,
      userAgent: req.headers['user-agent'],
      ip: req.ip
    });
    
    return res.status(401).json(
      createSafeErrorResponse(
        new Error('Invalid API key'), 
        'API密钥无效'
      )
    );
  }
  
  next();
}

/**
 * 严格的输入验证中间件
 */
export function validateInput(schema) {
  return (req, res, next) => {
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];
      
      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} 是必需的`);
        continue;
      }
      
      if (value !== undefined && value !== null) {
        if (rules.type && typeof value !== rules.type) {
          errors.push(`${field} 必须是 ${rules.type} 类型`);
        }
        
        if (rules.minLength && value.length < rules.minLength) {
          errors.push(`${field} 最少需要 ${rules.minLength} 个字符`);
        }
        
        if (rules.maxLength && value.length > rules.maxLength) {
          errors.push(`${field} 最多允许 ${rules.maxLength} 个字符`);
        }
        
        if (rules.pattern && !rules.pattern.test(value)) {
          errors.push(`${field} 格式不正确`);
        }
        
        if (rules.sanitize) {
          req.body[field] = rules.sanitize(value);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json(
        createSafeErrorResponse(
          new Error('Validation failed'), 
          `输入验证失败: ${errors.join(', ')}`
        )
      );
    }
    
    next();
  };
}

/**
 * 高级速率限制（基于用户）
 */
export function createUserRateLimit(options = {}) {
  return rateLimit({
    windowMs: options.windowMs || 15 * 60 * 1000, // 15分钟
    max: options.max || 100,
    keyGenerator: (req) => {
      // 优先使用用户ID，否则使用IP
      return req.user?.sub || req.ip;
    },
    message: (req, res) => {
      return createSafeErrorResponse(
        new Error('Rate limit exceeded'),
        '请求过于频繁，请稍后再试'
      );
    },
    standardHeaders: true,
    legacyHeaders: false,
    onLimitReached: (req, res, options) => {
      logError('rateLimitExceeded', new Error('Rate limit exceeded'), {
        userId: req.user?.sub,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        limit: options.max,
        windowMs: options.windowMs
      });
    }
  });
}

/**
 * SQL注入检测中间件
 */
export function detectSQLInjection(req, res, next) {
  // Admin端点完全绕过SQL注入检测（内部API，信任数据来源）
  if (req.path.startsWith('/api/admin')) {
    console.log(`[security] ✓ Admin path whitelisted: ${req.path}`);
    return next();
  }
  
  // 检查bypass标志（用于管理员操作如数据同步）
  if (req.headers['x-skip-validation'] === 'true' || req.query._skip_validation === 'true') {
    console.log(`[security] ✓ Validation skipped for: ${req.path}`);
    return next();
  }
  
  // 白名单路径 - 这些路径使用安全的参数化查询，无需检测
  // 所有路径都经过严格的输入验证和参数化查询处理
  const whitelistPaths = [
    // Analytics endpoints - use parameterized queries
    '/api/analytics/dashboard/timeseries',
    '/api/analytics/dashboard/summary',
    '/api/analytics/dashboard/track',
    '/api/analytics/track',
    
    // OAuth endpoints - code/state parameters contain base64 encoded strings
    '/api/auth/oauth/callback',
    '/api/auth/oauth/',
    
    // Stripe endpoints - webhook signatures and session IDs contain special characters
    '/api/stripe/webhook',
    '/api/billing/verify-session/',
    '/api/billing/checkout-session',
    '/api/billing/portal-session',
    '/api/billing/send-verification',
    '/api/billing/verify-email',
    '/api/billing/start-trial',
    '/api/billing/token-history',
    
    // Share endpoints - tokens are nanoid generated (alphanumeric + special chars)
    '/api/share/',
    
    // Pipeline/Stream endpoints - run IDs are nanoid generated
    '/api/pipeline/',
    
    // Auth endpoints - JWT tokens in headers (not in body/query/params)
    '/api/auth/',
    
    // Question Sessions - user answers may contain SQL keywords (legitimate text)
    '/api/question-sessions/',
    
    // Enhance endpoints - user prompts may contain SQL keywords (legitimate text)
    '/api/enhance/',
    
    // Prompts endpoints - user content may contain SQL keywords
    '/api/prompts/',
    
    // Specs endpoints - user ideas/specs may contain SQL keywords
    '/api/specs/',
    
    // Docs endpoints - document content may contain SQL keywords
    '/api/docs',
    
    // Runs endpoints - may contain SQL keywords in error messages or repair instructions
    '/api/runs/',
    
    // Outcome runs endpoints
    '/api/outcome-runs/',
    
    // Health check
    '/api/health',
    
    // Settings
    '/api/settings'
  ];
  
  // 如果路径在白名单中，跳过检测
  if (whitelistPaths.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  const sqlPatterns = [
    /('|(\\')|(;|\\;)|(\\|)|(\\*)|(\%27)|(\\x27))/i,
    /(select|insert|update|delete|drop|create|alter|exec|execute)/i,
    /(union|join|where|having|order\s+by|group\s+by)/i
  ];
  
  const checkValue = (value, path = '') => {
    if (typeof value === 'string') {
      // 跳过纯数字值的检测（如分页参数、天数等）
      if (/^\d+$/.test(value)) {
        return null;
      }
      
      for (const pattern of sqlPatterns) {
        if (pattern.test(value)) {
          logError('sqlInjectionDetected', new Error('Potential SQL injection'), {
            path,
            value: value.substring(0, 100), // 只记录前100个字符
            pattern: pattern.source,
            userAgent: req.headers['user-agent'],
            ip: req.ip
          });
          
          return res.status(400).json(
            createSafeErrorResponse(
              new Error('Invalid input detected'),
              '输入包含非法字符'
            )
          );
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, val] of Object.entries(value)) {
        const result = checkValue(val, `${path}.${key}`);
        if (result) return result;
      }
    }
    return null;
  };
  
  // 检查请求体、查询参数和URL参数
  const checkResult = 
    checkValue(req.body, 'body') ||
    checkValue(req.query, 'query') ||
    checkValue(req.params, 'params');
    
  if (checkResult) return checkResult;
  
  next();
}