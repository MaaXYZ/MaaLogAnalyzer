import packageJson from '../package.json' with { type: 'json' }
import { MLA_KERNEL_SCHEMA_VERSION, type KernelStatistics, type KernelOutput } from './protocol'
import type { EventNotification, TaskInfo } from './types'

export const KERNEL_PACKAGE_NAME = '@windsland52/maa-log-kernel'
export const KERNEL_PACKAGE_VERSION = packageJson.version
export const DEFAULT_KERNEL_PARSER_VERSION = `${KERNEL_PACKAGE_NAME}/${KERNEL_PACKAGE_VERSION}`

export interface BuildKernelOutputInput<TTask extends TaskInfo = TaskInfo> {
  content: string
  tasks: TTask[]
  events: EventNotification[]
  stats: KernelStatistics
  parserVersion?: string
  generatedAt?: string
}

export const buildKernelWarnings = (
  content: string,
  eventCount: number,
  taskCount: number,
): string[] => {
  const warnings: string[] = []
  if (!content.trim()) {
    warnings.push('Empty log content.')
  }
  if (eventCount === 0 && content.trim()) {
    warnings.push('No !!!OnEventNotify!!! events found in content.')
  }
  if (eventCount > 0 && taskCount === 0) {
    warnings.push('Events were parsed but no task lifecycle was assembled.')
  }
  return warnings
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
    warnings: buildKernelWarnings(input.content, input.events.length, input.tasks.length),
  }
}

export * from './protocol'
export * from './types'
export * from './statistics'
export * from './parser'
