import type { Ref } from 'vue'
import type { DynamicScrollerInstance } from '../../../types/virtualScroller'
import type { NodeInfo } from '../../../types'

interface UseProcessSelectionHandlersOptions {
  virtualScroller: Ref<DynamicScrollerInstance | null>
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
    options.virtualScroller.value = scroller as DynamicScrollerInstance | null
  }

  return {
    handleNodeClick,
    handleActionClick,
    handleRecognitionClick,
    handleFlowItemClick,
    handleVirtualScrollerMounted,
  }
}
