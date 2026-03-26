import type { Ref } from 'vue'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { AiSettings } from '../../../utils/aiSettings'
import type {
  AnalysisFocusMode,
  AnalysisPromptProfile,
  ConversationTurn,
  MemoryStateStore,
} from '../types'
import { useAiRunnerOrchestration } from './useAiRunnerOrchestration'

interface UseAiAnalysisRunnerWiringOptions {
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

export const useAiAnalysisRunnerWiring = (options: UseAiAnalysisRunnerWiringOptions) => {
  return useAiRunnerOrchestration({
    apiKey: options.apiKey,
    question: options.question,
    settings: options.settings,
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    loadedTargets: options.loadedTargets,
    loadedDefaultTargetId: options.loadedDefaultTargetId,
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
    effectiveSelectedFlowItemId: options.effectiveSelectedFlowItemId,
    analyzing: options.analyzing,
    testing: options.testing,
    resetAnalyzeTransientState: options.resetAnalyzeTransientState,
    appendUsageNote: options.appendUsageNote,
    flushStreamingText: options.flushStreamingText,
    waitForUiPaint: options.waitForUiPaint,
    message: options.message,
  })
}
