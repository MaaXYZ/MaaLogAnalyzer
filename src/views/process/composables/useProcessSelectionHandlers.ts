import type { Ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import type { NodeInfo } from '../../../types'

interface UseProcessSelectionHandlersOptions {
  virtualScroller: Ref<InstanceType<typeof DynamicScroller> | null>
  onSelectNode: (node: NodeInfo) => void
  onSelectAction: (node: NodeInfo) => void
  onSelectRecognition: (node: NodeInfo, attemptIndex: number) => void
  onSelectFlowItem: (node: NodeInfo, flowItemId: string) => void
}

export const useProcessSelectionHandlers = (options: UseProcessSelectionHandlersOptions) => {
  const handleNodeClick = (node: NodeInfo) => {
    options.onSelectNode(node)
  }

  const handleActionClick = (node: NodeInfo) => {
    options.onSelectAction(node)
  }

  const handleRecognitionClick = (node: NodeInfo, attemptIndex: number) => {
    options.onSelectRecognition(node, attemptIndex)
  }

  const handleFlowItemClick = (node: NodeInfo, flowItemId: string) => {
    options.onSelectFlowItem(node, flowItemId)
  }

  const handleVirtualScrollerMounted = (scroller: object | null) => {
    options.virtualScroller.value = scroller as InstanceType<typeof DynamicScroller> | null
  }

  return {
    handleNodeClick,
    handleActionClick,
    handleRecognitionClick,
    handleFlowItemClick,
    handleVirtualScrollerMounted,
  }
}
