import type { Ref } from 'vue'
import type { NodeInfo, TaskInfo, UnifiedFlowItem } from '../../../types'

interface UseTaskSelectionOptions {
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  pendingScrollNodeId: Ref<number | null>
  buildNodeFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
  buildNodeRecognitionFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
}

const flattenFlowItems = (items: UnifiedFlowItem[] | undefined, output: UnifiedFlowItem[] = []): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children && item.children.length > 0) {
      flattenFlowItems(item.children, output)
    }
  }
  return output
}

const hasMainActionFlowId = (node: NodeInfo, flowItemId: string): boolean => {
  if (/^node\.action\.\d+$/.test(flowItemId)) {
    return !!node.action_details
  }
  return false
}

export const useTaskSelection = (options: UseTaskSelectionOptions) => {
  const hasFlowItemId = (node: NodeInfo | null, flowItemId: string | null | undefined): boolean => {
    if (!node || !flowItemId) return false
    if (flattenFlowItems(options.buildNodeRecognitionFlowItems(node)).some(item => item.id === flowItemId)) return true
    if (flattenFlowItems(options.buildNodeFlowItems(node)).some(item => item.id === flowItemId)) return true
    if (hasMainActionFlowId(node, flowItemId)) return true
    return false
  }

  const pickMainActionFlowItemId = (node: NodeInfo): string | null => {
    if (!node.action_details) return null
    return `node.action.${node.action_details.action_id}`
  }

  const pickFlowId = (node: NodeInfo, preferredId: string): string | null => {
    if (hasFlowItemId(node, preferredId)) return preferredId
    return null
  }

  const resetSelectionState = () => {
    options.selectedTask.value = null
    options.selectedNode.value = null
    options.selectedFlowItemId.value = null
    options.pendingScrollNodeId.value = null
  }

  const handleSelectTask = (task: TaskInfo) => {
    options.selectedTask.value = task
    options.selectedNode.value = null
    options.selectedFlowItemId.value = null
  }

  const handleSelectNode = (node: NodeInfo) => {
    options.selectedNode.value = node
    options.selectedFlowItemId.value = null
  }

  const handleSelectAction = (node: NodeInfo) => {
    options.selectedNode.value = node
    options.selectedFlowItemId.value = pickMainActionFlowItemId(node)
  }

  const handleSelectRecognition = (node: NodeInfo, attemptIndex: number) => {
    options.selectedNode.value = node
    const recognitionItems = options.buildNodeRecognitionFlowItems(node)
    const targetRecognition = recognitionItems[attemptIndex] ?? null
    options.selectedFlowItemId.value = targetRecognition
      ? pickFlowId(node, targetRecognition.id)
      : null
  }

  const handleSelectFlowItem = (node: NodeInfo, flowItemId: string) => {
    options.selectedNode.value = node
    options.selectedFlowItemId.value = pickFlowId(node, flowItemId)
  }

  return {
    hasFlowItemId,
    pickMainActionFlowItemId,
    pickFlowId,
    resetSelectionState,
    handleSelectTask,
    handleSelectNode,
    handleSelectAction,
    handleSelectRecognition,
    handleSelectFlowItem,
  }
}
