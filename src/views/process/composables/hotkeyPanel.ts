import { onActivated, onBeforeUnmount, onDeactivated, onMounted, ref } from 'vue'

/**
 * “最后交互过的面板”。j/k 这类成对键位在两个面板里含义不同（时间线顺序 vs 导航列表
 * 当前模式顺序），所以需要知道用户此刻在看/操作哪一个。
 *
 * 判定不用 document.activeElement：导航行、节点卡都是普通 div（不可聚焦），点了它们
 * activeElement 还是 body。改成监听 pointerdown 与 focusin（键盘 Tab 进面板里的输入框
 * 也算），命中带 data-hotkey-panel 的容器就记下来；点在别处（如任务列表）不改变记录。
 */
export const HOTKEY_PANEL_ATTRIBUTE = 'data-hotkey-panel'

export type HotkeyPanel = 'node-nav' | 'node-timeline'

const activePanel = ref<HotkeyPanel>('node-timeline')

export const useActiveHotkeyPanel = () => activePanel

const resolvePanel = (target: unknown): HotkeyPanel | null => {
  if (typeof target !== 'object' || target === null) return null
  const element = target as { closest?: (selector: string) => unknown }
  if (typeof element.closest !== 'function') return null

  try {
    if (element.closest(`[${HOTKEY_PANEL_ATTRIBUTE}="node-nav"]`)) return 'node-nav'
    if (element.closest(`[${HOTKEY_PANEL_ATTRIBUTE}="node-timeline"]`)) return 'node-timeline'
  } catch {
    return null
  }
  return null
}

/** 某个面板此刻是否渲染着（收起/移动端布局下导航面板不存在，此时不该走它的键位） */
export const isHotkeyPanelRendered = (panel: HotkeyPanel): boolean => {
  if (typeof document === 'undefined') return false
  return document.querySelector(`[${HOTKEY_PANEL_ATTRIBUTE}="${panel}"]`) !== null
}

export const useHotkeyPanelTracking = () => {
  let listening = false

  const track = (event: Event) => {
    const panel = resolvePanel(event.target)
    if (panel) {
      activePanel.value = panel
    }
  }

  const attach = () => {
    if (listening) return
    listening = true
    window.addEventListener('pointerdown', track, true)
    window.addEventListener('focusin', track, true)
  }

  const detach = () => {
    if (!listening) return
    listening = false
    window.removeEventListener('pointerdown', track, true)
    window.removeEventListener('focusin', track, true)
  }

  onMounted(attach)
  onBeforeUnmount(detach)
  onActivated(attach)
  onDeactivated(detach)
}
