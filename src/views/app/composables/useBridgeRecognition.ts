import { ref } from 'vue'
import type { BridgeController } from '../../../composables/useBridge'
import {
  type BridgeCachedImageRefs,
  type BridgeRecognitionImageState,
} from '../utils/bridgeImageParsing'
import { createBridgeRecognitionQuery } from './bridgeRecognition/query'
import { resolveBridgeRecognitionImages } from './bridgeRecognition/resolve'

export interface SelectedRecognitionQueryTarget {
  sessionId: string
  taskId: number
  recoId: number
}

interface UseBridgeRecognitionOptions {
  getBridge: () => BridgeController | null
  getSelectedRecognitionTarget: () => SelectedRecognitionQueryTarget | null
  toPositiveInteger: (value: unknown) => number | null
  asRecord: (value: unknown) => Record<string, unknown> | null
  getErrorMessage: (error: unknown) => string
  toBridgeImageCacheKey: (sessionId: string, taskId: number, imageRefId: number) => string
  getBridgeImageFromCache: (key: string) => string | null
  saveBridgeImageToCache: (key: string, dataUrl: string) => void
}

export const useBridgeRecognition = (options: UseBridgeRecognitionOptions) => {
  const bridgeRecognitionImages = ref<BridgeRecognitionImageState | null>(null)
  const bridgeRecognitionImageRefs = ref<BridgeCachedImageRefs | null>(null)
  const bridgeRecognitionLoading = ref(false)
  const bridgeRecognitionError = ref<string | null>(null)
  let bridgeRecoLoadToken = 0
  const { queryBridgeDetail, loadCachedImageDataUrl } = createBridgeRecognitionQuery({
    getBridge: options.getBridge,
    asRecord: options.asRecord,
    toPositiveInteger: options.toPositiveInteger,
    toBridgeImageCacheKey: options.toBridgeImageCacheKey,
    getBridgeImageFromCache: options.getBridgeImageFromCache,
    saveBridgeImageToCache: options.saveBridgeImageToCache,
  })

  const clearBridgeRecognitionState = () => {
    bridgeRecognitionImageRefs.value = null
    bridgeRecognitionImages.value = null
    bridgeRecognitionLoading.value = false
    bridgeRecognitionError.value = null
  }

  const invalidateBridgeRecognitionLoad = () => {
    bridgeRecoLoadToken += 1
  }

  const loadBridgeRecognitionImages = async () => {
    const target = options.getSelectedRecognitionTarget()
    const requestToken = ++bridgeRecoLoadToken

    if (!target) {
      clearBridgeRecognitionState()
      return
    }

    bridgeRecognitionLoading.value = true
    bridgeRecognitionError.value = null
    bridgeRecognitionImageRefs.value = null
    bridgeRecognitionImages.value = null

    try {
      const recoResult = await queryBridgeDetail({
        sessionId: target.sessionId,
        target: 'reco',
        id: target.recoId,
        taskId: target.taskId,
        task_id: target.taskId,
      })

      if (requestToken !== bridgeRecoLoadToken) return

      const {
        refs,
        raw,
        draws: resolvedDraws,
        requestedRaw,
        requestedDrawCount,
      } = await resolveBridgeRecognitionImages({
        recoData: recoResult.data,
        sessionId: target.sessionId,
        taskId: target.taskId,
        loadCachedImageDataUrl,
      })

      if (requestToken !== bridgeRecoLoadToken) return
      bridgeRecognitionImageRefs.value = refs
      bridgeRecognitionImages.value = {
        raw,
        draws: resolvedDraws,
      }
      if (!bridgeRecognitionError.value) {
        if (requestedRaw && !raw && requestedDrawCount === 0) {
          bridgeRecognitionError.value = '识别图片为空（dataUrl 没有内容）'
        } else if (requestedDrawCount > 0 && resolvedDraws.length === 0 && !raw) {
          bridgeRecognitionError.value = '识别图片为空（raw/draw 都没有有效内容）'
        }
      }
    } catch (error) {
      if (requestToken !== bridgeRecoLoadToken) return
      bridgeRecognitionError.value = options.getErrorMessage(error)
    } finally {
      if (requestToken === bridgeRecoLoadToken) {
        bridgeRecognitionLoading.value = false
      }
    }
  }

  return {
    bridgeRecognitionImages,
    bridgeRecognitionImageRefs,
    bridgeRecognitionLoading,
    bridgeRecognitionError,
    invalidateBridgeRecognitionLoad,
    clearBridgeRecognitionState,
    loadBridgeRecognitionImages,
  }
}
