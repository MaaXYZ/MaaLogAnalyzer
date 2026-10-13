import type { Ref } from 'vue'
import { useHotkeys } from '../../../composables/useHotkeys'
import { resolveNodeNavStepIndex } from '../utils/nodeNavStep'

interface UseNodeNavigationHotkeysOptions<T> {
  /** 键位作用的列表（时间线或导航列表，顺序即界面里从上到下的顺序） */
  items: Ref<ReadonlyArray<T>>
  /** 判定哪一项是当前项。不能用 node_id 单值：Focus/识别模式下同一节点有多行 */
  isCurrent: (item: T) => boolean
  /** 只有当前面板是它时才响应（见 composables/hotkeyPanel.ts） */
  enabled: () => boolean
  onSelect: (item: T, index: number, delta: number) => void
}

/**
 * 节点导航键位：j/↓ 下一个，k/↑ 上一个，两套键同时生效。
 * 具体怎么选中、要不要滚动由调用方决定，因为时间线与导航列表的选中语义不同。
 * 返回 step 供非键盘入口复用（例如搜索框按 Enter 跳下一处、n/N 额外键位）。
 */
export const useNodeNavigationHotkeys = <T>(options: UseNodeNavigationHotkeysOptions<T>) => {
  const step = (delta: number) => {
    const index = resolveNodeNavStepIndex(options.items.value, options.isCurrent, delta)
    if (index == null) return

    const item = options.items.value[index]
    if (item === undefined) return

    options.onSelect(item, index, delta)
  }

  useHotkeys({
    enabled: options.enabled,
    bindings: () => [
      { key: 'j', run: () => step(1) },
      { key: 'ArrowDown', run: () => step(1) },
      { key: 'k', run: () => step(-1) },
      { key: 'ArrowUp', run: () => step(-1) },
    ],
  })

  return { step }
}
