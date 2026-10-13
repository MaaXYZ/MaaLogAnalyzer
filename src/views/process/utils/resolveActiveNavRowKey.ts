/**
 * 导航面板里「当前行」的身份。
 *
 * Focus / 识别模式下同一个节点会有多行（节点行 + 各 flow 项），所以不能只用 node_id 定位，
 * 否则要么整列一起高亮、要么 j/k 在第一行 ±1 之间打转。优先级：
 *
 * 1. flow 身份（selectedFlowItemId：点识别行 / 动作行 / flow 项时都会带上）——最精确；
 * 2. 记住的那一行（面板里点过或步进过的行）；
 * 3. 没有 flow 身份的节点行（点节点卡这类节点级选中时优先落在它上面）；
 * 4. 该节点的第一行——兜底，保证多行模式下有且只有一行高亮。
 */
export interface NavRowIdentity {
  navKey: string
  node: { node_id: number }
  targetFlowItemId?: string
}

export const resolveActiveNavRowKey = (
  items: ReadonlyArray<NavRowIdentity>,
  selectedNodeId: number | null,
  selectedFlowItemId: string | null,
  rememberedNavKey: string | null,
): string | null => {
  if (selectedNodeId == null) return null

  const rows = items.filter((item) => item.node.node_id === selectedNodeId)
  if (rows.length === 0) return null

  if (selectedFlowItemId) {
    const byFlow = rows.find((item) => item.targetFlowItemId === selectedFlowItemId)
    if (byFlow) return byFlow.navKey
  }

  if (rememberedNavKey && rows.some((item) => item.navKey === rememberedNavKey)) {
    return rememberedNavKey
  }

  const nodeRow = rows.find((item) => item.targetFlowItemId == null)
  return (nodeRow ?? rows[0]).navKey
}
