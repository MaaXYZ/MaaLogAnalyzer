import { computed, watch, type Ref } from 'vue'
import type { NodeInfo } from '../../../types'
import type { SelectedRecognitionQueryTarget } from './useBridgeRecognition'

interface UseBridgeDetailLoadersOptions {
  getSelectedRecognitionTarget: () => SelectedRecognitionQueryTarget | null
  loadBridgeRecognitionImages: () => Promise<void>
  getBridgeSessionId: () => string | null
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  toPositiveInteger: (value: unknown) => number | null
  loadBridgeNodeDefinition: () => Promise<void>
}

export const useBridgeDetailLoaders = (options: UseBridgeDetailLoadersOptions) => {
  const bridgeRecognitionQueryKey = computed(() => {
    const target = options.getSelectedRecognitionTarget()
    if (!target) return ''
    return `${target.sessionId}:${target.taskId}:${target.recoId}`
  })

  watch(bridgeRecognitionQueryKey, () => {
    void options.loadBridgeRecognitionImages()
  }, { immediate: true })

  const bridgeNodeDefinitionQueryKey = computed(() => {
    const sessionId = options.getBridgeSessionId()
    const node = options.selectedNode.value
    const nodeId = options.toPositiveInteger(node?.node_id)
    if (!sessionId || nodeId == null || options.selectedFlowItemId.value) return ''
    return `${sessionId}:${nodeId}`
  })

  watch(bridgeNodeDefinitionQueryKey, () => {
    void options.loadBridgeNodeDefinition()
  }, { immediate: true })
}
