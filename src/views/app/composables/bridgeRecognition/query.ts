import type { BridgeController } from '../../../../composables/useBridge'
import { toImageDataUrl } from '../../utils/bridgeImageParsing'

export type QueryDetailTarget = 'reco' | 'action' | 'cached_image'

export interface QueryDetailParams {
  sessionId: string
  target: QueryDetailTarget
  id: number
  taskId?: number
  task_id?: number
}

export interface QueryDetailResult {
  target: QueryDetailTarget
  id: number
  data: unknown
}

interface CreateBridgeRecognitionQueryOptions {
  getBridge: () => BridgeController | null
  asRecord: (value: unknown) => Record<string, unknown> | null
  toPositiveInteger: (value: unknown) => number | null
  toBridgeImageCacheKey: (sessionId: string, taskId: number, imageRefId: number) => string
  getBridgeImageFromCache: (key: string) => string | null
  saveBridgeImageToCache: (key: string, dataUrl: string) => void
}

export const createBridgeRecognitionQuery = (
  options: CreateBridgeRecognitionQueryOptions,
) => {
  const queryBridgeDetail = async (params: QueryDetailParams): Promise<QueryDetailResult> => {
    const bridge = options.getBridge()
    if (!bridge?.enabled) {
      throw new Error('Bridge is disabled')
    }
    const result = await bridge.sendRequest('query.detail', params, { timeoutMs: 12000 })
    const record = options.asRecord(result)
    if (!record) {
      throw new Error('Invalid query.detail response')
    }

    const target = record.target
    if (target !== 'reco' && target !== 'action' && target !== 'cached_image') {
      throw new Error('Invalid query.detail target')
    }

    const id = options.toPositiveInteger(record.id) ?? params.id
    return {
      target,
      id,
      data: record.data,
    }
  }

  const loadCachedImageDataUrl = async (
    sessionId: string,
    taskId: number,
    imageRefId: number,
  ): Promise<string | null> => {
    const cacheKey = options.toBridgeImageCacheKey(sessionId, taskId, imageRefId)
    const cached = options.getBridgeImageFromCache(cacheKey)
    if (cached) return cached

    const result = await queryBridgeDetail({
      sessionId,
      target: 'cached_image',
      id: imageRefId,
      taskId,
      task_id: taskId,
    })
    const dataUrl = toImageDataUrl(result.data)
    if (dataUrl) {
      options.saveBridgeImageToCache(cacheKey, dataUrl)
    }
    return dataUrl
  }

  return {
    queryBridgeDetail,
    loadCachedImageDataUrl,
  }
}
