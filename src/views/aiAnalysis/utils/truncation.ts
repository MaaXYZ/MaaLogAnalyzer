import type { ChatCompletionResult } from '../../../ai/client'
import type { AnalysisFocusMode, AnalysisPromptProfile, MemoryState } from '../types'
import type { AiRequestMode } from './requestFlow'
import { buildCompactPromptWithLimit } from './requestFlow'

interface HandleTruncationOptions {
  mode: AiRequestMode
  response: ChatCompletionResult
  truncateAutoRetryEnabled: boolean
  useMemoryForThisRound: boolean
  contextMemory: MemoryState | null
  promptProfile: AnalysisPromptProfile
  focusMode: AnalysisFocusMode
  promptSoftLimit: number
  buildMemoryPrompt: (memory: MemoryState, profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode) => string
  buildFullContextPrompt: (compact: boolean, minifiedJson: boolean, focusMode: AnalysisFocusMode) => string
  buildConciseRetryPrompt: (baseContent: string, profile: AnalysisPromptProfile) => string
  sendRequestTracked: (content: string) => Promise<ChatCompletionResult>
  updateUsageText: (resp: ChatCompletionResult, extra?: string) => void
  setStreamingText: (value: string) => void
  flushStreamingText: (force: boolean) => void
  appendUsageSuffix: (suffix: string) => void
  notifyWarning: (message: string) => void
  waitForUiPaint: () => Promise<void>
}

export const handleTruncation = async (
  options: HandleTruncationOptions,
): Promise<{
  response: ChatCompletionResult
  outputTruncated: boolean
}> => {
  let response = options.response
  let outputTruncated = response.finishReason === 'length'

  if (options.mode === 'analyze' && outputTruncated && options.truncateAutoRetryEnabled) {
    options.notifyWarning('检测到输出被截断，已自动发起一次精简重试。')
    await options.waitForUiPaint()
    try {
      const conciseBase = (() => {
        if (options.useMemoryForThisRound && options.contextMemory) {
          return options.buildMemoryPrompt(options.contextMemory, options.promptProfile, options.focusMode)
        }
        return buildCompactPromptWithLimit(options.buildFullContextPrompt, options.promptSoftLimit, options.focusMode)
      })()
      const concisePrompt = options.buildConciseRetryPrompt(conciseBase, options.promptProfile)
      response = await options.sendRequestTracked(concisePrompt)
      options.updateUsageText(response, ' | 精简重试')
      options.setStreamingText(response.text)
      options.flushStreamingText(true)
      outputTruncated = response.finishReason === 'length'
      if (outputTruncated) {
        options.appendUsageSuffix(' | 仍截断')
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      options.notifyWarning(`精简重试失败，保留截断结果：${msg}`)
      options.appendUsageSuffix(' | 输出截断')
    }
  } else if (outputTruncated) {
    options.appendUsageSuffix(' | 输出截断')
  }

  return { response, outputTruncated }
}
