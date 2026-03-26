import type { Ref } from 'vue'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { AiSettings } from '../../../utils/aiSettings'
import {
  appendMemorySummary,
  clipForStorage,
  CONVERSATION_ANSWER_MAX_CHARS,
  CONVERSATION_MAX_TOTAL_TURNS,
  CONVERSATION_MAX_TURNS,
  CONVERSATION_QUESTION_MAX_CHARS,
  MEMORY_STORE_MAX_CONTEXTS,
} from '../utils/sessionStore'
import { buildFallbackMemory } from '../utils/contextPrompt'
import { collectParentRelationFacts, detectParentRelationConflict } from '../utils/parentRelation'
import { useAiPromptRuntime } from './useAiPromptRuntime'
import { useAiRepairBridge } from './useAiRepairBridge'
import { useAiRequestRunner } from './useAiRequestRunner'
import type {
  AnalysisFocusMode,
  AnalysisPromptProfile,
  ConversationTurn,
  MemoryStateStore,
} from '../types'

interface UseAiRunnerOrchestrationOptions {
  apiKey: Ref<string>
  question: Ref<string>
  settings: AiSettings
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  loadedTargets: Ref<AiLoadedTarget[]>
  loadedDefaultTargetId: Ref<string>
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
  effectiveSelectedFlowItemId: Ref<string | null>
  analyzing: Ref<boolean>
  testing: Ref<boolean>
  resetAnalyzeTransientState: () => void
  appendUsageNote: (note: string) => void
  flushStreamingText: (force: boolean) => void
  waitForUiPaint: () => Promise<void>
  message: {
    warning: (content: string) => void
    info: (content: string) => void
    success: (content: string) => void
    error: (content: string) => void
  }
}

export const useAiRunnerOrchestration = (options: UseAiRunnerOrchestrationOptions) => {
  const {
    analysisPromptSoftLimit,
    analysisTimeoutMs,
    shouldUseDiagnosticTemplateForQuestion,
    buildConciseRetryPrompt,
    getSystemPrompt,
    buildFullContextPrompt,
    buildMemoryPrompt,
  } = useAiPromptRuntime({
    settings: options.settings,
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    question: options.question,
    loadedTargets: options.loadedTargets,
    loadedDefaultTargetId: options.loadedDefaultTargetId,
    effectiveSelectedNode: options.effectiveSelectedNode,
    effectiveSelectedFlowItemId: options.effectiveSelectedFlowItemId,
  })

  const {
    repairStructuredOutput,
    repairParentRelationConsistency,
  } = useAiRepairBridge({ settings: options.settings })

  const { handleTest, handleAnalyze } = useAiRequestRunner({
    apiKey: options.apiKey,
    question: options.question,
    settings: options.settings,
    selectedTask: options.selectedTask,
    loadedTargets: options.loadedTargets,
    hasDeferredLoadedTargets: options.hasDeferredLoadedTargets,
    ensureLoadedTargets: options.ensureLoadedTargets,
    currentContextKey: options.currentContextKey,
    memoryStateStore: options.memoryStateStore,
    memoryModeEnabled: options.memoryModeEnabled,
    conversationTurns: options.conversationTurns,
    quickPromptProfileOverride: options.quickPromptProfileOverride,
    quickPromptFocusOverride: options.quickPromptFocusOverride,
    activeRoundQuestion: options.activeRoundQuestion,
    usageText: options.usageText,
    analyzingStage: options.analyzingStage,
    pendingStreamFullText: options.pendingStreamFullText,
    resultText: options.resultText,
    lastRequestUsedMemory: options.lastRequestUsedMemory,
    selectedNodeFocusEnabled: options.selectedNodeFocusEnabled,
    effectiveSelectedNode: options.effectiveSelectedNode,
    analyzing: options.analyzing,
    testing: options.testing,
    analysisPromptSoftLimit,
    analysisTimeoutMs,
    conversationQuestionMaxChars: CONVERSATION_QUESTION_MAX_CHARS,
    conversationAnswerMaxChars: CONVERSATION_ANSWER_MAX_CHARS,
    conversationMaxTurns: CONVERSATION_MAX_TURNS,
    conversationMaxTotalTurns: CONVERSATION_MAX_TOTAL_TURNS,
    memoryStoreMaxContexts: MEMORY_STORE_MAX_CONTEXTS,
    shouldUseDiagnosticTemplateForQuestion,
    buildMemoryPrompt,
    buildFullContextPrompt,
    getSystemPrompt,
    buildConciseRetryPrompt,
    resetAnalyzeTransientState: options.resetAnalyzeTransientState,
    appendUsageNote: options.appendUsageNote,
    flushStreamingText: options.flushStreamingText,
    waitForUiPaint: options.waitForUiPaint,
    clipForStorage,
    appendMemorySummary,
    buildFallbackMemory,
    repairStructuredOutput,
    repairParentRelationConsistency,
    detectParentRelationConflict,
    collectParentRelationFacts,
    message: options.message,
  })

  return {
    handleTest,
    handleAnalyze,
  }
}
