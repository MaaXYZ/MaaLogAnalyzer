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
    // 折叠入口：展开态的把手放在标题栏里（竖排把手只在收起后才出现）
    onToggleNodeNav?: () => void
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

// 行可聚焦：列表是虚拟滚动（同屏只渲染 ~20 行），所以用 roving tabindex ——
// 只有「当前行」是 Tab 站点（tabindex=0），其余 -1，行间用 ↑/↓ 或 j/k 换。
// 这样 Tab 一次就进列表，不会在几百个节点里按几十次 Tab；读屏也终于能一行一行地读，
// 而不是把整列拼成一串没有边界的文本。
const lastFocusedNavKey = ref<string | null>(null)

/** 键盘要落的行：当前行 → 最近聚焦过的行 → 第一行（还没选节点时列表也必须能 Tab 进去） */
const tabStopNavKey = computed(
  () => activeRowKey.value ?? lastFocusedNavKey.value ?? props.items[0]?.navKey ?? null,
)

const rowElementByKey = (key: string): HTMLElement | null => {
  const scrollerEl = getScrollerElement()
  if (!scrollerEl) return null
  const escaped =
    typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(key) : key
  return scrollerEl.querySelector<HTMLElement>(`.node-nav-row[data-nav-key="${escaped}"]`)
}

const handleRowFocus = (item: NodeNavViewItem) => {
  lastFocusedNavKey.value = item.navKey
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

const isRowFocused = () => {
  const focused = document.activeElement as HTMLElement | null
  return focused?.classList.contains('node-nav-row') === true
}

const handleRowKeydown = (event: KeyboardEvent, item: NodeNavViewItem) => {
  // Enter / Space 选中（空格默认会滚整页，必须拦掉）
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectRow(item)
    return
  }

  // ↑/↓ 与 j/k 由行自己处理，不能指望全局热键层：utils/hotkeys.ts 的守卫把
  // [role="listbox"] 整块当成「控件自己的领地」（免得下拉菜单里的方向键被抢），
  // 焦点落进列表后全局 j/k 与方向键都会被让路。而这一行本身就是列表项，
  // 方向键换行正是它该有的语义，所以在这里直接调同一套 stepNavItem，行为与面板层一致。
  const delta = event.key === 'ArrowDown' || event.key === 'j' ? 1 : 0
  const back = event.key === 'ArrowUp' || event.key === 'k' ? -1 : 0
  const move = delta || back
  if (move === 0) return
  event.preventDefault()
  stepNavItem(move)
}

// 键盘换行后把焦点搬到新行：否则焦点还留在旧行上，读屏念的是上一条，
// Tab 出去再 Shift+Tab 回来也会跳回旧位置。
// 只在焦点本来就在列表行上时搬，避免鼠标点选或别处操作时被抢走焦点。
watch(activeRowKey, async (key) => {
  if (!key || !isRowFocused()) return
  await nextTick()
  rowElementByKey(key)?.focus()
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
        :on-toggle-node-nav="props.onToggleNodeNav"
        @update:mode="emit('update:mode', $event)"
        @toggle-failed-only="emit('toggle-failed-only')"
      />
    </template>
    <div class="node-nav-body">
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
        role="listbox"
        aria-label="节点导航列表"
        @pointerdown.capture="cancelScrollRestore"
        @scroll.passive="captureCurrentScrollPosition"
        @wheel.passive="handleWheel"
      >
        <template #default="{ item, active }">
          <dynamic-scroller-item :item="item" :active="active" role="presentation">
            <div
              :title="item.node.name"
              class="node-nav-row"
              role="option"
              :aria-selected="isRowActive(item)"
              :tabindex="item.navKey === tabStopNavKey ? 0 : -1"
              :class="{
                'node-nav-row-detailed': props.displayMode === 'detailed',
                'node-nav-row-active': isRowActive(item),
              }"
              :data-node-id="item.node.node_id"
              :data-nav-key="item.navKey"
              :data-nav-status="item.navStatus"
              @click="selectRow(item)"
              @focus="handleRowFocus(item)"
              @keydown="handleRowKeydown($event, item)"
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
.node-nav-body {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  /* 面板可以被拖宽拖窄：让行内元素按「面板宽度」降级，
     具体降级规则在 NodeNavItem 的 @container 里（窄到 160px 以下先让出时间与 #序号）。 */
  container-type: inline-size;
}

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

/* 行贴着滚动容器的左右边缘，向外扩的焦点环会被裁掉一半，改成向内描边 */
.node-nav-row:focus-visible {
  outline-offset: -2px !important;
}

/* 「识别未命中」和「识别超时」都不是节点失败，共用琥珀色，只能靠形状再区分一层：
   未命中 = 空心菱形。在父组件按 data-nav-status 覆盖，不去动子组件里按状态到类名的映射。 */
.node-nav-row[data-nav-status='not-hit'] :deep(.nav-status-dot) {
  background: transparent;
  border: 1.5px solid var(--app-status-warning);
  border-radius: 2px;
  transform: rotate(45deg);
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
