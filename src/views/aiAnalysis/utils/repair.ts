import { requestChatCompletion, type ChatCompletionResult } from '../../../ai/client'
import { tryParseStructuredOutput, type StructuredAiOutput } from '../../../ai/structuredOutput'
import type { ParentRelationConflictIssue, ParentRelationFacts } from '../types'

const AUTO_REPAIR_TIMEOUT_MS = 45000

interface RepairModelSettings {
  baseUrl: string
  model: string
}

interface RepairStructuredOutputOptions {
  rawOutput: string
  apiKey: string
  settings: RepairModelSettings
  onUsage?: (resp: ChatCompletionResult) => void
}

export const repairStructuredOutput = async (
  options: RepairStructuredOutputOptions,
): Promise<StructuredAiOutput | null> => {
  const trimmed = options.rawOutput.trim()
  if (!trimmed) return null

  const capped = trimmed.length > 24000
    ? `${trimmed.slice(0, 24000)}\n...(truncated)...`
    : trimmed

  const repair = await requestChatCompletion({
    baseUrl: options.settings.baseUrl,
    apiKey: options.apiKey,
    model: options.settings.model,
    temperature: 0,
    maxTokens: 1600,
    stream: false,
    responseFormatJson: true,
    retryOnLength: false,
    maxNetworkRetries: 1,
    timeoutMs: AUTO_REPAIR_TIMEOUT_MS,
    messages: [
      {
        role: 'system',
        content: [
          '你是 JSON 修复器。',
          '只输出一个 JSON 对象，格式必须为 {"answer":"...","memory_update":"..."}。',
          '禁止输出 Markdown 代码块、解释说明、额外字段。',
          '若原文缺失 memory_update，请给出简洁摘要。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `请将以下文本修复为目标 JSON：\n${capped}`,
      },
    ],
  })
  options.onUsage?.(repair)
  const parsed = tryParseStructuredOutput(repair.text)
  if (!parsed) {
    const preview = repair.text.trim().slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(`修复响应不可解析（length=${repair.text.trim().length}, preview="${preview}"）`)
  }
  return parsed
}

interface RepairParentRelationConsistencyOptions {
  current: StructuredAiOutput
  apiKey: string
  issue: ParentRelationConflictIssue
  facts: ParentRelationFacts | null
  settings: RepairModelSettings
  onUsage?: (resp: ChatCompletionResult) => void
}

export const repairParentRelationConsistency = async (
  options: RepairParentRelationConsistencyOptions,
): Promise<StructuredAiOutput | null> => {
  const answerSource = options.current.answer.trim()
  const memorySource = (options.current.memory_update ?? '').trim()
  const cappedAnswer = answerSource.length > 20000
    ? `${answerSource.slice(0, 20000)}\n...(truncated)...`
    : answerSource
  const cappedMemory = memorySource.length > 3000
    ? `${memorySource.slice(0, 3000)}...(truncated)...`
    : memorySource

  const repair = await requestChatCompletion({
    baseUrl: options.settings.baseUrl,
    apiKey: options.apiKey,
    model: options.settings.model,
    temperature: 0,
    maxTokens: 1600,
    stream: false,
    responseFormatJson: true,
    retryOnLength: false,
    maxNetworkRetries: 1,
    timeoutMs: AUTO_REPAIR_TIMEOUT_MS,
    messages: [
      {
        role: 'system',
        content: [
          '你是术语一致性修复器。',
          '只修正 answer 中“直接父节点”和“上游来源节点”表述冲突，不改动其余结论结构。',
          '禁止新增不存在的节点或数字，禁止删掉四段结构与证据编号。',
          '规则：',
          '- “直接父节点”只能写 nested/custom action 的直接承载节点。',
          '- “上游来源节点”只能写 jump_back 来源，不得写成直接父节点。',
          '- 若出现 X -> Y，则 Y 才可作为直接父节点，X 只能是上游来源。',
          '仅输出 JSON：{"answer":"...","memory_update":"..."}，不得输出解释。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `冲突原因：${options.issue.reason}`,
          `检测到的直接父节点：${options.issue.directParents.join(', ') || 'none'}`,
          `检测到的上游链路：${options.issue.upstreamChains.map(item => `${item.from}->${item.to}`).join(', ') || 'none'}`,
          '',
          '事实卡片（用于裁决，优先级最高）：',
          JSON.stringify(options.facts ?? {}, null, 2),
          '',
          '原 answer（请仅做术语关系修正，保持四段结构与编号）：',
          cappedAnswer,
          '',
          '原 memory_update（可按需最小修改）：',
          cappedMemory,
        ].join('\n'),
      },
    ],
  })
  options.onUsage?.(repair)
  const parsed = tryParseStructuredOutput(repair.text)
  if (!parsed) {
    const preview = repair.text.trim().slice(0, 120).replace(/\s+/g, ' ')
    throw new Error(`术语修正响应不可解析（length=${repair.text.trim().length}, preview="${preview}"）`)
  }
  return parsed
}
