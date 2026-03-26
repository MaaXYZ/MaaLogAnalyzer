import { nextTick, type Ref } from 'vue'

interface UseAiRuntimeUiHelpersOptions {
  resultText: Ref<string>
  activeRoundQuestion: Ref<string>
  pendingStreamFullText: Ref<string>
  streamingRenderText: Ref<string>
  usageText: Ref<string>
  clearStreamFlushTimer: () => void
}

export const useAiRuntimeUiHelpers = (options: UseAiRuntimeUiHelpersOptions) => {
  const resetAnalyzeTransientState = () => {
    options.resultText.value = ''
    options.activeRoundQuestion.value = ''
    options.pendingStreamFullText.value = ''
    options.streamingRenderText.value = ''
    options.clearStreamFlushTimer()
  }

  const waitForUiPaint = async () => {
    await nextTick()
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
  }

  const appendUsageNote = (note: string) => {
    const text = note.trim()
    if (!text) return
    if (options.usageText.value.includes(text)) return
    options.usageText.value = options.usageText.value
      ? `${options.usageText.value} | ${text}`
      : text
  }

  return {
    resetAnalyzeTransientState,
    waitForUiPaint,
    appendUsageNote,
  }
}
