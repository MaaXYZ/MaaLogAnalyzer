/**
 * [ / ] 切换任务的目标下标：按任务列表顺序前后走一格。
 *
 * - 两端夹住，不做环绕（与节点导航一致）；
 * - 没有有效当前项（初始 -1 或越界）时回到第一个任务；
 * - 没有任务返回 null。
 */
export const resolveTaskNavStepIndex = (
  taskCount: number,
  activeIndex: number,
  delta: number,
): number | null => {
  if (taskCount <= 0) return null
  // 没有有效当前项时两个方向都回到第一个任务（与节点导航的规则一致）
  if (activeIndex < 0 || activeIndex >= taskCount) return 0

  const next = activeIndex + delta
  if (next < 0 || next >= taskCount) return null

  return next
}
