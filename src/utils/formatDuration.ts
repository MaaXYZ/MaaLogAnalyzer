/**
 * 格式化时长 - 根据时长自动选择合适的单位
 * @param durationMs 时长（毫秒）
 * @returns 格式化后的字符串
 */
export function formatDuration(durationMs: number | undefined): string {
  if (durationMs === undefined || durationMs === null) {
    return '-'
  }

  // 小于1秒：显示毫秒
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`
  }

  const seconds = durationMs / 1000

  // 小于60秒：显示秒
  if (seconds < 60) {
    return `${seconds.toFixed(2)}s`
  }

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60

  // 小于60分钟：显示分钟和秒
  if (minutes < 60) {
    if (remainingSeconds < 1) {
      return `${minutes}m`
    }
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`
  }

  // 大于等于60分钟：显示小时、分钟
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60

  if (remainingMinutes === 0) {
    return `${hours}h`
  }
  return `${hours}h ${remainingMinutes}m`
}

/**
 * 从时间戳中提取时分秒
 * @param timestamp 时间戳字符串
 * @returns HH:MM:SS 格式的时间字符串
 */
export function extractTime(timestamp: string): string {
  const match = timestamp.match(/(\d{2}:\d{2}:\d{2})/)
  return match ? match[1] : ''
}
