import { computed, type Ref } from 'vue'
import type { UnifiedFlowItem } from '../../../types'

interface UseDetailFlowDetailsOptions {
  selectedFlowItem: Ref<UnifiedFlowItem | null>
}

const toFallbackRecognition = (source: any) => {
  if (!source) return null
  const rawRecoId = source?.reco_details?.reco_id ?? source?.reco_id
  const recoId = typeof rawRecoId === 'number' ? rawRecoId : Number(rawRecoId)
  return {
    reco_id: Number.isFinite(recoId) ? recoId : 0,
    algorithm: 'Unknown',
    box: null,
    detail: source.detail ?? {},
    name: source.name || '',
  }
}

export const useDetailFlowDetails = (options: UseDetailFlowDetailsOptions) => {
  const currentRecognitionItem = computed<UnifiedFlowItem | null>(() => {
    const selected = options.selectedFlowItem.value
    if (!selected) return null
    if (selected.type === 'recognition' || selected.type === 'recognition_node') return selected
    return null
  })

  const currentAttempt = computed(() => currentRecognitionItem.value)

  const currentRecognition = computed(() => {
    const recognition = currentRecognitionItem.value
    if (!recognition) return null
    return recognition.reco_details || toFallbackRecognition(recognition)
  })

  const hasRecognition = computed(() => !!currentRecognition.value)

  const currentActionItem = computed<UnifiedFlowItem | null>(() => {
    const selected = options.selectedFlowItem.value
    if (!selected) return null
    if (selected.type !== 'action' && selected.type !== 'action_node') return null
    return selected
  })

  const currentActionDetails = computed(() => {
    const action = currentActionItem.value
    if (!action) return null
    if (action.action_details) return action.action_details
    return {
      action_id: action.action_id || action.node_id || 0,
      action: 'Unknown',
      box: [0, 0, 0, 0] as [number, number, number, number],
      detail: {},
      name: action.name,
      success: action.status === 'success',
      ts: action.ts,
      end_ts: action.end_ts,
    }
  })

  const hasAction = computed(() => !!currentActionDetails.value)

  const currentActionStatus = computed(() => {
    const action = currentActionItem.value
    if (action) return action.status
    if (currentActionDetails.value) {
      return currentActionDetails.value.success ? 'success' : 'failed'
    }
    return null
  })

  return {
    currentRecognitionItem,
    currentAttempt,
    currentRecognition,
    hasRecognition,
    currentActionItem,
    currentActionDetails,
    hasAction,
    currentActionStatus,
  }
}
