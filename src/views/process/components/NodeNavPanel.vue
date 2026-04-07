<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import {
  NCard, NEmpty,
} from 'naive-ui'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { NodeNavViewItem } from '../composables/useNodeNavSearch'
import NodeNavItem from './NodeNavItem.vue'
import NodeNavHeader from './NodeNavHeader.vue'
import NodeNavSearchInput from './NodeNavSearchInput.vue'

const props = defineProps<{
  items: NodeNavViewItem[]
  selectedNodeId?: number | null
  currentNodesLength: number
  displayMode: string
  searchText: string
  normalizedSearchText: string
  failedOnly: boolean
  emptyDescription: string
}>()

const emit = defineEmits<{
  'update:search-text': [value: string]
  'toggle-failed-only': []
  'select-node': [index: number]
  'manual-scroll-up': []
}>()

const nodeNavScroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

const navMinItemSize = computed(() => {
  if (props.displayMode === 'detailed') {
    return props.normalizedSearchText ? 76 : 58
  }
  return props.normalizedSearchText ? 52 : 34
})

const getScrollerElement = (): HTMLElement | null => {
  const root = (nodeNavScroller.value as unknown as { $el?: HTMLElement } | null)?.$el
  if (!root) return null
  const nested = root.querySelector('.vue-recycle-scroller') as HTMLElement | null
  return nested || root
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const safeScrollToItem = async (index: number, retry = 0): Promise<boolean> => {
  const scroller = nodeNavScroller.value
  const total = props.items.length
  if (!scroller || total === 0) return false

  const targetIndex = Math.max(0, Math.min(index, total - 1))
  await nextTick()

  try {
    scroller.scrollToItem(targetIndex)
    return true
  } catch (error) {
    if (retry >= 2) {
      console.debug('[node-nav] scrollToItem skipped:', error)
      return false
    }
    await delay(60 * (retry + 1))
    return safeScrollToItem(targetIndex, retry + 1)
  }
}

const alignScrollerBottom = () => {
  const scroller = getScrollerElement()
  if (!scroller) return
  const maxScrollTop = scroller.scrollHeight - scroller.clientHeight
  if (maxScrollTop <= 0) return
  scroller.scrollTo({ top: maxScrollTop, behavior: 'auto' })
}

const scrollToTop = () => {
  void safeScrollToItem(0)
  getScrollerElement()?.scrollTo({ top: 0, behavior: 'auto' })
}

const scrollToBottom = () => {
  const targetIndex = props.items.length - 1
  if (targetIndex < 0) return

  void (async () => {
    await safeScrollToItem(targetIndex)
    await nextTick()
    alignScrollerBottom()

    // 动态高度项在渲染后会更新总高度，补一次避免“看起来没到底”
    requestAnimationFrame(() => {
      alignScrollerBottom()
    })
    setTimeout(() => {
      alignScrollerBottom()
    }, 80)
  })()
}

const handleWheel = (event: WheelEvent) => {
  if (event.deltaY < 0) {
    emit('manual-scroll-up')
  }
}

defineExpose({
  scrollToTop,
  scrollToBottom,
})
</script>

<template>
  <n-card
    size="small"
    data-tour="analysis-node-nav"
    style="height: 100%; display: flex; flex-direction: column; position: relative; overflow: visible"
    content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
  >
    <template #header>
      <node-nav-header
        :failed-only="props.failedOnly"
        @toggle-failed-only="emit('toggle-failed-only')"
        @scroll-top="scrollToTop"
        @scroll-bottom="scrollToBottom"
      />
    </template>
    <div style="display: flex; flex-direction: column; height: 100%; min-height: 0">
      <node-nav-search-input
        :search-text="props.searchText"
        @update:search-text="emit('update:search-text', $event)"
      />
      <dynamic-scroller
        v-if="props.items.length > 0"
        ref="nodeNavScroller"
        :items="props.items"
        key-field="originalIndex"
        :min-item-size="navMinItemSize"
        class="node-nav-scroller"
        @wheel.passive="handleWheel"
      >
        <template #default="{ item, active }">
          <dynamic-scroller-item
            :item="item"
            :active="active"
            :size-dependencies="[
              props.displayMode,
              props.normalizedSearchText ? item.matchHint : '',
              props.normalizedSearchText ? item.matchPreview : '',
            ]"
          >
            <div
              class="node-nav-row"
              :class="{
                'node-nav-row-detailed': props.displayMode === 'detailed',
                'node-nav-row-active': props.selectedNodeId != null && item.node.node_id === props.selectedNodeId,
              }"
              @click="emit('select-node', item.originalIndex)"
            >
              <node-nav-item
                :item="item"
                :display-mode="props.displayMode"
                :normalized-search-text="props.normalizedSearchText"
              />
            </div>
          </dynamic-scroller-item>
        </template>
      </dynamic-scroller>
      <n-empty
        v-else
        :description="props.currentNodesLength > 0 ? props.emptyDescription : '暂无节点数据'"
        style="padding: 24px 0"
      />
    </div>
  </n-card>
</template>

<style scoped>
.node-nav-scroller {
  flex: 1;
  min-height: 0;
  height: 100%;
}

.node-nav-row {
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 8px;
  transition: background-color 0.2s, box-shadow 0.2s;
}

.node-nav-row-detailed {
  padding: 8px 12px;
}

.node-nav-row:hover {
  background: rgba(125, 125, 125, 0.12);
}

.node-nav-row-active {
  background: rgba(99, 226, 183, 0.15);
  box-shadow: inset 0 0 0 1px rgba(99, 226, 183, 0.5);
}
</style>
