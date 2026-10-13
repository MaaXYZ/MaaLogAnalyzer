<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { NCard, NEmpty } from 'naive-ui'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import type { DynamicScrollerInstance } from '../../../types/virtualScroller'
import type { NodeNavMode, NodeNavViewItem } from '../composables/useNodeNavSearch'
import NodeNavItem from './NodeNavItem.vue'
import NodeNavHeader from './NodeNavHeader.vue'
import NodeNavSearchInput from './NodeNavSearchInput.vue'
import { useKeepAliveScrollPosition } from '../composables/keepAliveScrollPosition'
import { useHotkeys } from '../../../composables/useHotkeys'
import { buildSearchHitBindings } from '../../../utils/hotkeys'
import { useNodeNavigationHotkeys } from '../composables/useNodeNavigationHotkeys'
import { useActiveHotkeyPanel } from '../composables/hotkeyPanel'
import { resolveActiveNavRowKey } from '../utils/resolveActiveNavRowKey'

const props = withDefaults(
  defineProps<{
    items: NodeNavViewItem[]
    selectedTaskKey?: string | null
    preserveScrollOnActivate?: boolean
    selectedNodeId?: number | null
    selectedFlowItemId?: string | null
    currentNodesLength: number
    displayMode: string
    searchText: string
    normalizedSearchText: string
    mode: NodeNavMode
    failedOnly: boolean
    failedCount: number
    emptyDescription: string
  }>(),
  {
    selectedTaskKey: null,
    selectedFlowItemId: null,
    preserveScrollOnActivate: true,
  },
)

const emit = defineEmits<{
  'update:search-text': [value: string]
  'update:mode': [value: NodeNavMode]
  'toggle-failed-only': []
  'select-item': [item: NodeNavViewItem]
  'manual-scroll-up': []
}>()

const nodeNavScroller = ref<DynamicScrollerInstance | null>(null)

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

const { captureCurrentScrollPosition, cancelScrollRestore } = useKeepAliveScrollPosition({
  getScrollerElement,
  getContextKey: () => props.selectedTaskKey ?? null,
  shouldPreserve: () => props.preserveScrollOnActivate,
})

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
  cancelScrollRestore()
  if (event.deltaY < 0) {
    emit('manual-scroll-up')
  }
}

// 「当前行」的身份：Focus / 识别模式下同一个节点会有多行，只按 node_id 无法区分。
// 优先用 flow 身份（点识别行/动作行时应用会给 selectedFlowItemId），其次记住的行，
// 再退到节点行 / 第一行——高亮与 j/k 起点共用这一个 key。
const lastSelectedNavKey = ref<string | null>(null)

const activeRowKey = computed(() =>
  resolveActiveNavRowKey(
    props.items,
    props.selectedNodeId ?? null,
    props.selectedFlowItemId ?? null,
    lastSelectedNavKey.value,
  ),
)

const isRowActive = (item: NodeNavViewItem): boolean => item.navKey === activeRowKey.value

const selectRow = (item: NodeNavViewItem) => {
  lastSelectedNavKey.value = item.navKey
  emit('select-item', item)
}

// j/↓ k/↑：导航面板聚焦时按导航列表顺序走（含同一节点下的多行）
const activeHotkeyPanel = useActiveHotkeyPanel()
const { step: stepNavItem } = useNodeNavigationHotkeys({
  items: computed(() => props.items),
  isCurrent: (item) => item.navKey === activeRowKey.value,
  enabled: () => activeHotkeyPanel.value === 'node-nav' && props.items.length > 0,
  onSelect: (item, _index, delta) => {
    lastSelectedNavKey.value = item.navKey
    if (delta < 0) {
      emit('manual-scroll-up')
    }
    emit('select-item', item)
  },
})

// 有搜索词时 n/N 在命中里前后跳（列表本身已按搜索词过滤）
useHotkeys({
  enabled: () =>
    activeHotkeyPanel.value === 'node-nav' &&
    props.items.length > 0 &&
    Boolean(props.normalizedSearchText),
  bindings: () => buildSearchHitBindings(stepNavItem),
})

/** 搜索框按 Enter（Shift+Enter 反向）跳到下一处命中 */
const handleSearchNextMatch = (delta: number) => {
  if (!props.normalizedSearchText) return
  stepNavItem(delta)
}

// 当前行变化时让导航列表跟随：仅当它不在可视区域内才滚动
watch(
  () => [activeRowKey.value, props.items] as const,
  async ([rowKey]) => {
    if (!rowKey) return
    await nextTick()

    const index = props.items.findIndex((item) => item.navKey === rowKey)
    if (index < 0) return

    const targetItem = props.items[index]
    const scrollerEl = getScrollerElement()
    if (scrollerEl && targetItem) {
      const rows = scrollerEl.querySelectorAll<HTMLElement>('.node-nav-row')
      const row = Array.from(rows).find((el) => el.dataset.navKey === targetItem.navKey)
      if (row) {
        const rowRect = row.getBoundingClientRect()
        const scrollerRect = scrollerEl.getBoundingClientRect()
        if (rowRect.top >= scrollerRect.top && rowRect.bottom <= scrollerRect.bottom) return
      }
    }
    void safeScrollToItem(index)
  },
  { flush: 'post' },
)

defineExpose({
  scrollToTop,
  scrollToBottom,
})
</script>

<template>
  <n-card
    size="small"
    data-tour="analysis-node-nav"
    data-hotkey-panel="node-nav"
    style="
      height: 100%;
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: visible;
    "
    content-style="padding: 0; flex: 1; min-height: 0; overflow: visible"
  >
    <template #header>
      <node-nav-header
        :failed-only="props.failedOnly"
        :failed-count="props.failedCount"
        :mode="props.mode"
        @update:mode="emit('update:mode', $event)"
        @toggle-failed-only="emit('toggle-failed-only')"
      />
    </template>
    <div style="display: flex; flex-direction: column; height: 100%; min-height: 0">
      <node-nav-search-input
        :search-text="props.searchText"
        @update:search-text="emit('update:search-text', $event)"
        @next-match="handleSearchNextMatch"
        @scroll-top="scrollToTop"
        @scroll-bottom="scrollToBottom"
      />
      <dynamic-scroller
        v-if="props.items.length > 0"
        ref="nodeNavScroller"
        :items="props.items"
        key-field="navKey"
        :min-item-size="navMinItemSize"
        class="node-nav-scroller"
        @pointerdown.capture="cancelScrollRestore"
        @scroll.passive="captureCurrentScrollPosition"
        @wheel.passive="handleWheel"
      >
        <template #default="{ item, active }">
          <dynamic-scroller-item :item="item" :active="active">
            <div
              :title="item.node.name"
              class="node-nav-row"
              :class="{
                'node-nav-row-detailed': props.displayMode === 'detailed',
                'node-nav-row-active': isRowActive(item),
              }"
              :data-node-id="item.node.node_id"
              :data-nav-key="item.navKey"
              @click="selectRow(item)"
            >
              <node-nav-item
                :item="item"
                :mode="props.mode"
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
  transition:
    background-color 0.2s,
    box-shadow 0.2s;
}

.node-nav-row-detailed {
  padding: 8px 12px;
}

.node-nav-row:hover {
  background: rgba(125, 125, 125, 0.12);
}

.node-nav-row-active {
  /* 用当前主题的强调色（与任务列表选中行同一套写法），
     不要再写死深色主题的 #63e2b7 */
  background: rgba(128, 128, 128, 0.16);
  background: color-mix(in srgb, var(--n-color-target) 15%, transparent);
  box-shadow: inset 0 0 0 1px var(--n-color-target);
}
</style>
