import { extractTime, formatDuration } from './formatDuration'

export interface TaskMetaLineInput {
  nodeCount: number
  duration?: number
  startTime?: string
}

/**
 * 任务列表用的单行元信息：`22 节点 · 1m 3s · 03:39:25`。
 * 时间只取时分秒（与节点卡一致），需要完整时间戳的地方用 title 自己带上。
 */
export const buildTaskMetaLine = ({
  nodeCount,
  duration,
  startTime,
}: TaskMetaLineInput): string => {
  const segments = [`${nodeCount} 节点`]

  if (duration) {
    segments.push(formatDuration(duration))
  }

  if (startTime) {
    // 日志来源不同、时间戳格式不一：认不出时分秒就原样显示，不要把它藏起来
    segments.push(extractTime(startTime) || startTime)
  }

  return segments.join(' · ')
}
