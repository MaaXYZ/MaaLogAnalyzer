/**
 * j/k 与 ↑/↓ 的目标下标。
 *
 * - isCurrent 负责判定“哪一项是当前项”。**不要用 node_id 单值判定**：Focus / 识别模式下
 *   同一个节点会有多行（节点行 + 各 flow 项），只按 node_id 找会永远命中第一行，于是 j/k
 *   在第一行 ±1 之间打转、走不出去；导航面板因此改用「最后操作过的那一行」的身份；
 * - 两端夹住，不做环绕：到头再按什么都不发生；
 * - 没有当前项时回到第一项；列表为空返回 null。
 */
export const resolveNodeNavStepIndex = <T>(
  items: ReadonlyArray<T>,
  isCurrent: (item: T) => boolean,
  delta: number,
): number | null => {
  if (items.length === 0) return null

  const current = items.findIndex(isCurrent)
  if (current < 0) return 0

  const next = current + delta
  if (next < 0 || next >= items.length) return null

  return next
}
