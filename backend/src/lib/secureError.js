/**
 * 安全的错误处理工具
 */

import { nanoid } from "nanoid";

/**
 * 生产环境安全的错误响应
 * @param {Error} error - 原始错误
 * @param {string} userMessage - 用户友好的错误信息
 * @returns {Object} 安全的错误响应
 */
export function createSafeErrorResponse(error, userMessage = "操作失败") {
  const isProd = process.env.NODE_ENV === "production";
  
  // 生产环境不暴露技术细节
  const response = {
    ok: false,
    error: userMessage,
    timestamp: new Date().toISOString()
  };
  
  // 开发环境可以包含更多调试信息
  if (!isProd) {
    response.debug = {
      message: error.message,
      stack: error.stack?.split('\n').slice(0, 5) // 限制堆栈深度
    };
  }
  
  return response;
}

/**
 * 记录错误但不暴露敏感信息
 * @param {string} context - 错误上下文
 * @param {Error} error - 错误对象
 * @param {Object} metadata - 额外的元数据
 */
export function logError(context, error, metadata = {}) {
  const errorId = nanoid(8);
  
  // 安全的日志记录（移除敏感信息）
  const safeMetadata = sanitizeLogData(metadata);
  
  console.error(`[${context}] [${errorId}] ${error.message}`, {
    errorId,
    timestamp: new Date().toISOString(),
    ...safeMetadata
  });
  
  // 开发环境显示完整堆栈
  if (process.env.NODE_ENV === "development") {
    console.error(`[${context}] [${errorId}] Stack:`, error.stack);
  }
  
  return errorId;
}

/**
 * 清理日志数据，移除敏感信息
 * @param {Object} data - 原始数据
 * @returns {Object} 清理后的数据
 */
function sanitizeLogData(data) {
  const sensitive = ['password', 'token', 'secret', 'key', 'auth', 'session'];
  const result = {};
  
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    const isSensitive = sensitive.some(s => keyLower.includes(s));
    
    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitizeLogData(value);
    } else {
      result[key] = value;
    }
  }
  
  return result;
}