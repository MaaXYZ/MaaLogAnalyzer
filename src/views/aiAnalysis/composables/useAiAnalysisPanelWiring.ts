import { computed, type Ref, type VNodeRef } from 'vue'
import type { AiSettings } from '../../../utils/aiSettings'
import type { MemoryState } from '../types'
import type { QuickPromptItem } from './useAiViewState'
import type { ConversationTurnView, PanelPreviewRefs } from './panelBindingTypes'
import { useAiPanelBindings } from './useAiPanelBindings'

interface UseAiAnalysisPanelWiringOptions {
  apiKey: Ref<string>
  showApiKeyHint: Ref<boolean>
  globalSettingsCollapsed: Ref<boolean>
  testing: Ref<boolean>
  analyzing: Ref<boolean>
  question: Ref<string>
  settings: AiSettings
  memoryModeEnabled: Ref<boolean>
  memoryApplicable: Ref<boolean>
  memoryStatusText: Ref<string>
  selectedTaskTitle: Ref<string>
  sourceLabel: Ref<string>
  selectedNodeFocusDetail: Ref<string>
  currentMemoryState: Ref<MemoryState | null>
  currentMemoryPreview: Ref<string>
  quickPrompts: QuickPromptItem[]
  usageText: Ref<string>
  onErrorPreview: PanelPreviewRefs['onErrorPreview']
  anchorPreview: PanelPreviewRefs['anchorPreview']
  jumpBackPreview: PanelPreviewRefs['jumpBackPreview']
  evidencePanelCollapsed: Ref<boolean>
  conversationTurnViews: Ref<ConversationTurnView[]>
  showStreamingTurn: Ref<boolean>
  conversationFollowMode: Ref<boolean>
  resultText: Ref<string>
  renderedResultHtml: Ref<string>
  activeRoundQuestion: Ref<string>
  streamingAnswerHtml: Ref<string>
  lastRequestUsedMemory: Ref<boolean>
  aiOutputScrollbarRef: VNodeRef
  turnListRef: VNodeRef
  memoryDialogVisible: Ref<boolean>
  onHandleTest: () => void
  onClearApiKey: () => void
  onClearCurrentTaskMemory: () => void
  onClearMemory: () => void
  onHandleApplyQuickPrompt: (index: number) => void
  onHandleAnalyze: () => void
  onHandleExportConversation: () => void
}

export const useAiAnalysisPanelWiring = (options: UseAiAnalysisPanelWiringOptions) => {
  return useAiPanelBindings({
    apiKey: options.apiKey,
    showApiKeyHint: options.showApiKeyHint,
    globalSettingsCollapsed: options.globalSettingsCollapsed,
    testing: options.testing,
    analyzing: options.analyzing,
    question: options.question,
    settings: options.settings,
    memoryModeEnabled: options.memoryModeEnabled,
    memoryApplicable: options.memoryApplicable,
    memoryStatusText: options.memoryStatusText,
    selectedTaskTitle: options.selectedTaskTitle,
    sourceLabel: options.sourceLabel,
    selectedNodeFocusDetail: options.selectedNodeFocusDetail,
    currentMemoryTurns: computed(() => options.currentMemoryState.value?.turns ?? null),
    currentMemoryPreview: options.currentMemoryPreview,
    quickPrompts: options.quickPrompts,
    usageText: options.usageText,
    onErrorPreview: options.onErrorPreview,
    anchorPreview: options.anchorPreview,
    jumpBackPreview: options.jumpBackPreview,
    evidencePanelCollapsed: options.evidencePanelCollapsed,
    conversationTurnViews: options.conversationTurnViews,
    showStreamingTurn: options.showStreamingTurn,
    conversationFollowMode: options.conversationFollowMode,
    resultText: options.resultText,
    renderedResultHtml: options.renderedResultHtml,
    activeRoundQuestion: options.activeRoundQuestion,
    streamingAnswerHtml: options.streamingAnswerHtml,
    lastRequestUsedMemory: options.lastRequestUsedMemory,
    aiOutputScrollbarRef: options.aiOutputScrollbarRef,
    turnListRef: options.turnListRef,
    onHandleTest: options.onHandleTest,
    onClearApiKey: options.onClearApiKey,
    onClearCurrentTaskMemory: options.onClearCurrentTaskMemory,
    onClearMemory: options.onClearMemory,
    onOpenMemory: () => { options.memoryDialogVisible.value = true },
    onHandleApplyQuickPrompt: options.onHandleApplyQuickPrompt,
    onHandleAnalyze: options.onHandleAnalyze,
    onHandleExportConversation: options.onHandleExportConversation,
  })
}
