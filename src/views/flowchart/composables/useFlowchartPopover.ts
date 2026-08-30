import { computed, getCurrentInstance, onUnmounted, ref, type Ref } from 'vue'
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
  let popoverResizeObserver: ResizeObserver | null = null
  let observedPopoverEl: HTMLElement | null = null

  const disconnectPopoverObserver = () => {
    popoverResizeObserver?.disconnect()
    popoverResizeObserver = null
    observedPopoverEl = null
  }

  if (getCurrentInstance()) {
    onUnmounted(disconnectPopoverObserver)
  }

  const popoverNodeData = computed(() => {
    if (!popoverNodeId.value) return null
    const node = options.flowNodes.value.find((item) => item.id === popoverNodeId.value)
    return (node?.data as FlowNodeData | undefined) ?? null
  })

  const updatePopoverPosition = () => {
    if (!popoverNodeId.value) return

    const canvasEl = document.querySelector('.flowchart-canvas')
    if (!canvasEl) return

    const nodeEl = Array.from(canvasEl.querySelectorAll('[data-id]')).find(
      (element) => element.getAttribute('data-id') === popoverNodeId.value,
    )
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
    const availableHeight = Math.max(120, canvasRect.height - 2 * MARGIN)
    if (popoverEl) {
      const maxHeight = `${Math.min(POPOVER_MAX_HEIGHT, availableHeight)}px`
      if (popoverEl.style.maxHeight !== maxHeight) {
        popoverEl.style.maxHeight = maxHeight
      }
      if (typeof ResizeObserver !== 'undefined' && observedPopoverEl !== popoverEl) {
        disconnectPopoverObserver()
        observedPopoverEl = popoverEl
        popoverResizeObserver = new ResizeObserver(() => updatePopoverPosition())
        popoverResizeObserver.observe(popoverEl)
      }
    }
    const popoverHeight = popoverEl?.offsetHeight || Math.min(POPOVER_MAX_HEIGHT, availableHeight)
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
