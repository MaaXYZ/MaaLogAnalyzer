import type { BridgeController } from '../../../composables/useBridge'

export interface BridgeOpenCropRequest {
  cachedImageId?: number | null
  dataUrl?: string | null
  taskId?: number | null
  recoId?: number | null
}

interface QueryTaskDocResult {
  task: string
  doc: string
}

interface UseBridgeTaskActionsOptions {
  getBridge: () => BridgeController | null
  getBridgeSessionId: () => string | null
  toTrimmedNonEmptyString: (value: unknown) => string | null
  toPositiveInteger: (value: unknown) => number | null
  toBridgeTaskDocCacheKey: (sessionId: string, task: string) => string
  getBridgeTaskDocFromCache: (key: string) => string | null | undefined
  saveBridgeTaskDocToCache: (key: string, doc: string | null) => void
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export const useBridgeTaskActions = (options: UseBridgeTaskActionsOptions) => {
  const queryBridgeTaskDoc = async (sessionId: string, task: string): Promise<QueryTaskDocResult> => {
    const bridge = options.getBridge()
    if (!bridge?.enabled) {
      throw new Error('Bridge is disabled')
    }
    const result = await bridge.sendRequest('query.taskDoc', {
      sessionId,
      task,
    }, { timeoutMs: 12000 })
    const record = asRecord(result)
    if (!record) {
      throw new Error('Invalid query.taskDoc response')
    }
    return {
      task: options.toTrimmedNonEmptyString(record.task) ?? task,
      doc: typeof record.doc === 'string' ? record.doc : '',
    }
  }

  const bridgeRequestTaskDoc = async (task: string): Promise<string | null> => {
    const sessionId = options.getBridgeSessionId()
    const normalizedTask = options.toTrimmedNonEmptyString(task)
    if (!sessionId || !normalizedTask) return null

    const cacheKey = options.toBridgeTaskDocCacheKey(sessionId, normalizedTask)
    const cached = options.getBridgeTaskDocFromCache(cacheKey)
    if (cached !== undefined) {
      return cached
    }

    const result = await queryBridgeTaskDoc(sessionId, normalizedTask)
    const doc = result.doc.trim()
    const normalizedDoc = doc || null
    options.saveBridgeTaskDocToCache(cacheKey, normalizedDoc)
    return normalizedDoc
  }

  const bridgeRevealTask = async (task: string): Promise<void> => {
    const bridge = options.getBridge()
    const sessionId = options.getBridgeSessionId()
    const normalizedTask = options.toTrimmedNonEmptyString(task)
    if (!sessionId || !normalizedTask || !bridge?.enabled) return
    try {
      await bridge.sendRequest('command.reveal', {
        sessionId,
        task: normalizedTask,
      }, { timeoutMs: 10000 })
    } catch {
      // reveal 按需求静默失败
    }
  }

  const bridgeOpenCrop = async (request: BridgeOpenCropRequest): Promise<void> => {
    const bridge = options.getBridge()
    const sessionId = options.getBridgeSessionId()
    if (!sessionId || !bridge?.enabled) return

    const params: Record<string, unknown> = { sessionId }
    const cachedImageId = options.toPositiveInteger(request.cachedImageId)
    const dataUrl = options.toTrimmedNonEmptyString(request.dataUrl)
    const taskId = options.toPositiveInteger(request.taskId)
    const recoId = options.toPositiveInteger(request.recoId)

    if (cachedImageId != null) {
      params.cachedImageId = cachedImageId
      params.cached_image_id = cachedImageId
    } else if (dataUrl) {
      params.dataUrl = dataUrl
      params.data_url = dataUrl
    } else {
      return
    }

    if (taskId != null) {
      params.taskId = taskId
      params.task_id = taskId
    }
    if (recoId != null) {
      params.recoId = recoId
      params.reco_id = recoId
    }

    try {
      await bridge.sendRequest('command.openCrop', params, { timeoutMs: 12000 })
    } catch {
      // 当前阶段保持静默，后续按 UI 方案再补反馈
    }
  }

  return {
    bridgeRequestTaskDoc,
    bridgeRevealTask,
    bridgeOpenCrop,
  }
}
