import { computed, ref, watch, type Ref } from 'vue'
import type { ConversationTurn, MemoryState, MemoryStateStore } from '../types'
import {
  loadSessionConversationTurns,
  loadSessionMemoryStateStore,
  saveSessionConversationTurns,
  saveSessionMemoryStateStore,
} from '../utils/sessionStore'

interface UseAiMemoryStateOptions {
  currentContextKey: Ref<string>
  resetAnalyzeTransientState: () => void
  message: {
    success: (content: string) => void
  }
}

export const useAiMemoryState = (options: UseAiMemoryStateOptions) => {
  const memoryModeEnabled = ref(true)
  const memoryStateStore = ref<MemoryStateStore>(loadSessionMemoryStateStore())
  const conversationTurns = ref<ConversationTurn[]>(loadSessionConversationTurns())
  const lastRequestUsedMemory = ref(false)

  watch(memoryStateStore, (value) => {
    saveSessionMemoryStateStore(value)
  }, { deep: true })

  watch(conversationTurns, (value) => {
    saveSessionConversationTurns(value)
  }, { deep: true })

  const currentMemoryState = computed<MemoryState | null>(() => (
    memoryStateStore.value[options.currentContextKey.value] ?? null
  ))

  const currentMemoryFull = computed(() => {
    const summary = currentMemoryState.value?.summary?.trim() ?? ''
    if (!summary) return '当前任务暂无记忆，可先发起一轮分析。'
    return summary
  })

  const currentMemoryPreview = computed(() => {
    const summary = currentMemoryState.value?.summary?.trim() ?? ''
    if (!summary) return '当前任务暂无记忆，可先发起一轮分析。'
    const blocks = summary.split(/\n{2,}/).filter(Boolean)
    const latest = blocks.length ? blocks[blocks.length - 1] : summary
    const oneLine = latest.replace(/\s+/g, ' ').trim()
    if (oneLine.length <= 84) return oneLine
    return `${oneLine.slice(0, 84)}...`
  })

  const memoryApplicable = computed(() => {
    if (!memoryModeEnabled.value) return false
    return !!currentMemoryState.value
  })

  const memoryStatusText = computed(() => {
    if (!memoryModeEnabled.value) return '记忆模式：关闭'
    const current = currentMemoryState.value
    if (current) return `记忆模式：可复用（${current.turns} 轮）`
    const cachedCount = Object.keys(memoryStateStore.value).length
    if (!cachedCount) return '记忆模式：未建立'
    return `记忆模式：当前任务未建立（已缓存 ${cachedCount} 组）`
  })

  const clearMemory = () => {
    memoryStateStore.value = {}
    saveSessionMemoryStateStore({})
    conversationTurns.value = []
    saveSessionConversationTurns([])
    lastRequestUsedMemory.value = false
    options.resetAnalyzeTransientState()
    options.message.success('已清空上下文记忆与多轮对话')
  }

  const clearCurrentTaskMemory = () => {
    const contextKey = options.currentContextKey.value
    if (!contextKey) return

    const nextStore = { ...memoryStateStore.value }
    delete nextStore[contextKey]
    memoryStateStore.value = nextStore

    conversationTurns.value = conversationTurns.value.filter(item => item.contextKey !== contextKey)
    lastRequestUsedMemory.value = false
    options.resetAnalyzeTransientState()
    options.message.success('已清空当前任务上下文记忆与对话')
  }

  return {
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
  }
}
