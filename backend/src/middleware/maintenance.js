/**
 * Maintenance Mode Middleware
 * 
 * 当系统需要维护时，返回 503 状态码和友好的错误信息
 * 
 * 启用方式：
 * 在 .env 文件中设置：MAINTENANCE_MODE=true
 * 或在 Render 环境变量中设置：MAINTENANCE_MODE=true
 */

export function maintenanceMode(req, res, next) {
  // 检查是否启用维护模式
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  // 白名单路径：即使在维护模式下也允许访问
  const whitelist = [
    '/api/health',              // 健康检查
    '/api/maintenance/status'   // 维护状态查询
  ];
  
  // 如果请求的路径在白名单中，直接放行
  if (whitelist.some(path => req.path.startsWith(path))) {
    return next();
  }
  
  // 如果启用了维护模式，返回 503
  if (isMaintenanceMode) {
    return res.status(503).json({
      ok: false,
      error: 'SERVICE_UNAVAILABLE',
      message: '系统正在维护中，请稍后再试',
      maintenance: {
        enabled: true,
        estimatedDuration: '约 2 小时',
        contact: 'support@quizall.app'
      }
    });
  }
  
  // 正常模式，继续处理请求
  next();
}

/**
 * 获取维护状态的端点
 */
export function getMaintenanceStatus(req, res) {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === 'true';
  
  res.json({
    ok: true,
    maintenance: {
      enabled: isMaintenanceMode,
      message: isMaintenanceMode ? '系统正在维护中' : '系统运行正常',
      estimatedEnd: isMaintenanceMode ? new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() : null
    }
  });
}
