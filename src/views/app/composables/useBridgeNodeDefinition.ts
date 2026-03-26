import { ref } from 'vue'
import type { NodeInfo } from '../../../types'

interface QueryNodeResult {
  task: string
  data: string | null
}

interface UseBridgeNodeDefinitionOptions {
  getBridgeSessionId: () => string | null
  getSelectedNode: () => NodeInfo | null
  getSelectedFlowItemId: () => string | null
  queryBridgeNode: (sessionId: string, task: string) => Promise<QueryNodeResult>
  toTrimmedNonEmptyString: (value: unknown) => string | null
  toPositiveInteger: (value: unknown) => number | null
  getErrorMessage: (error: unknown) => string
}

export const useBridgeNodeDefinition = (options: UseBridgeNodeDefinitionOptions) => {
  const bridgeNodeDefinition = ref<string | null>(null)
  const bridgeNodeDefinitionLoading = ref(false)
  const bridgeNodeDefinitionError = ref<string | null>(null)
  let bridgeNodeDefinitionLoadToken = 0

  const clearBridgeNodeDefinitionState = () => {
    bridgeNodeDefinition.value = null
    bridgeNodeDefinitionLoading.value = false
    bridgeNodeDefinitionError.value = null
  }

  const invalidateBridgeNodeDefinitionLoad = () => {
    bridgeNodeDefinitionLoadToken += 1
  }

  const loadBridgeNodeDefinition = async () => {
    const requestToken = ++bridgeNodeDefinitionLoadToken
    const sessionId = options.getBridgeSessionId()
    const node = options.getSelectedNode()
    const task = options.toTrimmedNonEmptyString(node?.name)
    const nodeId = options.toPositiveInteger(node?.node_id)
    if (!sessionId || !task || nodeId == null || options.getSelectedFlowItemId()) {
      clearBridgeNodeDefinitionState()
      return
    }

    bridgeNodeDefinitionLoading.value = true
    bridgeNodeDefinitionError.value = null
    bridgeNodeDefinition.value = null
    try {
      const result = await options.queryBridgeNode(sessionId, task)
      if (requestToken !== bridgeNodeDefinitionLoadToken) return
      bridgeNodeDefinition.value = result.data
    } catch (error) {
      if (requestToken !== bridgeNodeDefinitionLoadToken) return
      bridgeNodeDefinitionError.value = options.getErrorMessage(error)
    } finally {
      if (requestToken === bridgeNodeDefinitionLoadToken) {
        bridgeNodeDefinitionLoading.value = false
      }
    }
  }

  return {
    bridgeNodeDefinition,
    bridgeNodeDefinitionLoading,
    bridgeNodeDefinitionError,
    invalidateBridgeNodeDefinitionLoad,
    clearBridgeNodeDefinitionState,
    loadBridgeNodeDefinition,
  }
}
