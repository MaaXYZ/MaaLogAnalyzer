import type { RecognitionAttempt, UnifiedFlowItem } from '../types'

export interface FlattenedFlowItemRow {
  item: UnifiedFlowItem
  depth: number
  hasChildren: boolean
  expanded: boolean
}

export interface FlattenedNestedRecognitionRow {
  attempt: RecognitionAttempt
  flowItemId: string
  depth: number
  hasChildren: boolean
  expanded: boolean
}

export const flattenFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  isExpanded: (flowItemId: string) => boolean,
  depth = 0,
): FlattenedFlowItemRow[] => {
  if (!items || items.length === 0) return []

  const rows: FlattenedFlowItemRow[] = []
  for (const item of items) {
    const hasChildren = !!(item.children && item.children.length > 0)
    const expanded = hasChildren ? isExpanded(item.id) : false
    rows.push({ item, depth, hasChildren, expanded })
    if (hasChildren && expanded) {
      rows.push(...flattenFlowItems(item.children, isExpanded, depth + 1))
    }
  }

  return rows
}

export const flattenNestedRecognitionNodes = (
  attempts: RecognitionAttempt[] | undefined,
  parentFlowItemId: string,
  isExpanded: (flowItemId: string) => boolean,
  depth = 0,
): FlattenedNestedRecognitionRow[] => {
  if (!attempts || attempts.length === 0) return []

  const result: FlattenedNestedRecognitionRow[] = []
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const flowItemId = `${parentFlowItemId}.nested.${i}`
    const hasChildren = !!(attempt.nested_nodes && attempt.nested_nodes.length > 0)
    const expanded = hasChildren ? isExpanded(flowItemId) : false
    result.push({
      attempt,
      flowItemId,
      depth,
      hasChildren,
      expanded,
    })
    if (hasChildren && expanded) {
      result.push(
        ...flattenNestedRecognitionNodes(attempt.nested_nodes, flowItemId, isExpanded, depth + 1),
      )
    }
  }

  return result
}
