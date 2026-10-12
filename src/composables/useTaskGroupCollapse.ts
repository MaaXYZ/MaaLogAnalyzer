import { ref, watch, type Ref } from 'vue'
import type { TaskDateGroup } from '../utils/taskListFormat'

interface UseTaskGroupCollapseOptions {
  groups: Ref<TaskDateGroup[]>
  /** 当前选中的任务下标，-1 表示没有选中 */
  activeIndex: Ref<number>
}

// 日期相同但不相邻的两个分组应各自折叠，所以未知日期用下标兜底区分
const resolveGroupKey = (group: TaskDateGroup): string => group.dateKey || `unknown:${group.id}`

export const useTaskGroupCollapse = ({ groups, activeIndex }: UseTaskGroupCollapseOptions) => {
  const collapsedKeys = ref<Set<string>>(new Set())

  const isCollapsed = (group: TaskDateGroup): boolean =>
    collapsedKeys.value.has(resolveGroupKey(group))

  const toggleGroup = (group: TaskDateGroup) => {
    const key = resolveGroupKey(group)
    const next = new Set(collapsedKeys.value)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
    }
    collapsedKeys.value = next
  }

  // 选中项落进已折叠的分组时自动展开，否则会出现“明明选中了却看不到那一行”
  watch(activeIndex, (index) => {
    if (index < 0) return

    const group = groups.value.find((item) => item.items.some((entry) => entry.index === index))
    if (!group) return

    const key = resolveGroupKey(group)
    if (!collapsedKeys.value.has(key)) return

    const next = new Set(collapsedKeys.value)
    next.delete(key)
    collapsedKeys.value = next
  })

  return {
    isCollapsed,
    toggleGroup,
  }
}
