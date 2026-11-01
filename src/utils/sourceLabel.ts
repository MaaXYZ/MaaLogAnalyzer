import type { EventSourceRef } from '../types'

export interface SourceDescription {
  /** 展示用的文件名（路径取最后一段；没有路径时退回「输入 #N」） */
  file: string
  /** 完整路径，用于悬停提示；没有时为 undefined */
  path?: string
  /** 行号（1 起）；来源没带行号时为 undefined */
  line?: number
}

/**
 * 把解析器给出的来源信息整理成可展示的三元组。
 *
 * 为什么需要它：一次加载可能是多份日志（`maa.log` + `maa.bak.<时间>.log` 轮转片段，
 * 或客户端与 agent 两份来源），同一个任务/节点可能来自其中任意一份。解析器现在已经把
 * 来源（文件 + 行号）挂到事件与节点上，界面只要负责「取最后一段文件名 + 保留完整路径做提示」。
 *
 * 取不到文件名时不要硬凑：只有输入序号就显示「输入 #N」，什么都没有就返回 null，
 * 让调用方干脆不渲染这一行（比显示一个空值或"unknown"更诚实）。
 */
export const describeSourceRef = (
  ref?: Partial<Pick<EventSourceRef, 'path' | 'line' | 'inputIndex'>> | null,
): SourceDescription | null => {
  if (!ref) return null

  const path = typeof ref.path === 'string' ? ref.path.trim() : ''
  const baseName = path ? path.split(/[\\/]/).filter(Boolean).pop() : ''
  const line = typeof ref.line === 'number' && ref.line > 0 ? ref.line : undefined

  if (baseName) {
    return { file: baseName, path: path || undefined, line }
  }
  if (typeof ref.inputIndex === 'number' && Number.isFinite(ref.inputIndex)) {
    return { file: `输入 #${ref.inputIndex + 1}`, line }
  }
  return line != null ? { file: '未知文件', line } : null
}
