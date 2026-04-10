import type { Ref } from 'vue'
import type { ChatCompletionResult } from '../../../ai/client'
import type { AiSettings } from '../../../utils/aiSettings'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import { tryParseStructuredOutput } from '../../../ai/structuredOutput'
import type {
  AnalysisFocusMode,
  AnalysisPromptProfile,
  ConversationTurn,
  MemoryState,
  MemoryStateStore,
  ParentRelationConflictIssue,
  ParentRelationFacts,
  TokenUsageAccumulator,
} from '../types'
import { appendConversationRound, buildConversationTurnItem, buildNextMemoryStore } from '../utils/persistence'
import { repairParentRelationIfNeeded, repairStructuredJsonIfNeeded } from '../utils/postprocess'
import {
  buildCompactPromptWithLimit,
  buildPromptContent,
  createUsageHelpers,
  sendInitialRequestWithFallback,
} from '../utils/requestFlow'
import { createSendRequest, createTrackedRequester } from '../utils/requestClient'
import { handleTruncation } from '../utils/truncation'
import { sanitizeAnswerForUser } from '../utils/markdown'
import {
  accumulateTokenUsage,
  getNextConversationTurn,
  isLikelyPayloadTooLargeError,
  makeTokenUsageAccumulator,
  sumContextTokenUsage,
} from '../utils/runtime'
import { prepareAnalyzeRuntimeState, resolvePromptDecision } from '../utils/requestSetup'

type RequestMode = 'test' | 'analyze'

interface UseAiRequestRunnerOptions {
  apiKey: Ref<string>
  question: Ref<string>
  settings: AiSettings
  selectedTask: Ref<TaskInfo | null>
  loadedTargets: Ref<AiLoadedTarget[]>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  currentContextKey: Ref<string>
  memoryStateStore: Ref<MemoryStateStore>
  memoryModeEnabled: Ref<boolean>
  conversationTurns: Ref<ConversationTurn[]>
  quickPromptProfileOverride: Ref<AnalysisPromptProfile | null>
  quickPromptFocusOverride: Ref<AnalysisFocusMode | null>
  activeRoundQuestion: Ref<string>
  usageText: Ref<string>
  analyzingStage: Ref<'idle' | 'streaming' | 'postprocess'>
  pendingStreamFullText: Ref<string>
  resultText: Ref<string>
  lastRequestUsedMemory: Ref<boolean>
  selectedNodeFocusEnabled: Ref<boolean>
  effectiveSelectedNode: Ref<NodeInfo | null>
  analyzing: Ref<boolean>
  testing: Ref<boolean>
  analysisPromptSoftLimit: number
  analysisTimeoutMs: number
  conversationQuestionMaxChars: number
  conversationAnswerMaxChars: number
  conversationMaxTurns: number
  conversationMaxTotalTurns: number
  memoryStoreMaxContexts: number
  shouldUseDiagnosticTemplateForQuestion: (questionText: string) => boolean
  buildMemoryPrompt: (memory: MemoryState, profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode) => string
  buildFullContextPrompt: (compact: boolean, minifiedJson: boolean, focusMode: AnalysisFocusMode) => string
  getSystemPrompt: (profile: AnalysisPromptProfile, focusMode?: AnalysisFocusMode) => string
  buildConciseRetryPrompt: (baseContent: string, profile: AnalysisPromptProfile) => string
  resetAnalyzeTransientState: () => void
  appendUsageNote: (note: string) => void
  flushStreamingText: (force: boolean) => void
  waitForUiPaint: () => Promise<void>
  clipForStorage: (value: string, maxChars: number) => string
  appendMemorySummary: (previous: string, next: string, turn: number) => string
  buildFallbackMemory: (answer: string, questionText: string) => string
  repairStructuredOutput: (
    rawOutput: string,
    key: string,
    onUsage?: (resp: ChatCompletionResult) => void
  ) => Promise<import('../../../ai/structuredOutput').StructuredAiOutput | null>
  repairParentRelationConsistency: (
    current: import('../../../ai/structuredOutput').StructuredAiOutput,
    key: string,
    issue: ParentRelationConflictIssue,
    facts: ParentRelationFacts | null,
    onUsage?: (resp: ChatCompletionResult) => void
  ) => Promise<import('../../../ai/structuredOutput').StructuredAiOutput | null>
  detectParentRelationConflict: (answer: string) => ParentRelationConflictIssue | null
  collectParentRelationFacts: (task: TaskInfo | null) => ParentRelationFacts | null
  message: {
    warning: (content: string) => void
    info: (content: string) => void
    success: (content: string) => void
    error: (content: string) => void
  }
}

export const useAiRequestRunner = (options: UseAiRequestRunnerOptions) => {
  const runRequest = async (mode: RequestMode) => {
    const key = options.apiKey.value.trim()
    if (!key) {
      options.message.warning('请先输入 API Key')
      return
    }
    const questionSnapshot = options.question.value.trim() || '（空问题）'

    if (mode === 'analyze' && !options.selectedTask.value) {
      options.message.warning('请先在日志分析页面选择一个任务')
      return
    }

    let contextKey = options.currentContextKey.value
    let contextMemory: MemoryState | null = options.memoryStateStore.value[contextKey] ?? null
    let useMemoryForThisRound = mode === 'analyze' && options.memoryModeEnabled.value && !!contextMemory
    const forcedProfile = mode === 'analyze' ? options.quickPromptProfileOverride.value : null
    const forcedFocus = mode === 'analyze' ? options.quickPromptFocusOverride.value : null
    const { focusMode, promptProfile } = resolvePromptDecision({
      mode,
      useMemoryForThisRound,
      questionSnapshot,
      forcedProfile,
      forcedFocus,
      shouldUseDiagnosticTemplateForQuestion: options.shouldUseDiagnosticTemplateForQuestion,
    })
    if (mode === 'analyze') {
      options.quickPromptProfileOverride.value = null
      options.quickPromptFocusOverride.value = null
    }
    const runtimePrepared = await prepareAnalyzeRuntimeState({
      mode,
      initial: {
        contextKey,
        contextMemory,
        useMemoryForThisRound,
      },
      includeSignalLines: options.settings.includeSignalLines,
      loadedTargetsLength: options.loadedTargets.value.length,
      hasDeferredLoadedTargets: options.hasDeferredLoadedTargets.value,
      ensureLoadedTargets: options.ensureLoadedTargets.value ?? null,
      onAnalyzeStart: () => {
        options.activeRoundQuestion.value = questionSnapshot
        options.resetAnalyzeTransientState()
        options.usageText.value = 'AI 正在处理请求...'
        options.analyzingStage.value = 'streaming'
      },
      onLoadingDeferredTargets: () => {
        options.usageText.value = '正在按需加载日志源...'
      },
      onProcessing: () => {
        options.usageText.value = 'AI 正在处理请求...'
      },
      waitForUiPaint: options.waitForUiPaint,
      refreshRuntimeState: () => {
        const refreshedContextKey = options.currentContextKey.value
        const refreshedContextMemory = options.memoryStateStore.value[refreshedContextKey]
        return {
          contextKey: refreshedContextKey,
          contextMemory: refreshedContextMemory ?? null,
          useMemoryForThisRound: options.memoryModeEnabled.value && !!refreshedContextMemory,
        }
      },
    })
    contextKey = runtimePrepared.contextKey
    contextMemory = runtimePrepared.contextMemory
    useMemoryForThisRound = runtimePrepared.useMemoryForThisRound
    options.lastRequestUsedMemory.value = useMemoryForThisRound

    const initialContent = buildPromptContent({
      mode,
      useMemoryForThisRound,
      contextMemory,
      promptProfile,
      focusMode,
      promptSoftLimit: options.analysisPromptSoftLimit,
      buildMemoryPrompt: options.buildMemoryPrompt,
      buildFullContextPrompt: options.buildFullContextPrompt,
    })
    let usedCompactContext = initialContent.usedCompactContext
    const userContent = initialContent.userContent

    const sendRequest = createSendRequest({
      mode,
      baseUrl: options.settings.baseUrl,
      apiKey: key,
      model: options.settings.model,
      temperature: options.settings.temperature,
      maxTokens: options.settings.maxTokens,
      streamResponse: options.settings.streamResponse,
      maxTokensAuto: options.settings.maxTokensAuto,
      analysisTimeoutMs: options.analysisTimeoutMs,
      systemPrompt: options.getSystemPrompt(promptProfile, focusMode),
      onDelta: (_deltaText: string, fullText: string) => {
        options.pendingStreamFullText.value = fullText
        options.flushStreamingText(false)
        options.usageText.value = 'AI 正在流式输出...'
      },
    })

    const roundTokenUsage = makeTokenUsageAccumulator()
    const trackRoundTokenUsage = (resp: ChatCompletionResult) => {
      accumulateTokenUsage(roundTokenUsage, resp.usage)
    }

    const sendRequestTracked = createTrackedRequester(sendRequest, trackRoundTokenUsage)

    const initialRequestResult = await sendInitialRequestWithFallback({
      mode,
      userContent,
      useMemoryForThisRound,
      usedCompactContext,
      sendRequestTracked,
      isLikelyPayloadTooLargeError,
      buildCompactContent: () => buildCompactPromptWithLimit(options.buildFullContextPrompt, options.analysisPromptSoftLimit, focusMode),
      notifyRetry: (warningMessage) => options.message.warning(warningMessage),
    })
    let response: ChatCompletionResult = initialRequestResult.response
    usedCompactContext = initialRequestResult.usedCompactContext

    const buildTokenStatsSuffix = () => {
      if (mode !== 'analyze') return ''
      const contextTotal = sumContextTokenUsage(options.conversationTurns.value, contextKey, roundTokenUsage)
      if (roundTokenUsage.requestCount <= 0 && contextTotal.requestCount <= 0) return ''
      return ` | 本轮 ${roundTokenUsage.total}T/${roundTokenUsage.requestCount}次`
        + ` | 累计 ${contextTotal.total}T/${contextTotal.requestCount}次`
    }
    const { updateUsageText, markPostprocess } = createUsageHelpers({
      mode,
      useMemoryForThisRound,
      usedCompactContext,
      promptProfile,
      focusMode,
      selectedNodeFocusEnabled: options.selectedNodeFocusEnabled.value,
      hasEffectiveSelectedNode: !!options.effectiveSelectedNode.value,
      buildTokenStatsSuffix,
      getUsageText: () => options.usageText.value,
      setUsageText: (text) => {
        options.usageText.value = text
      },
      setPostprocessStage: () => {
        options.analyzingStage.value = 'postprocess'
      },
    })
    updateUsageText(response)
    if (mode === 'analyze') {
      options.pendingStreamFullText.value = response.text
      options.flushStreamingText(true)
    }
    const truncationResult = await handleTruncation({
      mode,
      response,
      truncateAutoRetryEnabled: options.settings.truncateAutoRetryEnabled,
      useMemoryForThisRound,
      contextMemory,
      promptProfile,
      focusMode,
      promptSoftLimit: options.analysisPromptSoftLimit,
      buildMemoryPrompt: options.buildMemoryPrompt,
      buildFullContextPrompt: options.buildFullContextPrompt,
      buildConciseRetryPrompt: options.buildConciseRetryPrompt,
      sendRequestTracked,
      updateUsageText,
      setStreamingText: (value) => {
        options.pendingStreamFullText.value = value
      },
      flushStreamingText: options.flushStreamingText,
      appendUsageSuffix: (suffix) => {
        options.usageText.value = `${options.usageText.value}${suffix}`
      },
      notifyWarning: (warningMessage) => {
        options.message.warning(warningMessage)
      },
      waitForUiPaint: options.waitForUiPaint,
    })
    response = truncationResult.response
    const outputTruncated = truncationResult.outputTruncated

    if (mode === 'test') {
      options.resultText.value = response.text
      return
    }

    if (outputTruncated) {
      options.message.warning('模型输出仍被截断，请继续缩小范围或拆分问题后重试。')
    }

    let parsed = tryParseStructuredOutput(response.text)
    parsed = await repairStructuredJsonIfNeeded(parsed, {
      responseText: response.text,
      outputTruncated,
      apiKey: key,
      trackRoundTokenUsage,
      markPostprocess,
      appendUsageNote: options.appendUsageNote,
      waitForUiPaint: options.waitForUiPaint,
      notifyInfo: (infoMessage) => options.message.info(infoMessage),
      notifyWarning: (warningMessage) => options.message.warning(warningMessage),
      notifyRepairFailed: (_tag, error) => {
        console.warn('[AI][structured-repair] failed:', error)
      },
      onUsageTag: (tag) => updateUsageText(response, tag),
      repairStructuredOutput: options.repairStructuredOutput,
    })

    parsed = await repairParentRelationIfNeeded(parsed, {
      outputTruncated,
      apiKey: key,
      selectedTask: options.selectedTask.value,
      trackRoundTokenUsage,
      markPostprocess,
      appendUsageNote: options.appendUsageNote,
      waitForUiPaint: options.waitForUiPaint,
      notifyInfo: (infoMessage) => options.message.info(infoMessage),
      notifyWarning: (warningMessage) => options.message.warning(warningMessage),
      notifyRepairFailed: (_tag, error) => {
        console.warn('[AI][parent-relation-repair] failed:', error)
      },
      onUsageTag: (tag) => updateUsageText(response, tag),
      repairParentRelationConsistency: options.repairParentRelationConsistency,
      detectParentRelationConflict: options.detectParentRelationConflict,
      collectParentRelationFacts: options.collectParentRelationFacts,
    })

    const answerTextRaw = parsed?.answer?.trim() || response.text
    const answerText = sanitizeAnswerForUser(answerTextRaw)
    options.resultText.value = answerText

    if (mode === 'analyze') {
      const nextTurn = getNextConversationTurn(options.conversationTurns.value, contextKey)
      const nextTurnItem = buildConversationTurnItem({
        contextKey,
        nextTurn,
        question: questionSnapshot,
        answer: answerText,
        usedMemory: useMemoryForThisRound,
        roundTokenUsage: roundTokenUsage as TokenUsageAccumulator,
        clipForStorage: options.clipForStorage,
        questionMaxChars: options.conversationQuestionMaxChars,
        answerMaxChars: options.conversationAnswerMaxChars,
      })
      options.conversationTurns.value = appendConversationRound({
        turns: options.conversationTurns.value,
        nextTurnItem,
        maxTurnsPerContext: options.conversationMaxTurns,
        maxTotalTurns: options.conversationMaxTotalTurns,
      })
    }

    if (!options.memoryModeEnabled.value || outputTruncated) return

    const nextMemorySummary = parsed?.memory_update?.trim() || options.buildFallbackMemory(answerText, options.question.value)
    options.memoryStateStore.value = buildNextMemoryStore({
      store: options.memoryStateStore.value,
      contextKey,
      memoryUpdate: nextMemorySummary,
      appendMemorySummary: options.appendMemorySummary,
      maxContexts: options.memoryStoreMaxContexts,
    })
  }

  const handleTest = async () => {
    options.testing.value = true
    try {
      await runRequest('test')
      options.message.success('连接测试成功')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      options.message.error(`连接测试失败: ${msg}`)
    } finally {
      options.testing.value = false
    }
  }

  const handleAnalyze = async () => {
    options.analyzing.value = true
    options.analyzingStage.value = 'streaming'
    try {
      await runRequest('analyze')
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      options.message.error(`AI 分析失败: ${msg}`)
    } finally {
      options.analyzing.value = false
      options.analyzingStage.value = 'idle'
      options.resetAnalyzeTransientState()
    }
  }

  return {
    runRequest,
    handleTest,
    handleAnalyze,
  }
}
