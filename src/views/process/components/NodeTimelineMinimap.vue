<script setup lang="ts">
import { shallowRef, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DynamicScrollerInstance } from '../../../types/virtualScroller'
import type { NodeInfo } from '../../../types'
import { MINIMAP_CONFIG } from '../utils/minimapColors'
import { createMinimapInteraction } from '../composables/useMinimapInteraction'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = defineProps<{
  nodes: NodeTimelineItem[]
  scrollerRef: DynamicScrollerInstance | null
  selectedNodeId: number | null
  safeScrollToItem: (index: number) => Promise<boolean>
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const scrollerRefLocal = ref<DynamicScrollerInstance | null>(null)
const nodesRef = shallowRef<NodeTimelineItem[]>([])
const selectedNodeIdRef = ref<number | null>(null)

watch(() => props.scrollerRef, (v) => { scrollerRefLocal.value = v })
watch(() => props.nodes, (v) => { nodesRef.value = v }, { immediate: true })
watch(() => props.selectedNodeId, (v) => { selectedNodeIdRef.value = v }, { immediate: true })

const {
  handleClick,
  handleMouseDown,
  redraw,
  updateViewport,
  handleResize,
} = createMinimapInteraction({
  canvasRef,
  scrollerRef: scrollerRefLocal,
  nodes: nodesRef,
  selectedNodeId: selectedNodeIdRef,
  safeScrollToItem: (index: number) => props.safeScrollToItem(index),
  onNodeClick: (index: number) => {
    const node = props.nodes[index]
    if (node) emit('select-node', node)
  },
})

let resizeObserver: ResizeObserver | null = null
let scrollerEl: HTMLElement | null = null
let scrollRafId: number | null = null
let redrawRafId: number | null = null
let visibleTimer: ReturnType<typeof setTimeout> | null = null
let idleRedrawId: number | null = null

const scheduleRedraw = () => {
  if (redrawRafId != null) return
  redrawRafId = requestAnimationFrame(() => {
    redrawRafId = null
    redraw()
  })
}

const scheduleIdleRedraw = () => {
  if (idleRedrawId != null) return
  const run = () => {
    idleRedrawId = null
    scheduleRedraw()
  }
  const requestIdle = window.requestIdleCallback
  if (requestIdle) {
    idleRedrawId = requestIdle(run, { timeout: 300 }) as unknown as number
    return
  }
  idleRedrawId = window.setTimeout(run, 80)
}

const onScrollerScroll = () => {
  if (scrollRafId != null) return
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null
    updateViewport()
  })
}

const observeScroller = () => {
  const scroller = props.scrollerRef as unknown
  if (!scroller) return
  const rootCandidate = (scroller as { $el?: unknown }).$el ?? scroller
  if (!(rootCandidate instanceof HTMLElement)) return
  const nested = rootCandidate.querySelector('.vue-recycle-scroller') as HTMLElement | null
  const el = nested ?? rootCandidate

  if (scrollerEl === el) return
  detachScroller()
  scrollerEl = el
  el.addEventListener('scroll', onScrollerScroll, { passive: true })
}

const detachScroller = () => {
  if (scrollerEl) {
    scrollerEl.removeEventListener('scroll', onScrollerScroll)
    scrollerEl = null
  }
  if (scrollRafId != null) {
    cancelAnimationFrame(scrollRafId)
    scrollRafId = null
  }
}

const visible = ref(false)

watch(() => props.nodes.length, () => {
  if (visibleTimer) {
    clearTimeout(visibleTimer)
    visibleTimer = null
  }

  if (props.nodes.length < MINIMAP_CONFIG.minNodesToShow) {
    visible.value = false
    return
  }

  visibleTimer = setTimeout(() => {
    visibleTimer = null
    visible.value = true
    scheduleIdleRedraw()
  }, 120)
}, { immediate: true })

watch(() => props.nodes, () => {
  scheduleIdleRedraw()
}, { flush: 'post' })

watch(() => props.selectedNodeId, () => {
  scheduleRedraw()
}, { flush: 'post' })

watch(() => props.scrollerRef, () => {
  observeScroller()
  scheduleRedraw()
}, { flush: 'post' })

onMounted(() => {
  if (containerRef.value) {
    resizeObserver = new ResizeObserver((entries) => {
      handleResize(entries)
    })
    resizeObserver.observe(containerRef.value)
  }
  observeScroller()
  scheduleRedraw()
})

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  detachScroller()
  if (redrawRafId != null) {
    cancelAnimationFrame(redrawRafId)
    redrawRafId = null
  }
  if (visibleTimer) {
    clearTimeout(visibleTimer)
    visibleTimer = null
  }
  if (idleRedrawId != null) {
    if (window.cancelIdleCallback) {
      window.cancelIdleCallback(idleRedrawId)
    } else {
      clearTimeout(idleRedrawId)
    }
    idleRedrawId = null
  }
})
</script>

<template>
  <div
    v-if="visible"
    ref="containerRef"
    class="node-timeline-minimap"
    :style="{ width: `${MINIMAP_CONFIG.width}px` }"
  >
    <canvas
      ref="canvasRef"
      :width="MINIMAP_CONFIG.width"
      :height="100"
      class="minimap-canvas"
      @click="handleClick"
      @mousedown="handleMouseDown"
    />
  </div>
</template>

<style scoped>
.node-timeline-minimap {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  z-index: 10;
  pointer-events: auto;
  cursor: pointer;
  user-select: none;
  background: var(--vscode-scrollbarSlider-background, rgba(128, 128, 128, 0.05));
  border-left: 1px solid var(--vscode-panel-border, rgba(128, 128, 128, 0.1));
}

.minimap-canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
