import type { NodeInfo } from '@windsland52/maa-log-parser/types'
import {
  resolveNodeExecutionName,
  resolveNodeMatchedRecognitionName,
} from './nodeExecutionName'
import { sortNodesByGlobalExecutionOrder } from './taskExecutionOrder'

export type NodeExecutionNavStatus = NodeInfo['status'] | 'timeout' | 'action-failed'

export interface NodeExecutionTimelineItem {
  index: number
  originalIndex: number
  executionName: string
  navName: string
  navStatus: NodeExecutionNavStatus
  focusNodeId: string
  ts: string
  nodeInfo: NodeInfo
  matchedRecognitionName?: string
}

export interface BuildNodeExecutionTimelineOptions {
  rootTaskId?: number | null
}

const isNodeActionFailed = (node: NodeInfo): boolean => {
  if (node.action_details && node.action_details.success === false) return true
  return (node.node_flow || []).some(
    (item) => (item.type === 'action' || item.type === 'action_node') && item.status === 'failed'
  )
}

export const buildNodeExecutionTimeline = (
  nodes: readonly NodeInfo[],
  options: BuildNodeExecutionTimelineOptions = {},
): NodeExecutionTimelineItem[] => {
  const originalIndexByNode = new Map<NodeInfo, number>()
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index]
    if (!node || originalIndexByNode.has(node)) continue
    originalIndexByNode.set(node, index)
  }

  const filteredNodes = options.rootTaskId == null
    ? [...nodes]
    : nodes.filter((node) => node.task_id === options.rootTaskId)
  const orderedNodes = sortNodesByGlobalExecutionOrder(filteredNodes)

  return orderedNodes.map((node, index) => {
    const executionName = resolveNodeExecutionName(node)
    const matchedRecognitionName = resolveNodeMatchedRecognitionName(node)
    const focusNodeId = matchedRecognitionName ?? executionName
    const originalIndex = originalIndexByNode.get(node) ?? index

    if (matchedRecognitionName && isNodeActionFailed(node)) {
      return {
        index,
        originalIndex,
        executionName,
        navName: `动作失败: ${matchedRecognitionName}`,
        navStatus: 'action-failed',
        focusNodeId,
        ts: node.ts,
        nodeInfo: node,
        matchedRecognitionName,
      }
    }

    if (matchedRecognitionName) {
      return {
        index,
        originalIndex,
        executionName,
        navName: matchedRecognitionName,
        navStatus: node.status,
        focusNodeId,
        ts: node.ts,
        nodeInfo: node,
        matchedRecognitionName,
      }
    }

    if (node.status === 'failed') {
      return {
        index,
        originalIndex,
        executionName,
        navName: '未命中（识别超时）',
        navStatus: 'timeout',
        focusNodeId,
        ts: node.ts,
        nodeInfo: node,
      }
    }

    if (node.status === 'running') {
      return {
        index,
        originalIndex,
        executionName,
        navName: '未命中（识别中）',
        navStatus: 'running',
        focusNodeId,
        ts: node.ts,
        nodeInfo: node,
      }
    }

    return {
      index,
      originalIndex,
      executionName,
      navName: executionName,
      navStatus: node.status,
      focusNodeId,
      ts: node.ts,
      nodeInfo: node,
    }
  })
}
