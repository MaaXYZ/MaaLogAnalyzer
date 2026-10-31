<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, toRef } from 'vue'
import { useMessage } from 'naive-ui'
import { registerToastMessageApi } from './utils/toast'
import AppHeaderBar from './views/app/components/AppHeaderBar.vue'
import AppOverlayStack from './views/app/components/AppOverlayStack.vue'
import AppMainContent from './views/app/components/AppMainContent.vue'
import HotkeysHelpModal from './views/app/modals/HotkeysHelpModal.vue'
import { useAppRootViewModel } from './views/app/composables/useAppRootViewModel'

// Props
interface Props {
  isDark: boolean
}

const props = withDefaults(defineProps<Props>(), {
  isDark: true,
})

// Emits
const emit = defineEmits<{
  'toggle-theme': []
}>()

// Register the global toast message api so non-component modules can notify.
registerToastMessageApi(useMessage())

// 全局播报区的内容。全站此前没有任何 aria-live：naive-ui 的 message 容器既没有 role
// 也没有 aria-live，所以「加载失败」这类提示对读屏用户完全静音。
const liveAnnouncement = ref('')

const announce = (content: string) => {
  const text = content.trim()
  if (text.length === 0) return
  // 同一条文字连着出现两次时，live region 的内容没变就不会再播报；
  // 先清空、下一帧再写回，保证「同样的错误再来一次」也能被听到。
  if (liveAnnouncement.value === text) {
    liveAnnouncement.value = ''
    void nextTick(() => {
      liveAnnouncement.value = text
    })
    return
  }
  liveAnnouncement.value = text
}

// 提示文案的来源不止 utils/toast：useAppWorkflowBindings 等处直接调 useMessage()，
// 逐个改调用点既容易漏也容易再长出来。这里直接盯 message 容器的新增节点，
// 一处覆盖全部 toast 来源（库不给我们 role，就在外面补一个播报出口）。
let toastObserver: MutationObserver | null = null

onMounted(() => {
  if (typeof MutationObserver === 'undefined') return
  toastObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (!(node instanceof HTMLElement)) continue
        // 容器本身是懒挂载的，第一条提示可能和容器一起插进来，所以两种都要看
        const messageEl = node.classList.contains('n-message')
          ? node
          : node.querySelector('.n-message')
        const text = messageEl?.textContent ?? ''
        if (text.trim().length > 0) announce(text)
      }
    }
  })
  toastObserver.observe(document.body, { childList: true, subtree: true })
})

onBeforeUnmount(() => {
  toastObserver?.disconnect()
  toastObserver = null
})

const {
  isVscodeLaunchEmbed,
  appEmbedMode,
  headerBarProps,
  headerBarEventHandlers,
  mainContentProps,
  mainContentEventHandlers,
  overlayProps,
  overlayEventHandlers,
} = useAppRootViewModel({
  propsIsDark: toRef(props, 'isDark'),
  onToggleTheme: () => emit('toggle-theme'),
})
</script>

<template>
  <div
    class="app-root"
    :class="{ 'app-root--embed-vscode-launch': isVscodeLaunchEmbed }"
    :data-embed-mode="appEmbedMode"
    style="height: 100vh; min-height: 0; display: flex; flex-direction: column; overflow: hidden"
  >
    <app-header-bar v-bind="headerBarProps" v-on="headerBarEventHandlers" />

    <app-main-content v-bind="mainContentProps" v-on="mainContentEventHandlers" />
    <app-overlay-stack v-bind="overlayProps" v-on="overlayEventHandlers" />

    <!-- 自包含：自己管显示状态与 ? 键位，不占 overlay 的 props 链 -->
    <hotkeys-help-modal />

    <!-- 视觉隐藏的状态播报区：不占布局，只给读屏（内容由 toast 镜像进来） -->
    <div class="app-visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {{ liveAnnouncement }}
    </div>
  </div>
</template>
