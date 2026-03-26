import type { ChatCompletionResult } from '../../../ai/client'
import type { StructuredAiOutput } from '../../../ai/structuredOutput'
import type { TaskInfo } from '../../../types'
import type { ParentRelationConflictIssue, ParentRelationFacts } from '../types'

interface RepairStructuredJsonOptions {
  responseText: string
  outputTruncated: boolean
  apiKey: string
  trackRoundTokenUsage: (resp: ChatCompletionResult) => void
  markPostprocess: () => void
  appendUsageNote: (note: string) => void
  waitForUiPaint: () => Promise<void>
  notifyInfo: (message: string) => void
  notifyWarning: (message: string) => void
  notifyRepairFailed: (tag: 'structured' | 'relation', error: unknown) => void
  onUsageTag: (tag: string) => void
  repairStructuredOutput: (
    rawOutput: string,
    apiKey: string,
    onUsage?: (resp: ChatCompletionResult) => void,
  ) => Promise<StructuredAiOutput | null>
}

export const repairStructuredJsonIfNeeded = async (
  parsed: StructuredAiOutput | null,
  options: RepairStructuredJsonOptions,
): Promise<StructuredAiOutput | null> => {
  if (parsed || options.outputTruncated) return parsed

  options.markPostprocess()
  options.appendUsageNote('检测到非JSON，修复中')
  options.notifyInfo('检测到返回不是标准 JSON，正在自动修复...')
  await options.waitForUiPaint()
  try {
    const repaired = await options.repairStructuredOutput(
      options.responseText,
      options.apiKey,
      options.trackRoundTokenUsage,
    )
    options.onUsageTag(' | JSON修复')
    if (repaired) {
      options.notifyWarning('模型原始输出不是标准 JSON，已自动修复后继续。')
      await options.waitForUiPaint()
    }
    return repaired
  } catch (error) {
    options.notifyRepairFailed('structured', error)
    options.appendUsageNote('JSON修复失败')
    const msg = error instanceof Error ? error.message : String(error)
    options.notifyWarning(`JSON 自动修复失败：${msg}`)
    await options.waitForUiPaint()
    return parsed
  }
}

interface RepairParentRelationOptions {
  outputTruncated: boolean
  apiKey: string
  selectedTask: TaskInfo | null
  trackRoundTokenUsage: (resp: ChatCompletionResult) => void
  markPostprocess: () => void
  appendUsageNote: (note: string) => void
  waitForUiPaint: () => Promise<void>
  notifyInfo: (message: string) => void
  notifyWarning: (message: string) => void
  notifyRepairFailed: (tag: 'structured' | 'relation', error: unknown) => void
  onUsageTag: (tag: string) => void
  repairParentRelationConsistency: (
    current: StructuredAiOutput,
    apiKey: string,
    issue: ParentRelationConflictIssue,
    facts: ParentRelationFacts | null,
    onUsage?: (resp: ChatCompletionResult) => void,
  ) => Promise<StructuredAiOutput | null>
  detectParentRelationConflict: (answer: string) => ParentRelationConflictIssue | null
  collectParentRelationFacts: (task: TaskInfo | null) => ParentRelationFacts | null
}

export const repairParentRelationIfNeeded = async (
  parsed: StructuredAiOutput | null,
  options: RepairParentRelationOptions,
): Promise<StructuredAiOutput | null> => {
  if (!parsed || options.outputTruncated) return parsed

  const conflictIssue = options.detectParentRelationConflict(parsed.answer)
  if (!conflictIssue) return parsed

  const relationFacts = options.collectParentRelationFacts(options.selectedTask)
  options.markPostprocess()
  options.appendUsageNote('检测到术语冲突，修正中')
  options.notifyInfo('检测到“直接父节点/上游来源”术语冲突，正在自动修正...')
  await options.waitForUiPaint()
  try {
    const repaired = await options.repairParentRelationConsistency(
      parsed,
      options.apiKey,
      conflictIssue,
      relationFacts,
      options.trackRoundTokenUsage,
    )
    options.onUsageTag(' | 术语修正')
    if (repaired) {
      parsed = repaired
      options.notifyWarning('检测到“直接父节点/上游来源”术语冲突，已自动修正。')
      await options.waitForUiPaint()
    }
  } catch (error) {
    options.notifyRepairFailed('relation', error)
    options.appendUsageNote('术语修正失败')
    const msg = error instanceof Error ? error.message : String(error)
    options.notifyWarning(`术语修正请求失败：${msg}`)
    await options.waitForUiPaint()
  }

  const stillConflict = options.detectParentRelationConflict(parsed.answer)
  if (stillConflict) {
    options.notifyWarning(`检测到术语冲突，远程修正未生效：${stillConflict.reason}`)
    await options.waitForUiPaint()
  }

  return parsed
}
