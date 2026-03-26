import { computed, type Ref } from 'vue'
import type { AiSettings } from '../../../utils/aiSettings'
import type { QuickPromptItem } from './useAiViewState'

export interface UseAiInputPanelBindingsOptions {
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
  currentMemoryTurns: Ref<number | null>
  currentMemoryPreview: Ref<string>
  quickPrompts: QuickPromptItem[]
  onHandleTest: () => void
  onClearApiKey: () => void
  onClearCurrentTaskMemory: () => void
  onClearMemory: () => void
  onOpenMemory: () => void
  onHandleApplyQuickPrompt: (index: number) => void
  onHandleAnalyze: () => void
}

export const useAiInputPanelBindings = (options: UseAiInputPanelBindingsOptions) => {
  const inputPanelProps = computed(() => ({
    apiKey: options.apiKey.value,
    showApiKeyHint: options.showApiKeyHint.value,
    globalSettingsCollapsed: options.globalSettingsCollapsed.value,
    testing: options.testing.value,
    analyzing: options.analyzing.value,
    question: options.question.value,
    model: options.settings.model,
    maxTokens: options.settings.maxTokens,
    streamResponse: options.settings.streamResponse,
    baseUrl: options.settings.baseUrl,
    temperature: options.settings.temperature,
    maxTokensAuto: options.settings.maxTokensAuto,
    includeKnowledgePack: options.settings.includeKnowledgePack,
    knowledgeBootstrap: options.settings.knowledgeBootstrap,
    includeSignalLines: options.settings.includeSignalLines,
    includeSelectedNodeFocus: options.settings.includeSelectedNodeFocus,
    truncateAutoRetryEnabled: options.settings.truncateAutoRetryEnabled,
    conciseAnswerMaxChars: options.settings.conciseAnswerMaxChars,
    memoryModeEnabled: options.memoryModeEnabled.value,
    memoryApplicable: options.memoryApplicable.value,
    memoryStatusText: options.memoryStatusText.value,
    selectedTaskTitle: options.selectedTaskTitle.value,
    sourceLabel: options.sourceLabel.value,
    selectedNodeFocusDetail: options.selectedNodeFocusDetail.value,
    currentMemoryTurns: options.currentMemoryTurns.value,
    currentMemoryPreview: options.currentMemoryPreview.value,
    quickPrompts: options.quickPrompts,
  }))

  const inputPanelHandlers = {
    'update:apiKey': (value: string) => { options.apiKey.value = value },
    'update:showApiKeyHint': (value: boolean) => { options.showApiKeyHint.value = value },
    'update:globalSettingsCollapsed': (value: boolean) => { options.globalSettingsCollapsed.value = value },
    'update:memoryModeEnabled': (value: boolean) => { options.memoryModeEnabled.value = value },
    'update:includeSelectedNodeFocus': (value: boolean) => { options.settings.includeSelectedNodeFocus = value },
    'update:knowledgeBootstrap': (value: boolean) => { options.settings.knowledgeBootstrap = value },
    'update:question': (value: string) => { options.question.value = value },
    test: () => options.onHandleTest(),
    clearApiKey: () => options.onClearApiKey(),
    clearCurrentTaskMemory: () => options.onClearCurrentTaskMemory(),
    clearMemory: () => options.onClearMemory(),
    openMemory: () => options.onOpenMemory(),
    applyQuickPrompt: (index: number) => options.onHandleApplyQuickPrompt(index),
    analyze: () => options.onHandleAnalyze(),
  }

  return {
    inputPanelProps,
    inputPanelHandlers,
  }
}
