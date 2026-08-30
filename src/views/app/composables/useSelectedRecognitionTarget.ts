import type { Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import type { SelectedRecognitionQueryTarget } from './useBridgeRecognition'

interface UseSelectedRecognitionTargetOptions {
  bridgeEnabled: boolean
  isBridgeEnabled: () => boolean
  getSessionId: () => string | null | undefined
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  buildNodeFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
  flattenFlowItems: (
    items: UnifiedFlowItem[] | undefined,
    output?: UnifiedFlowItem[],
  ) => UnifiedFlowItem[]
  toPositiveInteger: (value: unknown) => number | null
}

export const useSelectedRecognitionTarget = (options: UseSelectedRecognitionTargetOptions) => {
  const getSelectedRecognitionTarget = (): SelectedRecognitionQueryTarget | null => {
    if (!options.bridgeEnabled || !options.isBridgeEnabled()) return null
    const sessionId = options.getSessionId()
    if (!sessionId) return null

    const node = options.selectedNode.value
    const flowItemId = options.selectedFlowItemId.value
    if (!node || !flowItemId) return null

    const selectedFlowItem = options
      .flattenFlowItems(options.buildNodeFlowItems(node))
      .find((item) => item.id === flowItemId)
    if (!selectedFlowItem) return null

    const taskId = options.toPositiveInteger(selectedFlowItem.task_id ?? node.task_id)
    if (taskId == null) return null

    if (selectedFlowItem.type === 'recognition' || selectedFlowItem.type === 'recognition_node') {
      const recoId = options.toPositiveInteger(
        selectedFlowItem.reco_id ?? selectedFlowItem.reco_details?.reco_id,
      )
      if (recoId == null) return null
      return {
        sessionId,
        taskId,
        recoIds: [recoId],
        sourceType: 'recognition',
      }
    }

    if (selectedFlowItem.type === 'wait_freezes') {
      const recoIds = (selectedFlowItem.wait_freezes_details?.reco_ids ?? [])
        .map((id) => options.toPositiveInteger(id))
        .filter((id): id is number => id != null)
      if (recoIds.length === 0) return null
      return {
        sessionId,
        taskId,
        recoIds,
        sourceType: 'wait_freezes',
      }
    }

    return null
  }

  return {
    getSelectedRecognitionTarget,
  }
}
