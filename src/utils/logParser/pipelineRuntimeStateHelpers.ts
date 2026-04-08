import type { NodeInfo } from '../../types'

export const getActiveRunningPipelineNode = (
  activePipelineNodeId: number | null,
  pipelineNodesById: Map<number, NodeInfo>
): NodeInfo | null => {
  if (activePipelineNodeId == null) return null
  const node = pipelineNodesById.get(activePipelineNodeId)
  if (!node || node.status !== 'running') return null
  return node
}

export const upsertPipelineNode = (
  nodes: NodeInfo[],
  pipelineNodesById: Map<number, NodeInfo>,
  node: NodeInfo
): NodeInfo => {
  const existingNode = pipelineNodesById.get(node.node_id)
  if (existingNode) {
    Object.assign(existingNode, node)
    return existingNode
  }
  nodes.push(node)
  pipelineNodesById.set(node.node_id, node)
  return node
}

export const cleanupCurrentTaskPipelineRuntimeState = (params: {
  activePipelineNodeId: number | null
  nodeId: number
  actionId: number | null | undefined
  pipelineNodeStartTimes: Map<number, string>
  actionStartTimes: Map<number, string>
  actionEndTimes: Map<number, string>
  actionStartOrders: Map<number, number>
  actionEndOrders: Map<number, number>
  resetCurrentNodeAggregation: () => void
}): number | null => {
  const nextActivePipelineNodeId = params.activePipelineNodeId === params.nodeId
    ? null
    : params.activePipelineNodeId

  params.pipelineNodeStartTimes.delete(params.nodeId)
  if (params.actionId != null) {
    params.actionStartTimes.delete(params.actionId)
    params.actionEndTimes.delete(params.actionId)
    params.actionStartOrders.delete(params.actionId)
    params.actionEndOrders.delete(params.actionId)
  }
  params.resetCurrentNodeAggregation()

  return nextActivePipelineNodeId
}
