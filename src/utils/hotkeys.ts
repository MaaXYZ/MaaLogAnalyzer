/**
 * 全局快捷键的匹配与守卫（纯函数，方便单测；DOM 监听见 composables/useHotkeys.ts）。
 *
 * 跨平台的“mod”统一成 Ctrl（Windows/Linux）或 Cmd（macOS），调用方不需要判断系统；
 * 面向用户的按键提示如果需要区分 ⌘/Ctrl，再单独做平台判定。
 */

export interface HotkeyBinding {
  /** 主键：字母大小写不敏感；方向键、Esc 等直接用 event.key 写法（'ArrowDown'、'Escape'） */
  key: string
  /** 需要 Ctrl / Cmd */
  mod?: boolean
  shift?: boolean
  alt?: boolean
  /** 允许在文本输入里生效（Esc 这类“取消/清除”语义）。浮层（下拉、弹窗、抽屉）里仍让路 */
  allowInEditable?: boolean
}

export interface HotkeyEventLike {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

/** 带行为的键位（useHotkeys 消费的形状） */
export interface HotkeyHandler extends HotkeyBinding {
  run: () => void
}

/** 搜索命中的前后跳键位：n 下一个、Shift+n 上一个（匹配要求 shift 完全一致，不会撞车） */
export const buildSearchHitBindings = (step: (delta: number) => void): HotkeyHandler[] => [
  { key: 'n', run: () => step(1) },
  { key: 'n', shift: true, run: () => step(-1) },
]

export const normalizeHotkeyKey = (key: string): string =>
  key.length === 1 ? key.toLowerCase() : key

export const matchesHotkey = (event: HotkeyEventLike, binding: HotkeyBinding): boolean => {
  if (normalizeHotkeyKey(event.key) !== normalizeHotkeyKey(binding.key)) return false

  const hasMod = event.ctrlKey === true || event.metaKey === true
  if (hasMod !== (binding.mod === true)) return false
  if ((event.shiftKey === true) !== (binding.shift === true)) return false
  if ((event.altKey === true) !== (binding.alt === true)) return false

  return true
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT'])

/**
 * 处于这些容器里时，方向键/字母属于控件自己（下拉菜单、弹窗、抽屉），
 * 全局键位要让路，否则会一边选节点一边操作控件。
 */
const INTERACTIVE_OVERLAY_SELECTOR = [
  '.n-base-selection',
  '.n-base-select-menu',
  '.n-dropdown-menu',
  '.n-popover',
  '.n-date-panel',
  '.n-modal',
  '.n-modal-container',
  '.n-drawer',
  '.n-drawer-container',
  '[role="listbox"]',
  '[role="menu"]',
].join(', ')

interface HotkeyTargetLike {
  tagName?: unknown
  isContentEditable?: unknown
  closest?: (selector: string) => unknown
}

const asTarget = (target: unknown): HotkeyTargetLike | null =>
  typeof target === 'object' && target !== null ? (target as HotkeyTargetLike) : null

/** 文本输入类目标：输入框、文本域、下拉框、可编辑区域 */
export const isTextEntryTarget = (target: unknown): boolean => {
  const element = asTarget(target)
  if (!element) return false
  if (typeof element.tagName === 'string' && EDITABLE_TAGS.has(element.tagName.toUpperCase())) {
    return true
  }
  return element.isContentEditable === true
}

/** 浮层目标：下拉菜单、弹窗、抽屉等（这些控件自己要用方向键与 Esc） */
export const isInteractiveOverlayTarget = (target: unknown): boolean => {
  const element = asTarget(target)
  if (!element || typeof element.closest !== 'function') return false
  try {
    return element.closest(INTERACTIVE_OVERLAY_SELECTOR) !== null
  } catch {
    // 非真实 DOM 节点（测试替身）时按“不在浮层里”处理
    return false
  }
}

/** 默认让路条件：文本输入或浮层里都不抢键 */
export const isEditableHotkeyTarget = (target: unknown): boolean =>
  isTextEntryTarget(target) || isInteractiveOverlayTarget(target)
