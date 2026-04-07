import { computed, type Ref } from 'vue'
import type { NodeInfo } from '../../types'
import { useFlowItemExpandState } from './useFlowItemExpandState'
import { useNodeCardFlowRows } from './useNodeCardFlowRows'

interface UseNodeCardFlowSectionStateParams {
  node: Ref<NodeInfo>
  defaultCollapseNestedRecognition: Ref<boolean | undefined>
  defaultCollapseNestedActionNodes: Ref<boolean | undefined>
  forceExpandRelatedWhileRunning: Ref<boolean | undefined>
}

export const useNodeCardFlowSectionState = (params: UseNodeCardFlowSectionStateParams) => {
  const nodeId = computed(() => params.node.value.node_id)

  const {
    isExpanded: isNestedRecognitionFlowItemExpanded,
    toggle: toggleNestedRecognitionFlowItemExpand,
  } = useFlowItemExpandState({
    forceExpand: params.forceExpandRelatedWhileRunning,
    defaultCollapsed: params.defaultCollapseNestedRecognition,
    resetWhen: nodeId,
  })

  const {
    isExpanded: isActionFlowItemExpanded,
    toggle: toggleActionFlowItem,
  } = useFlowItemExpandState({
    forceExpand: params.forceExpandRelatedWhileRunning,
    defaultCollapsed: params.defaultCollapseNestedActionNodes,
    resetWhen: nodeId,
  })

  const flowRows = useNodeCardFlowRows({
    node: params.node,
    isActionFlowItemExpanded,
    isRecognitionNestedFlowItemExpanded: isNestedRecognitionFlowItemExpanded,
  })

  return {
    isNestedRecognitionFlowItemExpanded,
    toggleNestedRecognitionFlowItemExpand,
    isActionFlowItemExpanded,
    toggleActionFlowItem,
    ...flowRows,
  }
}
