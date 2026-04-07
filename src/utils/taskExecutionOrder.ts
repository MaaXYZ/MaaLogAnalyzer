import type { NodeInfo } from '../types'

const LOG_TIMESTAMP_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/

const toTimestampMs = (timestamp: string | undefined): number => {
  if (!timestamp) return Number.POSITIVE_INFINITY
  if (!LOG_TIMESTAMP_REGEX.test(timestamp)) return Number.POSITIVE_INFINITY
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

export const sortNodesByGlobalExecutionOrder = (nodes: readonly NodeInfo[]): NodeInfo[] => {
  return nodes
    .map((node, index) => ({
      node,
      index,
      startMs: toTimestampMs(node.ts),
    }))
    .sort((left, right) => {
      const leftFinite = Number.isFinite(left.startMs)
      const rightFinite = Number.isFinite(right.startMs)
      if (leftFinite && rightFinite && left.startMs !== right.startMs) {
        return left.startMs - right.startMs
      }
      if (leftFinite !== rightFinite) {
        return leftFinite ? -1 : 1
      }
      return left.index - right.index
    })
    .map(item => item.node)
}
