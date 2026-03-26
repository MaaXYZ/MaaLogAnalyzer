import { computed, type Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import type { BridgeOpenCropRequest } from './types'

interface UseDetailBridgeRecognitionOptions {
  isVscodeLaunchEmbed: Ref<boolean | undefined>
  bridgeOpenCrop: Ref<((request: BridgeOpenCropRequest) => Promise<void>) | null | undefined>
  bridgeRecognitionImages: Ref<{
    raw: string | null
    draws: string[]
  } | null | undefined>
  bridgeRecognitionImageRefs: Ref<{
    raw: number | null
    draws: number[]
  } | null | undefined>
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

export const useDetailBridgeRecognition = (options: UseDetailBridgeRecognitionOptions) => {
  const bridgeRecognitionRawImage = computed(() => {
    const source = options.bridgeRecognitionImages.value?.raw
    if (typeof source !== 'string' || !source.trim()) return null
    return source
  })

  const bridgeRecognitionDrawImages = computed(() => {
    const draws = options.bridgeRecognitionImages.value?.draws
    if (!Array.isArray(draws)) return []
    return draws.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  })

  const embedEnabled = computed(() => options.isVscodeLaunchEmbed.value === true)

  const openRecognitionInCrop = async () => {
    if (!embedEnabled.value || !options.bridgeOpenCrop.value) return

    const recoId = toPositiveInteger(options.currentRecognition.value?.reco_id)
    const taskId = toPositiveInteger((options.currentRecognitionItem.value as any)?.task_id ?? options.selectedNode.value?.task_id)
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

  return {
    isVscodeLaunchEmbed: embedEnabled,
    bridgeRecognitionRawImage,
    bridgeRecognitionDrawImages,
    openRecognitionInCrop,
  }
}
