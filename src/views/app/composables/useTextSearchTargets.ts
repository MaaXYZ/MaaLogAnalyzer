import { computed, ref, shallowRef } from 'vue'
import { matchPrimaryLogFile, sortLoadedPrimaryLogSegments } from '../../../utils/logFileDiscovery'

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
  const textSearchLoadedTargets = shallowRef<TextSearchLoadedTarget[]>([])
  const textSearchLoadedDefaultTargetId = ref<string>('')
  const deferredTextSearchTargets = shallowRef<DeferredTextSearchTarget[]>([])
  const deferredTextSearchDefaultTargetId = ref<string>('')
  const textSearchTargetsHydrated = ref(false)
  const hasDeferredTextSearchTargets = computed(() => deferredTextSearchTargets.value.length > 0)
  let hydrateTextSearchTargetsToken = 0

  const setTextSearchLoadedTargets = (targets: TextSearchLoadedTarget[], defaultId?: string) => {
    textSearchLoadedTargets.value = targets
    textSearchLoadedDefaultTargetId.value = defaultId ?? targets[0]?.id ?? ''
  }

  const pickPreferredLogTargetId = (targets: TextSearchLoadedTarget[]): string => {
    if (targets.length === 0) return ''

    const primaryTargets = targets
      .map((target) => ({
        target,
        candidate: matchPrimaryLogFile(target.label || target.fileName, target.fileName),
      }))
      .filter(
        (
          entry,
        ): entry is {
          target: TextSearchLoadedTarget
          candidate: NonNullable<ReturnType<typeof matchPrimaryLogFile>>
        } => entry.candidate != null,
      )

    const preferredMain =
      primaryTargets.find(
        (entry) =>
          entry.candidate.kind === 'main' && entry.candidate.normalizedName === 'maafw.log',
      ) ??
      primaryTargets.find(
        (entry) => entry.candidate.kind === 'main' && entry.candidate.normalizedName === 'maa.log',
      )
    if (preferredMain) {
      return preferredMain.target.id
    }

    if (primaryTargets.length > 0) {
      const sortedBakTargets = sortLoadedPrimaryLogSegments(
        primaryTargets.map((entry) => ({
          id: entry.target.id,
          path: entry.target.label || entry.target.fileName,
          name: entry.target.fileName,
          content: entry.target.content,
        })),
      )
      return sortedBakTargets[sortedBakTargets.length - 1]?.id ?? primaryTargets[0].target.id
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
    textSearchTargetsHydrated.value = true
    const deferredTargets = deferredTextSearchTargets.value
    if (deferredTargets.length === 0) {
      setTextSearchLoadedTargets([])
      return
    }

    const hasMain = deferredTargets.some((target) => {
      const candidate = matchPrimaryLogFile(target.label || target.fileName, target.fileName)
      return candidate?.kind === 'main'
    })

    // 纯 bak 分段（无主日志）需要内容参与“最新段”排序，此时才全量物化；
    // 默认内容只保留命中的最新段，其余释放，维持单目标物化策略
    if (!hasMain) {
      const token = ++hydrateTextSearchTargetsToken
      const loaded: TextSearchLoadedTarget[] = []
      for (const target of deferredTargets) {
        try {
          const content = await target.loadContent()
          if (token !== hydrateTextSearchTargetsToken) return
          loaded.push({
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
      const defaultId = pickPreferredLogTargetId(loaded)
      const merged = loaded.map((target) => ({
        ...target,
        content: target.id === defaultId ? target.content : '',
      }))
      setTextSearchLoadedTargets(merged, defaultId)
      return
    }

    const defaultId = deferredTextSearchDefaultTargetId.value || deferredTargets[0]?.id || ''
    if (defaultId) {
      await ensureDeferredTargetContent(defaultId)
    }
  }

  const ensureTextSearchTargetsHydrated = async () => {
    await hydrateDeferredTextSearchTargets()
  }

  // 按需加载单个目标的内容（切换目标 / 原文定位时使用），配合懒加载策略控制内存
  const ensureDeferredTargetContent = async (targetId: string): Promise<void> => {
    const entry = textSearchLoadedTargets.value.find((target) => target.id === targetId)
    if (entry && entry.content) return
    const deferred = deferredTextSearchTargets.value.find((target) => target.id === targetId)
    if (!deferred) return
    const content = await deferred.loadContent()
    const updated = textSearchLoadedTargets.value.map((target) =>
      target.id === targetId ? { ...target, content } : target,
    )
    if (!entry) {
      updated.push({
        id: deferred.id,
        label: deferred.label,
        fileName: deferred.fileName,
        content,
      })
    }
    setTextSearchLoadedTargets(updated, textSearchLoadedDefaultTargetId.value)
  }

  // 原文定位探测：逐个瞬时加载检查是否包含目标行，只保留命中者的内容
  const findDeferredTargetWithContent = async (needle: string): Promise<string | null> => {
    if (!needle) return null
    for (const target of deferredTextSearchTargets.value) {
      try {
        const content = await target.loadContent()
        if (!content.includes(needle)) continue
        await ensureDeferredTargetContent(target.id)
        return target.id
      } catch (error) {
        console.warn('[text-search] probe deferred target failed:', target.id, error)
        continue
      }
    }
    return null
  }

  const setDeferredTextSearchTargets = (
    targets: DeferredTextSearchTarget[],
    defaultId?: string,
  ) => {
    hydrateTextSearchTargetsToken++
    deferredTextSearchTargets.value = targets
    // 默认目标优先按文件名识别主日志（无需加载内容）；
    // 纯 bak 分段时先取第一段，hydrate 时再按内容选最新段
    const hasMain = targets.some((target) => {
      const candidate = matchPrimaryLogFile(target.label || target.fileName, target.fileName)
      return candidate?.kind === 'main'
    })
    let resolvedDefault = defaultId ?? ''
    if (!resolvedDefault && targets.length > 0) {
      if (hasMain) {
        const preferredMain =
          targets.find((target) => {
            const candidate = matchPrimaryLogFile(target.label || target.fileName, target.fileName)
            return candidate?.normalizedName === 'maafw.log'
          }) ??
          targets.find((target) => {
            const candidate = matchPrimaryLogFile(target.label || target.fileName, target.fileName)
            return candidate?.normalizedName === 'maa.log'
          }) ??
          targets[0]
        resolvedDefault = preferredMain.id
      } else {
        resolvedDefault = targets[0].id
      }
    }
    deferredTextSearchDefaultTargetId.value = resolvedDefault
    textSearchTargetsHydrated.value = false
    // 立即物化元数据（content 留空按需加载）。
    // 不能把 loadedTargets 短暂清成空数组——那会让 watchTargetsSync 误判“无目标”而回退手动模式
    setTextSearchLoadedTargets(
      targets.map((target) => ({
        id: target.id,
        label: target.label,
        fileName: target.fileName,
        content: '',
      })),
      resolvedDefault,
    )
  }

  return {
    textSearchLoadedTargets,
    textSearchLoadedDefaultTargetId,
    hasDeferredTextSearchTargets,
    setTextSearchLoadedTargets,
    pickPreferredLogTargetId,
    clearDeferredTextSearchTargets,
    ensureTextSearchTargetsHydrated,
    ensureDeferredTargetContent,
    findDeferredTargetWithContent,
    setDeferredTextSearchTargets,
  }
}
