import { computed, ref, type Ref } from 'vue'
import type { FlowNodeData } from '../../../utils/flowchartBuilder'

interface FlowNodeLike {
  id: string
  data?: unknown
}

interface UseFlowchartPopoverOptions {
  flowNodes: Ref<FlowNodeLike[]>
}

export const useFlowchartPopover = (options: UseFlowchartPopoverOptions) => {
  const popoverNodeId = ref<string | null>(null)
  const popoverPos = ref({ x: 0, y: 0 })

  const popoverNodeData = computed(() => {
    if (!popoverNodeId.value) return null
    const node = options.flowNodes.value.find(item => item.id === popoverNodeId.value)
    return (node?.data as FlowNodeData | undefined) ?? null
  })

  const updatePopoverPosition = () => {
    if (!popoverNodeId.value) return

    const nodeEl = document.querySelector(`[data-id="${popoverNodeId.value}"]`)
    const canvasEl = document.querySelector('.flowchart-canvas')
    if (!nodeEl || !canvasEl) return

    const nodeRect = nodeEl.getBoundingClientRect()
    const canvasRect = canvasEl.getBoundingClientRect()

    let x = nodeRect.right - canvasRect.left + 10
    let y = nodeRect.top - canvasRect.top

    // If popover would overflow right edge, show on left side.
    if (x + 280 > canvasRect.width) {
      x = nodeRect.left - canvasRect.left - 290
    }

    // Clamp vertical: use actual popover height if available.
    const popoverEl = document.querySelector('.node-popover') as HTMLElement | null
    const popoverHeight = popoverEl?.offsetHeight || 360
    if (y < 4) y = 4
    if (y + popoverHeight > canvasRect.height) {
      y = Math.max(4, canvasRect.height - popoverHeight - 4)
    }

    popoverPos.value = { x, y }
  }

  const closePopover = () => {
    popoverNodeId.value = null
  }

  return {
    popoverNodeId,
    popoverPos,
    popoverNodeData,
    updatePopoverPosition,
    closePopover,
  }
}
