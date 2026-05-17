<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { DynamicScroller } from 'vue-virtual-scroller'
import type { NodeInfo } from '../../../types'
import { MINIMAP_CONFIG } from '../utils/minimapColors'
import { createMinimapInteraction } from '../composables/useMinimapInteraction'

type NodeTimelineItem = NodeInfo & { _uniqueKey: string }

const props = defineProps<{
  nodes: NodeTimelineItem[]
  scrollerRef: InstanceType<typeof DynamicScroller> | null
  selectedNodeId: number | null
  safeScrollToItem: (index: number) => Promise<boolean>
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const containerRef = ref<HTMLDivElement | null>(null)
const scrollerRefLocal = ref<InstanceType<typeof DynamicScroller> | null>(null)
const nodesRef = ref<NodeTimelineItem[]>([])
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
})

let resizeObserver: ResizeObserver | null = null
let scrollerEl: HTMLElement | null = null
let scrollRafId: number | null = null
let redrawRafId: number | null = null

const scheduleRedraw = () => {
  if (redrawRafId != null) return
  redrawRafId = requestAnimationFrame(() => {
    redrawRafId = null
    redraw()
  })
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
  visible.value = props.nodes.length >= MINIMAP_CONFIG.minNodesToShow
}, { immediate: true })

watch(() => props.nodes, () => {
  scheduleRedraw()
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
