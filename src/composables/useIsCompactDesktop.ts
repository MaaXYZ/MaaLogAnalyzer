import { ref } from 'vue'
import type { Ref } from 'vue'

/**
 * 「紧凑桌面」视口：比移动端宽、但装不下四列桌面布局的区间。
 *
 * 1024 是常见的笔记本宽度与 Tauri 默认窗口宽度，落在 769–1100 这个空档里：
 * 移动端断点（768）不生效，于是四列（任务列表 / 节点导航 / 节点时间线 / 详情）
 * 硬挤进 1024，每列都只剩残缺内容（节点导航 86px、详情空面板吃掉 357px）。
 * 这里只提供「是不是紧凑桌面」这一个判断，具体怎么让位由调用方决定，
 * 目前的做法是：首次进入时默认收起详情面板，把宽度还给节点卡片区。
 *
 * 注意：这个模块会被单测（node 环境）间接引入，所以不能在模块顶层碰 window/mediaQuery，
 * 一律懒初始化 + 存在性守卫。
 */
const COMPACT_DESKTOP_BREAKPOINT_WIDTH = 1100
const LAYOUT_STABILIZE_DELAY_MS = 120

const hasDom = () => typeof window !== 'undefined' && typeof document !== 'undefined'

const readViewportWidth = (): number | null => {
  if (!hasDom()) return null
  const candidates = [
    window.visualViewport?.width,
    window.innerWidth,
    document.documentElement?.clientWidth,
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value))

  const width = Math.max(0, ...candidates)
  return width > 0 ? width : null
}

const readStableCompactState = (): boolean | null => {
  if (!hasDom()) return null
  if (document.visibilityState === 'hidden') return null
  const width = readViewportWidth()
  if (width == null) return null
  return width <= COMPACT_DESKTOP_BREAKPOINT_WIDTH
}

const isCompactDesktop = ref(readStableCompactState() ?? false)
let pendingUpdate: ReturnType<typeof setTimeout> | null = null
let listenersBound = false

const commitStableCompactState = () => {
  pendingUpdate = null
  const next = readStableCompactState()
  if (next == null) return
  isCompactDesktop.value = next
}

const scheduleStableCompactUpdate = () => {
  if (pendingUpdate) clearTimeout(pendingUpdate)
  pendingUpdate = setTimeout(commitStableCompactState, LAYOUT_STABILIZE_DELAY_MS)
}

const bindViewportListeners = () => {
  if (listenersBound || !hasDom()) return
  listenersBound = true

  window
    .matchMedia(`(max-width: ${COMPACT_DESKTOP_BREAKPOINT_WIDTH}px)`)
    .addEventListener('change', scheduleStableCompactUpdate)
  window.addEventListener('resize', scheduleStableCompactUpdate)
  window.visualViewport?.addEventListener('resize', scheduleStableCompactUpdate)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleStableCompactUpdate()
  })
}

export function useIsCompactDesktop(): { isCompactDesktop: Ref<boolean> } {
  // 首次真正被组件调用时才订阅，既是懒初始化也顺便保证 node 环境不炸；
  // 订阅完立刻同步读一次，保证调用方拿到的第一帧值就是当前视口的值。
  bindViewportListeners()
  const immediate = readStableCompactState()
  if (immediate != null) isCompactDesktop.value = immediate
  return { isCompactDesktop }
}
