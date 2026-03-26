import type { TaskInfo, NodeInfo, UnifiedFlowItem } from '../../../../types'

const getLastFlowPathSignature = (items: NodeInfo['node_flow']) => {
  if (!items || items.length === 0) return '0'
  const parts: string[] = [`L${items.length}`]
  let currentItems: UnifiedFlowItem[] | undefined = items

  while (currentItems && currentItems.length > 0) {
    const current: UnifiedFlowItem | undefined = currentItems[currentItems.length - 1]
    if (!current) break
    parts.push(`${current.type}:${current.id}:${current.status}:C${current.children?.length ?? 0}`)
    currentItems = current.children
  }

  return parts.join('>')
}

export const buildFollowTasksFingerprint = (tasks: TaskInfo[]) => {
  return tasks.map((task) => {
    const latestNode = task.nodes[task.nodes.length - 1]
    if (!latestNode) {
      return `${task.task_id}:${task.status}:${task.end_time ?? ''}:N0`
    }
    return [
      task.task_id,
      task.status,
      task.end_time ?? '',
      `N${task.nodes.length}`,
      latestNode.node_id,
      latestNode.status,
      getLastFlowPathSignature(latestNode.node_flow),
    ].join(':')
  }).join('|')
}
