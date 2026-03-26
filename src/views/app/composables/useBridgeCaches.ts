const BRIDGE_IMAGE_CACHE_MAX_ITEMS = 50
const BRIDGE_TASK_DOC_CACHE_MAX_ITEMS = 80

export const useBridgeCaches = () => {
  const bridgeImageDataUrlCache = new Map<string, string>()
  const bridgeTaskDocCache = new Map<string, string | null>()

  const toBridgeImageCacheKey = (sessionId: string, taskId: number, imageRefId: number): string => {
    return `${sessionId}:${taskId}:${imageRefId}`
  }

  const toBridgeTaskDocCacheKey = (sessionId: string, task: string): string => {
    return `${sessionId}:${task}`
  }

  const clearBridgeImageCache = () => {
    bridgeImageDataUrlCache.clear()
  }

  const clearBridgeTaskDocCache = () => {
    bridgeTaskDocCache.clear()
  }

  const getBridgeImageFromCache = (key: string): string | null => {
    const cached = bridgeImageDataUrlCache.get(key)
    if (!cached) return null
    bridgeImageDataUrlCache.delete(key)
    bridgeImageDataUrlCache.set(key, cached)
    return cached
  }

  const getBridgeTaskDocFromCache = (key: string): string | null | undefined => {
    if (!bridgeTaskDocCache.has(key)) return undefined
    const cached = bridgeTaskDocCache.get(key)
    bridgeTaskDocCache.delete(key)
    bridgeTaskDocCache.set(key, cached ?? null)
    return cached ?? null
  }

  const saveBridgeImageToCache = (key: string, dataUrl: string) => {
    if (!dataUrl) return
    if (bridgeImageDataUrlCache.has(key)) {
      bridgeImageDataUrlCache.delete(key)
    }
    bridgeImageDataUrlCache.set(key, dataUrl)

    while (bridgeImageDataUrlCache.size > BRIDGE_IMAGE_CACHE_MAX_ITEMS) {
      const oldestKey = bridgeImageDataUrlCache.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      bridgeImageDataUrlCache.delete(oldestKey)
    }
  }

  const saveBridgeTaskDocToCache = (key: string, doc: string | null) => {
    if (bridgeTaskDocCache.has(key)) {
      bridgeTaskDocCache.delete(key)
    }
    bridgeTaskDocCache.set(key, doc)

    while (bridgeTaskDocCache.size > BRIDGE_TASK_DOC_CACHE_MAX_ITEMS) {
      const oldestKey = bridgeTaskDocCache.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      bridgeTaskDocCache.delete(oldestKey)
    }
  }

  return {
    toBridgeImageCacheKey,
    toBridgeTaskDocCacheKey,
    clearBridgeImageCache,
    clearBridgeTaskDocCache,
    getBridgeImageFromCache,
    getBridgeTaskDocFromCache,
    saveBridgeImageToCache,
    saveBridgeTaskDocToCache,
  }
}
