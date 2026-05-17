import { ref, type Ref } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import type { NodeInfo } from '../../../types'
import { MINIMAP_CONFIG, getMinimapColor, getMinimapPriority, resolveNodeEffectiveStatus } from '../utils/minimapColors'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

interface MinimapInteractionOptions {
  canvasRef: Ref<HTMLCanvasElement | null>
  scrollerRef: Ref<InstanceType<typeof DynamicScroller> | null>
  nodes: Ref<NodeTimelineItem[]>
  selectedNodeId: Ref<number | null>
  safeScrollToItem: (index: number) => Promise<boolean>
}

const isHtmlElement = (value: unknown): value is HTMLElement => {
  return typeof HTMLElement !== 'undefined' && value instanceof HTMLElement
}

const getScrollerElement = (scrollerRef: InstanceType<typeof DynamicScroller> | null): HTMLElement | null => {
  if (!scrollerRef) return null
  const rootCandidate = (scrollerRef as unknown as { $el?: unknown }).$el ?? scrollerRef
  if (!isHtmlElement(rootCandidate)) return null
  const nested = rootCandidate.querySelector('.vue-recycle-scroller') as HTMLElement | null
  return nested ?? rootCandidate
}

const getScrollMetrics = (scrollerEl: HTMLElement | null): { scrollTop: number; scrollHeight: number; clientHeight: number } => {
  if (!scrollerEl) return { scrollTop: 0, scrollHeight: 0, clientHeight: 0 }

  let paddingHeight = 0
  const paddingEl = scrollerEl.querySelector('.virtual-scroller-overscroll-padding') as HTMLElement | null
  if (paddingEl) paddingHeight = paddingEl.offsetHeight

  const scrollTop = scrollerEl.scrollTop
  const scrollHeight = scrollerEl.scrollHeight - paddingHeight
  const clientHeight = scrollerEl.clientHeight

  return { scrollTop, scrollHeight: Math.max(0, scrollHeight), clientHeight }
}

const resolveMinimapNodeColor = (nodes: NodeTimelineItem[], index: number, barHeight: number, totalHeight: number): string => {
  if (barHeight < 1) {
    return MINIMAP_CONFIG.colors.default
  }

  const startIndex = Math.floor((index / totalHeight) * nodes.length)
  const endIndex = Math.ceil(((index + barHeight) / totalHeight) * nodes.length)

  let bestStatus: string | null = null
  let bestPriority = -1

  for (let i = startIndex; i < endIndex && i < nodes.length; i++) {
    const node = nodes[i]
    if (!node) continue
    const effectiveStatus = resolveNodeEffectiveStatus(node)
    const priority = getMinimapPriority(effectiveStatus)
    if (priority > bestPriority) {
      bestPriority = priority
      bestStatus = effectiveStatus
    }
  }

  if (bestStatus) {
    return getMinimapColor(bestStatus as 'success' | 'failed' | 'running' | 'warning')
  }
  return MINIMAP_CONFIG.colors.default
}

const drawMinimap = (
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  nodes: NodeTimelineItem[],
  selectedNodeId: number | null,
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
) => {
  const { width } = MINIMAP_CONFIG
  const height = canvas.getBoundingClientRect().height

  ctx.clearRect(0, 0, width, height)

  if (nodes.length === 0) return

  const barHeight = height / nodes.length
  let y = 0

  if (barHeight >= 1) {
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const effectiveStatus = resolveNodeEffectiveStatus(node)
      const color = getMinimapColor(effectiveStatus)
      ctx.fillStyle = color
      ctx.fillRect(0, Math.floor(y), width, Math.ceil(barHeight))

      if (node.node_id === selectedNodeId) {
        ctx.strokeStyle = MINIMAP_CONFIG.selectedBorderColor
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, Math.floor(y) + 0.5, width - 1, Math.ceil(barHeight) - 1)
      }

      y += barHeight
    }
  } else {
    const pixels = Math.ceil(height)
    for (let px = 0; px < pixels; px++) {
      ctx.fillStyle = resolveMinimapNodeColor(nodes, px, 1, pixels)
      ctx.fillRect(0, px, width, 1)
    }

    if (selectedNodeId != null) {
      const idx = nodes.findIndex(n => n.node_id === selectedNodeId)
      if (idx >= 0) {
        const selY = Math.floor((idx / nodes.length) * height)
        ctx.strokeStyle = MINIMAP_CONFIG.selectedBorderColor
        ctx.lineWidth = 1
        ctx.strokeRect(0.5, selY + 0.5, width - 1, 1)
      }
    }
  }

  if (scrollHeight > 0 && clientHeight < scrollHeight) {
    const viewportRatio = clientHeight / scrollHeight
    const scrollRatio = scrollTop / scrollHeight
    const vpHeight = Math.max(4, viewportRatio * height)
    const vpY = scrollRatio * height

    ctx.fillStyle = MINIMAP_CONFIG.viewportColor
    ctx.fillRect(0, vpY, width, vpHeight)

    ctx.strokeStyle = MINIMAP_CONFIG.viewportBorderColor
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, vpY + 0.5, width - 1, vpHeight - 1)
  }
}

const syncCanvasSize = (canvas: HTMLCanvasElement): CanvasRenderingContext2D | null => {
  const rect = canvas.getBoundingClientRect()
  const width = MINIMAP_CONFIG.width
  const height = Math.max(1, rect.height)
  const dpr = window.devicePixelRatio || 1
  const targetWidth = Math.max(1, Math.round(width * dpr))
  const targetHeight = Math.max(1, Math.round(height * dpr))

  if (canvas.width !== targetWidth) canvas.width = targetWidth
  if (canvas.height !== targetHeight) canvas.height = targetHeight
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return ctx
}

export const createMinimapInteraction = (options: MinimapInteractionOptions) => {
  const isDragging = ref(false)

  const indexFromY = (clientY: number): number => {
    const canvas = options.canvasRef.value
    if (!canvas) return -1
    const rect = canvas.getBoundingClientRect()
    const ratio = (clientY - rect.top) / rect.height
    const count = options.nodes.value.length
    return Math.max(0, Math.min(count - 1, Math.floor(ratio * count)))
  }

  const scrollToIndex = async (index: number) => {
    const scroller = options.scrollerRef.value
    if (!scroller) return
    const scrollerEl = getScrollerElement(scroller)
    if (!scrollerEl) return

    await options.safeScrollToItem(index)
  }

  const handleClick = async (e: MouseEvent) => {
    if (isDragging.value) return
    const index = indexFromY(e.clientY)
    if (index < 0) return
    await scrollToIndex(index)
  }

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return
    isDragging.value = true

    const index = indexFromY(e.clientY)
    if (index >= 0) {
      void scrollToIndex(index)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    e.preventDefault()
  }

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.value) return
    const index = indexFromY(e.clientY)
    if (index < 0) return
    void scrollToIndex(index)
  }

  const handleMouseUp = () => {
    isDragging.value = false
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
  }

  const redraw = () => {
    const canvas = options.canvasRef.value
    if (!canvas) return
    const ctx = syncCanvasSize(canvas)
    if (!ctx) return

    const scrollerEl = getScrollerElement(options.scrollerRef.value)
    const { scrollTop, scrollHeight, clientHeight } = getScrollMetrics(scrollerEl)

    drawMinimap(ctx, canvas, options.nodes.value, options.selectedNodeId.value, scrollTop, scrollHeight, clientHeight)
  }

  const updateViewport = () => {
    if (isDragging.value) return
    redraw()
  }

  const handleResize = (entries: ResizeObserverEntry[]) => {
    if (entries.length === 0) return
    const canvas = options.canvasRef.value
    if (!canvas) return
    syncCanvasSize(canvas)
    redraw()
  }

  return {
    isDragging,
    handleClick,
    handleMouseDown,
    redraw,
    updateViewport,
    handleResize,
  }
}
