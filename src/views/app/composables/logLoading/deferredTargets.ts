import type {
  DeferredTextSearchTarget,
  TextSearchLoadedTarget,
} from '../useTextSearchTargets'

export const toDeferredTargetsFromLoadedTargets = (
  targets: TextSearchLoadedTarget[],
): DeferredTextSearchTarget[] => {
  return targets.map((target) => ({
    id: target.id,
    label: target.label,
    fileName: target.fileName,
    loadContent: async () => target.content,
  }))
}

export const createFallbackDeferredTargets = (
  content: string,
): DeferredTextSearchTarget[] => {
  return [{
    id: 'loaded:fallback',
    label: '已加载日志',
    fileName: 'loaded.log',
    loadContent: async () => content,
  }]
}

export const resolveDeferredTargets = (
  content: string,
  loadedTargets?: TextSearchLoadedTarget[],
  deferredTargets?: DeferredTextSearchTarget[],
): DeferredTextSearchTarget[] => {
  if (deferredTargets && deferredTargets.length > 0) {
    return deferredTargets
  }
  if (loadedTargets && loadedTargets.length > 0) {
    return toDeferredTargetsFromLoadedTargets(loadedTargets)
  }
  return createFallbackDeferredTargets(content)
}
