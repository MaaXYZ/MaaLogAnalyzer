import type { ChatCompletionResult } from '../../../ai/client'
import type { AnalysisFocusMode, AnalysisPromptProfile, MemoryState } from '../types'

export type AiRequestMode = 'test' | 'analyze'

interface BuildPromptContentOptions {
  mode: AiRequestMode
  useMemoryForThisRound: boolean
  contextMemory: MemoryState | null
  promptProfile: AnalysisPromptProfile
  focusMode: AnalysisFocusMode
  promptSoftLimit: number
  buildMemoryPrompt: (memory: MemoryState, profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode) => string
  buildFullContextPrompt: (compact: boolean, minifiedJson: boolean, focusMode: AnalysisFocusMode) => string
}

export const buildPromptContent = (options: BuildPromptContentOptions): {
  userContent: string
  usedCompactContext: boolean
} => {
  if (options.mode === 'test') {
    return { userContent: '请只输出：连接正常', usedCompactContext: false }
  }

  if (options.useMemoryForThisRound && options.contextMemory) {
    return {
      userContent: options.buildMemoryPrompt(options.contextMemory, options.promptProfile, options.focusMode),
      usedCompactContext: false,
    }
  }

  const fullPrompt = options.buildFullContextPrompt(false, false, options.focusMode)
  if (fullPrompt.length <= options.promptSoftLimit) {
    return { userContent: fullPrompt, usedCompactContext: false }
  }

  const compactPrompt = options.buildFullContextPrompt(true, false, options.focusMode)
  return {
    userContent: compactPrompt.length > options.promptSoftLimit
      ? options.buildFullContextPrompt(true, true, options.focusMode)
      : compactPrompt,
    usedCompactContext: true,
  }
}

export const buildCompactPromptWithLimit = (
  buildFullContextPrompt: (compact: boolean, minifiedJson: boolean, focusMode: AnalysisFocusMode) => string,
  promptSoftLimit: number,
  focusMode: AnalysisFocusMode,
): string => {
  const compactPrompt = buildFullContextPrompt(true, false, focusMode)
  return compactPrompt.length > promptSoftLimit
    ? buildFullContextPrompt(true, true, focusMode)
    : compactPrompt
}

interface UsageModeTextOptions {
  mode: AiRequestMode
  useMemoryForThisRound: boolean
  usedCompactContext: boolean
  promptProfile: AnalysisPromptProfile
  focusMode: AnalysisFocusMode
  selectedNodeFocusEnabled: boolean
  hasEffectiveSelectedNode: boolean
}

export const buildUsageModeText = (options: UsageModeTextOptions): string => {
  if (options.mode !== 'analyze') return '连接测试'

  const scope = options.useMemoryForThisRound ? '记忆上下文' : (options.usedCompactContext ? '压缩全量上下文' : '全量上下文')
  const profileLabel = options.promptProfile === 'followup' ? '追问模板' : '诊断模板'
  const focusLabel = options.focusMode === 'on_error'
    ? 'on_error专项'
    : options.focusMode === 'hotspot'
      ? '识别热点专项'
      : ''
  const nodeFocusLabel = options.selectedNodeFocusEnabled
    ? (options.hasEffectiveSelectedNode ? '节点焦点' : '任务级(未选节点)')
    : '任务级(焦点关闭)'
  const base = focusLabel ? `${scope} · ${profileLabel} · ${focusLabel}` : `${scope} · ${profileLabel}`
  return `${base} · ${nodeFocusLabel}`
}

interface BuildUsageTextOptions {
  mode: AiRequestMode
  response: ChatCompletionResult
  usageModeText: string
  tokenStatsSuffix: string
  extra?: string
}

export const buildUsageText = (options: BuildUsageTextOptions): string => {
  const extra = options.extra ?? ''
  if (options.mode === 'analyze') {
    return `${options.usageModeText}${extra}${options.tokenStatsSuffix}`
  }

  if (options.response.usage?.totalTokens != null) {
    return `Token ${options.response.usage.totalTokens} (P ${options.response.usage.promptTokens ?? '-'} / C ${options.response.usage.completionTokens ?? '-'}) | ${options.usageModeText}${extra}${options.tokenStatsSuffix}`
  }
  return `上下文模式: ${options.usageModeText}${extra}${options.tokenStatsSuffix}`
}

interface CreateUsageHelpersOptions {
  mode: AiRequestMode
  useMemoryForThisRound: boolean
  usedCompactContext: boolean
  promptProfile: AnalysisPromptProfile
  focusMode: AnalysisFocusMode
  selectedNodeFocusEnabled: boolean
  hasEffectiveSelectedNode: boolean
  buildTokenStatsSuffix: () => string
  setUsageText: (text: string) => void
  getUsageText: () => string
  setPostprocessStage: () => void
}

export const createUsageHelpers = (options: CreateUsageHelpersOptions) => {
  const usageModeText = buildUsageModeText({
    mode: options.mode,
    useMemoryForThisRound: options.useMemoryForThisRound,
    usedCompactContext: options.usedCompactContext,
    promptProfile: options.promptProfile,
    focusMode: options.focusMode,
    selectedNodeFocusEnabled: options.selectedNodeFocusEnabled,
    hasEffectiveSelectedNode: options.hasEffectiveSelectedNode,
  })

  const updateUsageText = (response: ChatCompletionResult, extra = '') => {
    options.setUsageText(buildUsageText({
      mode: options.mode,
      response,
      usageModeText,
      extra,
      tokenStatsSuffix: options.buildTokenStatsSuffix(),
    }))
  }

  const markPostprocess = () => {
    if (options.mode !== 'analyze') return
    options.setPostprocessStage()
    if (!options.getUsageText().includes('后处理中')) {
      options.setUsageText(`${options.getUsageText()} | 后处理中`)
    }
  }

  return {
    usageModeText,
    updateUsageText,
    markPostprocess,
  }
}

interface SendInitialRequestOptions {
  mode: AiRequestMode
  userContent: string
  useMemoryForThisRound: boolean
  usedCompactContext: boolean
  sendRequestTracked: (content: string) => Promise<ChatCompletionResult>
  isLikelyPayloadTooLargeError: (msg: string) => boolean
  buildCompactContent: () => string
  notifyRetry: (message: string) => void
}

export const sendInitialRequestWithFallback = async (
  options: SendInitialRequestOptions,
): Promise<{
  response: ChatCompletionResult
  usedCompactContext: boolean
}> => {
  let usedCompactContext = options.usedCompactContext
  try {
    const response = await options.sendRequestTracked(options.userContent)
    return {
      response,
      usedCompactContext,
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    const shouldRetryCompact = options.mode === 'analyze'
      && !options.useMemoryForThisRound
      && !usedCompactContext
      && options.isLikelyPayloadTooLargeError(msg)
    if (!shouldRetryCompact) throw error

    usedCompactContext = true
    options.notifyRetry('分析上下文较大，已自动切换压缩上下文重试一次')
    const response = await options.sendRequestTracked(options.buildCompactContent())
    return {
      response,
      usedCompactContext,
    }
  }
}
