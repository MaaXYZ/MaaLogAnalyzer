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

    const canvasEl = document.querySelector('.flowchart-canvas')
    if (!canvasEl) return

    const nodeEl = Array.from(canvasEl.querySelectorAll('[data-id]'))
      .find(element => element.getAttribute('data-id') === popoverNodeId.value)
    if (!nodeEl) return

    const nodeRect = nodeEl.getBoundingClientRect()
    const canvasRect = canvasEl.getBoundingClientRect()

    const POPOVER_WIDTH = 280
    const POPOVER_MAX_HEIGHT = 360
    const GAP = 10
    const MARGIN = 4

    let x = nodeRect.right - canvasRect.left + GAP
    let y = nodeRect.top - canvasRect.top

    // Prefer right side, then left side, otherwise clamp into canvas.
    const xRight = nodeRect.right - canvasRect.left + GAP
    const xLeft = nodeRect.left - canvasRect.left - POPOVER_WIDTH - GAP
    if (xRight + POPOVER_WIDTH + MARGIN > canvasRect.width) {
      x = xLeft >= MARGIN ? xLeft : Math.min(xRight, canvasRect.width - POPOVER_WIDTH - MARGIN)
    }
    if (x < MARGIN) x = MARGIN

    // Clamp vertical: use actual popover height when available.
    const popoverEl = document.querySelector('.node-popover') as HTMLElement | null
    const popoverHeight = popoverEl?.offsetHeight || POPOVER_MAX_HEIGHT
    if (y < MARGIN) y = MARGIN
    if (y + popoverHeight > canvasRect.height) {
      y = Math.max(MARGIN, canvasRect.height - popoverHeight - MARGIN)
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
