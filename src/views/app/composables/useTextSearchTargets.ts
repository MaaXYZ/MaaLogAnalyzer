import { computed, ref } from 'vue'

export interface TextSearchLoadedTarget {
  id: string
  label: string
  fileName: string
  content: string
}

export interface DeferredTextSearchTarget {
  id: string
  label: string
  fileName: string
  loadContent: () => Promise<string>
}

export const useTextSearchTargets = () => {
  const textSearchLoadedTargets = ref<TextSearchLoadedTarget[]>([])
  const textSearchLoadedDefaultTargetId = ref<string>('')
  const deferredTextSearchTargets = ref<DeferredTextSearchTarget[]>([])
  const deferredTextSearchDefaultTargetId = ref<string>('')
  const textSearchTargetsHydrated = ref(false)
  const hasDeferredTextSearchTargets = computed(() => deferredTextSearchTargets.value.length > 0)
  let hydrateTextSearchTargetsToken = 0

  const setTextSearchLoadedTargets = (targets: TextSearchLoadedTarget[], defaultId?: string) => {
    textSearchLoadedTargets.value = targets
    textSearchLoadedDefaultTargetId.value = defaultId ?? (targets[0]?.id ?? '')
  }

  const pickPreferredLogTargetId = (targets: TextSearchLoadedTarget[]): string => {
    if (targets.length === 0) return ''
    const normalize = (name: string) => name.toLowerCase()
    const priority = ['maafw.log', 'maa.log', 'maafw.bak.log', 'maa.bak.log']
    for (const key of priority) {
      const hit = targets.find(
        (t) => normalize(t.fileName || '').endsWith(key) || normalize(t.label || '').endsWith(key),
      )
      if (hit) return hit.id
    }
    return targets[0].id
  }

  const clearDeferredTextSearchTargets = () => {
    deferredTextSearchTargets.value = []
    deferredTextSearchDefaultTargetId.value = ''
    textSearchTargetsHydrated.value = false
  }

  const hydrateDeferredTextSearchTargets = async () => {
    if (textSearchTargetsHydrated.value) return
    const deferredTargets = deferredTextSearchTargets.value
    if (deferredTargets.length === 0) {
      textSearchTargetsHydrated.value = true
      setTextSearchLoadedTargets([])
      return
    }

    const token = ++hydrateTextSearchTargetsToken
    const loadedTargets: TextSearchLoadedTarget[] = []
    for (const target of deferredTargets) {
      try {
        const content = await target.loadContent()
        if (token !== hydrateTextSearchTargetsToken) return
        loadedTargets.push({
          id: target.id,
          label: target.label,
          fileName: target.fileName,
          content,
        })
      } catch (error) {
        console.warn('[text-search] load deferred target failed:', target.id, error)
      }
    }
    if (token !== hydrateTextSearchTargetsToken) return

    const defaultId = deferredTextSearchDefaultTargetId.value && loadedTargets.some((target) => target.id === deferredTextSearchDefaultTargetId.value)
      ? deferredTextSearchDefaultTargetId.value
      : pickPreferredLogTargetId(loadedTargets)
    setTextSearchLoadedTargets(loadedTargets, defaultId)
    textSearchTargetsHydrated.value = true
  }

  const ensureTextSearchTargetsHydrated = async () => {
    await hydrateDeferredTextSearchTargets()
  }

  const setDeferredTextSearchTargets = (targets: DeferredTextSearchTarget[], defaultId?: string) => {
    hydrateTextSearchTargetsToken++
    deferredTextSearchTargets.value = targets
    deferredTextSearchDefaultTargetId.value = defaultId ?? (targets[0]?.id ?? '')
    textSearchTargetsHydrated.value = false
    setTextSearchLoadedTargets([])
  }

  return {
    textSearchLoadedTargets,
    textSearchLoadedDefaultTargetId,
    hasDeferredTextSearchTargets,
    setTextSearchLoadedTargets,
    pickPreferredLogTargetId,
    clearDeferredTextSearchTargets,
    ensureTextSearchTargetsHydrated,
    setDeferredTextSearchTargets,
  }
}
