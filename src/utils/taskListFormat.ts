import { extractTime, formatDuration } from './formatDuration'
import type { TaskInfo } from '../types'

export interface TaskMetaLineInput {
  nodeCount: number
  duration?: number
  startTime?: string
}

/**
 * 任务列表用的单行元信息：`22 节点 · 1m 3s · 03:39:25`。
 * 日期由分组 badge 负责展示，这里只留时分秒；完整时间戳交给调用方的 title。
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

export interface TaskListItem {
  task: TaskInfo
  /** 原始数组下标：选中态与失败跳转都按它定位 */
  index: number
}

export interface TaskDateGroup {
  /** 分组渲染用的稳定 key（取组内首个任务的下标） */
  id: number
  /** 归一化后的日期，用于判断是否属于同一天 */
  dateKey: string
  /** 显示用日期：`2026-03-04`，取不到时间戳时为“日期未知” */
  label: string
  items: TaskListItem[]
}

const UNKNOWN_DATE_LABEL = '日期未知'
const TASK_DATE_PATTERN = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/

const resolveTaskDate = (startTime?: string): { dateKey: string; label: string } => {
  const match = startTime ? TASK_DATE_PATTERN.exec(startTime) : null
  if (!match) return { dateKey: '', label: UNKNOWN_DATE_LABEL }

  const [, year, month, day] = match
  const label = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  return { dateKey: label, label }
}

/**
 * 按开始时间的日期切分任务列表：只合并相邻的同一天，所以跨天日志会得到多个分组。
 * 归一化日期让 `2026.07.27-…` 与 `2026-07-27 …` 落进同一组。
 */
export const buildTaskDateGroups = (tasks: TaskInfo[]): TaskDateGroup[] => {
  const groups: TaskDateGroup[] = []

  tasks.forEach((task, index) => {
    const { dateKey, label } = resolveTaskDate(task.start_time)
    const last = groups[groups.length - 1]

    if (last && last.dateKey === dateKey) {
      last.items.push({ task, index })
      return
    }

    groups.push({ id: index, dateKey, label, items: [{ task, index }] })
  })

  return groups
}
