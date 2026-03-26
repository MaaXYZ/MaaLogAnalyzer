import { computed, type Ref } from 'vue'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../../types'
import { setSessionApiKey, type AiSettings } from '../../../utils/aiSettings'
import type { AnalysisFocusMode } from '../types'
import { useAiMemoryState } from './useAiMemoryState'
import { useAiRuntimeUiHelpers } from './useAiRuntimeUiHelpers'
import { useAiSettingsSync } from './useAiSettingsSync'
import { useAiViewState } from './useAiViewState'
import { useConversationView } from './useConversationView'
import { useDiagnosticsPreview } from './useDiagnosticsPreview'

interface UseAiAnalysisStateWiringOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  loadedTargets: Ref<AiLoadedTarget[]>
  loadedDefaultTargetId: Ref<string>
  settings: AiSettings
  apiKey: Ref<string>
  question: Ref<string>
  quickPromptProfileOverride: Ref<'diagnostic' | 'followup' | null>
  quickPromptFocusOverride: Ref<AnalysisFocusMode | null>
  analyzing: Ref<boolean>
  analyzingStage: Ref<'idle' | 'streaming' | 'postprocess'>
  streamingRenderText: Ref<string>
  pendingStreamFullText: Ref<string>
  clearStreamFlushTimer: () => void
  activeRoundQuestion: Ref<string>
  usageText: Ref<string>
  resultText: Ref<string>
  message: {
    warning: (content: string) => void
    info: (content: string) => void
    success: (content: string) => void
    error: (content: string) => void
  }
}

export const useAiAnalysisStateWiring = (options: UseAiAnalysisStateWiringOptions) => {
  const {
    selectedTaskTitle,
    sourceLabel,
    selectedNodeFocusEnabled,
    effectiveSelectedNode,
    effectiveSelectedFlowItemId,
    selectedNodeFocusDetail,
    currentContextKey,
    quickPrompts,
    handleApplyQuickPrompt,
  } = useAiViewState({
    tasks: options.tasks,
    selectedTask: options.selectedTask,
    selectedNode: options.selectedNode,
    selectedFlowItemId: options.selectedFlowItemId,
    loadedTargets: options.loadedTargets,
    loadedDefaultTargetId: options.loadedDefaultTargetId,
    includeSelectedNodeFocus: computed(() => options.settings.includeSelectedNodeFocus),
    question: options.question,
    quickPromptProfileOverride: options.quickPromptProfileOverride,
    quickPromptFocusOverride: options.quickPromptFocusOverride,
  })

  const { clearApiKey } = useAiSettingsSync({
    apiKey: options.apiKey,
    settings: options.settings,
    clearSessionApiKey: () => setSessionApiKey(''),
    message: options.message,
  })

  const {
    resetAnalyzeTransientState,
    waitForUiPaint,
    appendUsageNote,
  } = useAiRuntimeUiHelpers({
    resultText: options.resultText,
    activeRoundQuestion: options.activeRoundQuestion,
    pendingStreamFullText: options.pendingStreamFullText,
    streamingRenderText: options.streamingRenderText,
    usageText: options.usageText,
    clearStreamFlushTimer: options.clearStreamFlushTimer,
  })

  const {
    memoryModeEnabled,
    memoryStateStore,
    conversationTurns,
    lastRequestUsedMemory,
    currentMemoryState,
    currentMemoryFull,
    currentMemoryPreview,
    memoryApplicable,
    memoryStatusText,
    clearMemory,
    clearCurrentTaskMemory,
  } = useAiMemoryState({
    currentContextKey,
    resetAnalyzeTransientState,
    message: options.message,
  })

  const conversationView = useConversationView({
    analyzing: options.analyzing,
    analyzingStage: options.analyzingStage,
    streamingRenderText: options.streamingRenderText,
    activeRoundQuestion: options.activeRoundQuestion,
    conversationTurns,
    currentContextKey,
    selectedTask: options.selectedTask,
    selectedTaskTitle,
    sourceLabel,
    resultText: options.resultText,
    message: options.message,
  })

  const {
    conversationFollowMode,
    renderedResultHtml,
    streamingAnswerHtml,
    showStreamingTurn,
    conversationTurnViews,
    handleExportConversation,
  } = conversationView

  const { onErrorPreview, anchorPreview, jumpBackPreview } = useDiagnosticsPreview(options.selectedTask)

  return {
    selectedTaskTitle,
    sourceLabel,
    selectedNodeFocusEnabled,
    effectiveSelectedNode,
    effectiveSelectedFlowItemId,
    selectedNodeFocusDetail,
    currentContextKey,
    quickPrompts,
    handleApplyQuickPrompt,
    clearApiKey,
    resetAnalyzeTransientState,
    waitForUiPaint,
    appendUsageNote,
    memoryModeEnabled,
    memoryStateStore,
    conversationTurns,
    lastRequestUsedMemory,
    currentMemoryState,
    currentMemoryFull,
    currentMemoryPreview,
    memoryApplicable,
    memoryStatusText,
    clearMemory,
    clearCurrentTaskMemory,
    conversationView,
    conversationFollowMode,
    renderedResultHtml,
    streamingAnswerHtml,
    showStreamingTurn,
    conversationTurnViews,
    handleExportConversation,
    onErrorPreview,
    anchorPreview,
    jumpBackPreview,
  }
}
