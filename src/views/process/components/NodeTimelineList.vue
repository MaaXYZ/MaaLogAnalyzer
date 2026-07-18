<script setup lang="ts">
import { ref } from 'vue'
import { NEmpty } from 'naive-ui'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NodeInfo } from '../../../types'
import NodeCard from '../../../components/NodeCard.vue'
import NodeTimelineMinimap from './NodeTimelineMinimap.vue'
import { MINIMAP_CONFIG } from '../utils/minimapColors'
import { useKeepAliveScrollPosition } from '../composables/keepAliveScrollPosition'

type NodeTimelineItem = NodeInfo & {
  _uniqueKey: string
}

const props = withDefaults(defineProps<{
  nodes: NodeTimelineItem[]
  selectedTaskKey?: string | null
  displayMode: string
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  itemPadding?: string
  scrollerStyle?: string
  wrapperStyle?: string
  captureWheelUp?: boolean
  selectedNodeId?: number | null
  safeScrollToItem?: (index: number) => Promise<boolean>
  preserveScrollOnActivate?: boolean
}>(), {
  selectedTaskKey: null,
  isVscodeLaunchEmbed: false,
  bridgeRequestTaskDoc: null,
  bridgeRevealTask: null,
  itemPadding: '12px',
  scrollerStyle: 'height: 100%',
  wrapperStyle: 'height: 100%; display: flex; flex-direction: column; position: relative',
  captureWheelUp: false,
  selectedNodeId: null,
  safeScrollToItem: undefined,
  preserveScrollOnActivate: true,
})

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'manual-scroll-up': []
  'scroller-mounted': [scroller: InstanceType<typeof DynamicScroller> | null]
}>()

const localScrollerRef = ref<InstanceType<typeof DynamicScroller> | null>(null)

const getScrollerElement = (): HTMLElement | null => {
  const scroller = localScrollerRef.value as unknown
  if (!scroller) return null
  const rootCandidate = (scroller as { $el?: unknown }).$el ?? scroller
  if (typeof HTMLElement === 'undefined' || !(rootCandidate instanceof HTMLElement)) return null
  return rootCandidate.querySelector('.vue-recycle-scroller') as HTMLElement | null ?? rootCandidate
}

const {
  captureCurrentScrollPosition,
  cancelScrollRestore,
} = useKeepAliveScrollPosition({
  getScrollerElement,
  getContextKey: () => props.selectedTaskKey ?? null,
  shouldPreserve: () => props.preserveScrollOnActivate,
})

const handleWheel = (event: WheelEvent) => {
  cancelScrollRestore()
  if (!props.captureWheelUp) return
  if (event.deltaY < 0) {
    emit('manual-scroll-up')
  }
}

const setLocalScrollerRef = (value: Element | object | null) => {
  localScrollerRef.value = value as InstanceType<typeof DynamicScroller> | null
  emit('scroller-mounted', value as InstanceType<typeof DynamicScroller> | null)
}
</script>

<template>
  <div
    :style="wrapperStyle"
    @pointerdown.capture="cancelScrollRestore"
    @wheel.capture.passive="handleWheel"
  >
    <div v-if="nodes.length === 0" style="padding: 40px 0">
      <n-empty description="暂无节点数据" />
    </div>
    <DynamicScroller
      v-else
      :ref="setLocalScrollerRef"
      :key="selectedTaskKey ?? undefined"
      :items="nodes"
      :min-item-size="40"
      key-field="_uniqueKey"
      class="virtual-scroller"
      :style="scrollerStyle"
      @scroll.passive="captureCurrentScrollPosition"
    >
      <template #default="{ item, index, active }">
        <DynamicScrollerItem
          :item="item"
          :active="active"
          :data-index="index"
          :size-dependencies="[
            item.node_flow?.length,
            item.next_list?.length,
            item.action_details,
            displayMode,
          ]"
        >
          <div :style="{ padding: itemPadding }">
            <node-card
              :node="item"
              :is-vscode-launch-embed="isVscodeLaunchEmbed"
              :bridge-request-task-doc="bridgeRequestTaskDoc"
              :bridge-reveal-task="bridgeRevealTask"
              @select-node="(node) => emit('select-node', node)"
              @select-action="(node) => emit('select-action', node)"
              @select-recognition="(node, attemptIndex) => emit('select-recognition', node, attemptIndex)"
              @select-flow-item="(node, flowItemId) => emit('select-flow-item', node, flowItemId)"
            />
          </div>
        </DynamicScrollerItem>
      </template>
      
      <!-- 增加底部留白（类似 VS Code 的 scrollBeyondLastLine） -->
      <!-- 这从根本上解决了当列表最后几个巨型节点被收起时，因为整体 scrollHeight 锐减导致浏览器强制把滚动条往上推，进而产生点击位置向下乱跳的问题 -->
      <template #after>
        <div class="virtual-scroller-overscroll-padding" style="height: 100vh; pointer-events: none; opacity: 0;"></div>
      </template>
    </DynamicScroller>
    <node-timeline-minimap
      v-if="safeScrollToItem && nodes.length >= MINIMAP_CONFIG.minNodesToShow"
      :nodes="nodes"
      :scroller-ref="localScrollerRef"
      :selected-node-id="selectedNodeId ?? null"
      :safe-scroll-to-item="safeScrollToItem"
    />
  </div>
</template>

<style scoped>
.virtual-scroller {
  /* 禁用浏览器默认的滚动锚定，防止虚拟列表在内部元素高频收起/展开时自动乱滚位置 */
  overflow-anchor: none;
  /* 为右侧的 minimap 预留空间，避免与卡片内容重叠 */
  padding-right: 16px;
}
/* 隐藏原生滚动条，让 minimap 完美充当滚动条 */
.virtual-scroller::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}
/* 确保动态条目也避免锚定争夺 */
.virtual-scroller :deep(*) {
  overflow-anchor: none;
}
.virtual-scroller :deep(.vue-recycle-scroller__item-wrapper) {
  overflow-anchor: none;
}
</style>
