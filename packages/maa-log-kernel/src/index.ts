import packageJson from '../package.json' with { type: 'json' }
import { MLA_KERNEL_SCHEMA_VERSION, type KernelStatistics, type KernelOutput } from './protocol'
import type { EventNotification, TaskInfo } from './types'

export const KERNEL_PACKAGE_NAME = '@windsland52/maa-log-kernel'
export const KERNEL_PACKAGE_VERSION = packageJson.version
export const DEFAULT_KERNEL_PARSER_VERSION = `${KERNEL_PACKAGE_NAME}/${KERNEL_PACKAGE_VERSION}`

export interface BuildKernelOutputInput<TTask extends TaskInfo = TaskInfo> {
  /**
   * 单来源内容（旧路径）。多来源时不要为了它把文件拼成一整串（2GB+ 会撞 V8 字符串上限），
   * 只给 `contentLength` 即可。
   */
  content?: string
  /** 多来源时的总字符数，仅用于生成「空内容」类 warning。 */
  contentLength?: number
  tasks: TTask[]
  events: EventNotification[]
  stats: KernelStatistics
  parserVersion?: string
  generatedAt?: string
}

export const buildKernelWarningsFromLength = (
  contentLength: number,
  eventCount: number,
  taskCount: number,
): string[] => {
  const warnings: string[] = []
  const hasContent = contentLength > 0
  if (!hasContent) {
    warnings.push('Empty log content.')
  }
  if (eventCount === 0 && hasContent) {
    warnings.push('No !!!OnEventNotify!!! events found in content.')
  }
  if (eventCount > 0 && taskCount === 0) {
    warnings.push('Events were parsed but no task lifecycle was assembled.')
  }
  return warnings
}

export const buildKernelWarnings = (
  content: string,
  eventCount: number,
  taskCount: number,
): string[] => {
  // 旧签名保留（有调用方/测试在用）。空白内容仍按「空」处理，与历史行为一致。
  return buildKernelWarningsFromLength(content.trim().length, eventCount, taskCount)
}

export const buildKernelOutput = <TTask extends TaskInfo = TaskInfo>(
  input: BuildKernelOutputInput<TTask>,
): KernelOutput<TTask> => {
  return {
    meta: {
      schemaVersion: MLA_KERNEL_SCHEMA_VERSION,
      parserVersion: input.parserVersion || DEFAULT_KERNEL_PARSER_VERSION,
      generatedAt: input.generatedAt || new Date().toISOString(),
    },
    tasks: input.tasks,
    events: input.events,
    stats: input.stats,
    warnings:
      input.content != null
        ? buildKernelWarnings(input.content, input.events.length, input.tasks.length)
        : buildKernelWarningsFromLength(
            input.contentLength ?? 0,
            input.events.length,
            input.tasks.length,
          ),
  }
}

export * from './protocol'
export * from './types'
export * from './statistics'
export * from './parser'
