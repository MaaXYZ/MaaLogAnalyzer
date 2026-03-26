import { computed, type Ref } from 'vue'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import { buildNodeFlowItems } from '../../../utils/nodeFlow'

interface UseDetailFlowSelectionOptions {
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null | undefined>
}

const flattenFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  output: UnifiedFlowItem[] = [],
): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children && item.children.length > 0) {
      flattenFlowItems(item.children, output)
    }
  }
  return output
}

const pickFirstErrorImage = (items: UnifiedFlowItem[] | undefined): string | null => {
  const flattened = flattenFlowItems(items)
  for (const item of flattened) {
    if (item.type !== 'recognition' && item.type !== 'recognition_node') continue
    const candidate = item.error_image
    if (candidate) return candidate
  }
  return null
}

const resolveSyntheticFlowItem = (node: NodeInfo, flowItemId: string): UnifiedFlowItem | null => {
  if (/^node\.action\.\d+$/.test(flowItemId) && node.action_details) {
    const action = node.action_details
    return {
      id: flowItemId,
      type: 'action',
      name: action.name || node.name,
      status: node.status === 'running' ? 'running' : (action.success ? 'success' : 'failed'),
      ts: action.ts || action.end_ts || node.end_ts || node.ts,
      end_ts: action.end_ts,
      action_id: action.action_id,
      action_details: action,
    }
  }

  return null
}

export const useDetailFlowSelection = (options: UseDetailFlowSelectionOptions) => {
  const selectedFlowItem = computed<UnifiedFlowItem | null>(() => {
    if (!options.selectedNode.value || !options.selectedFlowItemId.value) return null
    const flattened = flattenFlowItems(buildNodeFlowItems(options.selectedNode.value))
    const direct = flattened.find(item => item.id === options.selectedFlowItemId.value)
    if (direct) return direct
    return resolveSyntheticFlowItem(options.selectedNode.value, options.selectedFlowItemId.value)
  })

  const isFlowItemSelected = computed(() => !!selectedFlowItem.value)

  const selectedFlowErrorImage = computed(() => {
    const selected = selectedFlowItem.value
    if (!selected) return null
    const own = selected.error_image
    if (own) return own
    return pickFirstErrorImage(selected.children)
  })

  return {
    selectedFlowItem,
    isFlowItemSelected,
    selectedFlowErrorImage,
  }
}
