import { computed, type Ref, type VNodeRef } from 'vue'
import type { ConversationTurnView, PanelPreviewRefs } from './panelBindingTypes'

export interface UseAiOutputPanelBindingsOptions {
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
  onHandleExportConversation: () => void
}

export const useAiOutputPanelBindings = (options: UseAiOutputPanelBindingsOptions) => {
  const outputPanelProps = computed(() => ({
    usageText: options.usageText.value,
    onErrorPreview: options.onErrorPreview.value,
    anchorPreview: options.anchorPreview.value,
    jumpBackPreview: options.jumpBackPreview.value,
    evidencePanelCollapsed: options.evidencePanelCollapsed.value,
    conversationTurnViews: options.conversationTurnViews.value,
    showStreamingTurn: options.showStreamingTurn.value,
    conversationFollowMode: options.conversationFollowMode.value,
    resultText: options.resultText.value,
    renderedResultHtml: options.renderedResultHtml.value,
    activeRoundQuestion: options.activeRoundQuestion.value,
    streamingAnswerHtml: options.streamingAnswerHtml.value,
    lastRequestUsedMemory: options.lastRequestUsedMemory.value,
    aiOutputScrollbarRef: options.aiOutputScrollbarRef,
    turnListRef: options.turnListRef,
  }))

  const outputPanelHandlers = {
    'update:evidencePanelCollapsed': (value: boolean) => { options.evidencePanelCollapsed.value = value },
    'update:conversationFollowMode': (value: boolean) => { options.conversationFollowMode.value = value },
    exportConversation: () => options.onHandleExportConversation(),
  }

  return {
    outputPanelProps,
    outputPanelHandlers,
  }
}
