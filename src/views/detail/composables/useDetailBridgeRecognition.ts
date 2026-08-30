import { computed, type Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import { isVSCode } from '../../../utils/platform'
import type { BridgeOpenCropRequest } from './types'

interface UseDetailBridgeRecognitionOptions {
  isVscodeLaunchEmbed: Ref<boolean | undefined>
  bridgeOpenCrop: Ref<((request: BridgeOpenCropRequest) => Promise<void>) | null | undefined>
  bridgeRecognitionImages: Ref<
    | {
        raw: string | null
        draws: string[]
      }
    | null
    | undefined
  >
  bridgeRecognitionImageRefs: Ref<
    | {
        raw: number | null
        draws: number[]
      }
    | null
    | undefined
  >
  currentRecognition: Ref<any>
  currentRecognitionItem: Ref<UnifiedFlowItem | null>
  selectedNode: Ref<NodeInfo | null>
}

const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    return normalized > 0 ? normalized : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    const normalized = Math.trunc(parsed)
    return normalized > 0 ? normalized : null
  }
  return null
}

const toTrimmedNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

const imageSourceToDataUrl = async (source: string): Promise<string> => {
  if (/^data:/i.test(source)) return source

  return await new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) {
          reject(new Error('Failed to create image canvas'))
          return
        }
        context.drawImage(image, 0, 0)
        resolve(canvas.toDataURL('image/png'))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => reject(new Error('Failed to load image'))
    image.src = source
  })
}

const cloneRecognitionDetail = (value: unknown): Record<string, unknown> | undefined => {
  if (typeof value !== 'object' || value === null) return undefined
  try {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>
  } catch {
    return undefined
  }
}

export const useDetailBridgeRecognition = (options: UseDetailBridgeRecognitionOptions) => {
  const bridgeRecognitionRawImage = computed(() => {
    const source = options.bridgeRecognitionImages.value?.raw
    if (typeof source !== 'string' || !source.trim()) return null
    return source
  })

  const bridgeRecognitionDrawImages = computed(() => {
    const draws = options.bridgeRecognitionImages.value?.draws
    if (!Array.isArray(draws)) return []
    return draws.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    )
  })

  const embedEnabled = computed(() => options.isVscodeLaunchEmbed.value === true)
  const nativeVSCodeEnabled = computed(() => !embedEnabled.value && isVSCode())
  const nativeImageSource = computed(() => {
    const attempt = options.currentRecognitionItem.value
    return (
      toTrimmedNonEmptyString(attempt?.error_image) ??
      toTrimmedNonEmptyString(attempt?.vision_image)
    )
  })
  const showOpenCropButton = computed(() => embedEnabled.value || nativeVSCodeEnabled.value)
  const openCropImageAvailable = computed(() => {
    if (embedEnabled.value) {
      return (
        toPositiveInteger(options.bridgeRecognitionImageRefs.value?.raw) != null ||
        toTrimmedNonEmptyString(options.bridgeRecognitionImages.value?.raw) != null
      )
    }
    return nativeImageSource.value != null
  })

  const openRecognitionInCrop = async () => {
    if (nativeVSCodeEnabled.value) {
      const source = nativeImageSource.value
      if (!source || !window.vscodeApi?.postMessage) return

      try {
        const image = await imageSourceToDataUrl(source)
        window.vscodeApi.postMessage({
          type: 'openMseCrop',
          image,
          detail: cloneRecognitionDetail(options.currentRecognition.value),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        window.$message?.error(`无法打开 MSE 截图工具: ${message}`)
      }
      return
    }

    if (!embedEnabled.value || !options.bridgeOpenCrop.value) return

    const recoId = toPositiveInteger(options.currentRecognition.value?.reco_id)
    const taskId = toPositiveInteger(
      (options.currentRecognitionItem.value as any)?.task_id ?? options.selectedNode.value?.task_id,
    )
    const cachedImageId = toPositiveInteger(options.bridgeRecognitionImageRefs.value?.raw)
    const dataUrl = toTrimmedNonEmptyString(options.bridgeRecognitionImages.value?.raw)

    if (cachedImageId == null && !dataUrl) return

    await options.bridgeOpenCrop.value({
      cachedImageId,
      dataUrl,
      taskId,
      recoId,
    })
  }

  const openImageInCrop = async (sourceValue: string | null | undefined, detail?: unknown) => {
    const source = toTrimmedNonEmptyString(sourceValue)
    if (!source) return

    try {
      const image = await imageSourceToDataUrl(source)
      if (nativeVSCodeEnabled.value) {
        if (!window.vscodeApi?.postMessage) return
        window.vscodeApi.postMessage({
          type: 'openMseCrop',
          image,
          detail: cloneRecognitionDetail(detail),
        })
        return
      }

      if (!embedEnabled.value || !options.bridgeOpenCrop.value) return
      const detailRecord =
        typeof detail === 'object' && detail !== null
          ? (detail as Record<string, unknown>)
          : undefined
      const taskId = toPositiveInteger(detailRecord?.task_id ?? options.selectedNode.value?.task_id)
      await options.bridgeOpenCrop.value({ dataUrl: image, taskId })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      window.$message?.error(`无法打开 MSE 截图工具: ${message}`)
    }
  }

  return {
    isVscodeLaunchEmbed: embedEnabled,
    bridgeRecognitionRawImage,
    bridgeRecognitionDrawImages,
    showOpenCropButton,
    openCropImageAvailable,
    openRecognitionInCrop,
    openImageInCrop,
  }
}
