import { onBeforeUnmount, ref } from 'vue'

export const useStreamingRenderText = (delayMs = 120) => {
  const streamingRenderText = ref('')
  const pendingStreamFullText = ref('')
  const streamFlushTimer = ref<number | null>(null)

  const clearStreamFlushTimer = () => {
    if (streamFlushTimer.value != null) {
      window.clearTimeout(streamFlushTimer.value)
      streamFlushTimer.value = null
    }
  }

  const flushStreamingText = (force = false) => {
    if (!force && streamFlushTimer.value != null) return
    const doFlush = () => {
      streamingRenderText.value = pendingStreamFullText.value
      streamFlushTimer.value = null
    }
    if (force) {
      clearStreamFlushTimer()
      doFlush()
      return
    }
    streamFlushTimer.value = window.setTimeout(doFlush, delayMs)
  }

  onBeforeUnmount(() => {
    clearStreamFlushTimer()
  })

  return {
    streamingRenderText,
    pendingStreamFullText,
    clearStreamFlushTimer,
    flushStreamingText,
  }
}
