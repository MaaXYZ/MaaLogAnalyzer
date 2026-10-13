import { onActivated, onBeforeUnmount, onDeactivated, onMounted } from 'vue'
import {
  isEditableHotkeyTarget,
  isInteractiveOverlayTarget,
  matchesHotkey,
  type HotkeyHandler,
} from '../utils/hotkeys'

export type { HotkeyHandler } from '../utils/hotkeys'

interface UseHotkeysOptions {
  /** 当前生效的键位表。用函数取，便于随状态（是否实时跟随时、是否有数据）变化 */
  bindings: () => HotkeyHandler[]
  /** 额外的启用条件，例如“当前没有节点就不响应” */
  enabled?: () => boolean
}

/**
 * 把键位挂到 window 上。三条规矩：
 * 1. 文本输入与浮层里的按键默认不抢（见 isEditableHotkeyTarget）；标了 allowInEditable
 *    的键位（Esc 这类取消语义）只避开浮层，在输入框里仍然生效；
 * 2. 已被别人处理过的按键不再处理（event.defaultPrevented），例如顶栏标签的方向键；
 * 3. 视图在 keep-alive 里，切走时停掉监听，避免在别的视图上抢键。
 */
export const useHotkeys = (options: UseHotkeysOptions) => {
  let listening = false

  const handleKeydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.isComposing) return
    if (options.enabled && !options.enabled()) return

    for (const binding of options.bindings()) {
      if (!matchesHotkey(event, binding)) continue

      const guarded =
        binding.allowInEditable === true
          ? isInteractiveOverlayTarget(event.target)
          : isEditableHotkeyTarget(event.target)
      if (guarded) continue

      event.preventDefault()
      binding.run()
      return
    }
  }

  const attach = () => {
    if (listening) return
    listening = true
    window.addEventListener('keydown', handleKeydown)
  }

  const detach = () => {
    if (!listening) return
    listening = false
    window.removeEventListener('keydown', handleKeydown)
  }

  onMounted(attach)
  onBeforeUnmount(detach)
  onActivated(attach)
  onDeactivated(detach)
}
