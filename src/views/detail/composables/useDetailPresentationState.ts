import { computed, type Ref } from 'vue'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, UnifiedFlowItem } from '../../../types'
import { getRuntimeStatusTagType, getRuntimeStatusText } from '../../../utils/runtimeStatus'

interface UseDetailPresentationStateOptions {
  isMobile: Ref<boolean>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItem: Ref<UnifiedFlowItem | null>
  currentRecognitionItem: Ref<UnifiedFlowItem | null>
  currentActionItem: Ref<UnifiedFlowItem | null>
  currentActionDetails: Ref<any>
  hasRecognition: Ref<boolean>
  hasAction: Ref<boolean>
}

const pickStartTime = (
  startTimestamp?: string | null,
  fallbackTimestamp?: string | null,
  finalFallback?: string | null,
): string => {
  return startTimestamp || fallbackTimestamp || finalFallback || '-'
}

export const useDetailPresentationState = (options: UseDetailPresentationStateOptions) => {
  const statusType = computed(() => {
    if (!options.selectedNode.value) return 'default'
    return getRuntimeStatusTagType(options.selectedNode.value.status)
  })

  const statusInfo = computed(() => {
    if (!options.selectedNode.value) return { text: '未选择', icon: null }
    const status = options.selectedNode.value.status
    if (status === 'running') {
      return {
        text: getRuntimeStatusText(status),
        icon: null,
      }
    }
    return {
      text: getRuntimeStatusText(status),
      icon: status === 'success' ? CheckCircleOutlined : CloseCircleOutlined,
    }
  })

  const recognitionExecutionTime = computed(() => {
    const recognition = options.currentRecognitionItem.value as any
    return pickStartTime(recognition?.ts, recognition?.end_ts)
  })

  const actionExecutionTime = computed(() => {
    const actionItem = options.currentActionItem.value as any
    const actionDetails = options.currentActionDetails.value as any
    if (actionDetails?.ts || actionDetails?.end_ts) {
      return pickStartTime(actionDetails.ts, actionDetails.end_ts)
    }
    return pickStartTime(actionItem?.ts, actionItem?.end_ts)
  })

  const selectedFlowExecutionTime = computed(() => {
    const selected = options.selectedFlowItem.value as any
    return pickStartTime(selected?.ts, selected?.end_ts)
  })

  const nodeExecutionTime = computed(() => {
    return pickStartTime(options.selectedNode.value?.ts, options.selectedNode.value?.end_ts)
  })

  const showFlowFallback = computed(() => {
    return !!options.selectedFlowItem.value && !options.hasRecognition.value && !options.hasAction.value
  })

  const getFlowTypeLabel = (type: UnifiedFlowItem['type']) => {
    switch (type) {
      case 'task': return 'Task'
      case 'pipeline_node': return 'PipelineNode'
      case 'recognition': return 'Recognition'
      case 'recognition_node': return 'RecognitionNode'
      case 'action': return 'Action'
      case 'action_node': return 'ActionNode'
      default: return type
    }
  }

  const showNodeCompletedRow = computed(() => {
    const node = options.selectedNode.value
    const details = node?.node_details
    if (!node || !details) return false
    if (node.status === 'failed' && !details.completed) return false
    return true
  })

  const nodeCompletedValue = computed(() => options.selectedNode.value?.node_details?.completed ?? false)

  const descriptionColumns = computed(() => (options.isMobile.value ? 1 : 2))

  return {
    statusType,
    statusInfo,
    recognitionExecutionTime,
    actionExecutionTime,
    selectedFlowExecutionTime,
    nodeExecutionTime,
    showFlowFallback,
    getFlowTypeLabel,
    showNodeCompletedRow,
    nodeCompletedValue,
    descriptionColumns,
  }
}
