/**
 * 错误处理工具模块
 * 提供统一的错误信息规范化处理
 */

/**
 * 从未知错误对象中提取错误消息
 * @param err - 未知类型的错误对象
 * @returns 格式化后的错误消息字符串
 */
export const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message
  }
  
  if (typeof err === 'string') {
    return err
  }
  
  // 尝试转换为字符串
  try {
    return String(err)
  } catch {
    return '未知错误'
  }
}

/**
 * 格式化错误对象，包含堆栈信息（开发环境使用）
 * @param err - 未知类型的错误对象
 * @returns 包含详细信息的错误描述
 */
export const getDetailedErrorMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.stack || err.message
  }
  
  return getErrorMessage(err)
}
