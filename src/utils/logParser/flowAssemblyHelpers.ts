import type { UnifiedFlowItem } from '../../types'

export const sortFlowItemsByTimestamp = (
  items: UnifiedFlowItem[],
  toTimestampMs: (value?: string) => number
): UnifiedFlowItem[] => {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const delta = toTimestampMs(a.item.ts || a.item.end_ts) - toTimestampMs(b.item.ts || b.item.end_ts)
      if (delta !== 0) return delta
      return a.index - b.index
    })
    .map(({ item }) => item)
}

const findBestRecognitionParentFlowItem = (
  flowItems: UnifiedFlowItem[],
  target: UnifiedFlowItem,
  toTimestampMs: (value?: string) => number
): UnifiedFlowItem | null => {
  const targetTs = toTimestampMs(target.ts || target.end_ts)
  if (!Number.isFinite(targetTs)) return null

  let bestItem: UnifiedFlowItem | null = null
  let bestDepth = -1
  let bestStartMs = Number.NEGATIVE_INFINITY
  const visit = (items: UnifiedFlowItem[], depth: number) => {
    for (const item of items) {
      if (item.type === 'recognition' || item.type === 'recognition_node') {
        const startMs = toTimestampMs(item.ts || item.end_ts)
        const endMs = toTimestampMs(item.end_ts || item.ts)
        const inRange =
          Number.isFinite(startMs) &&
          targetTs >= startMs &&
          (!Number.isFinite(endMs) || targetTs <= endMs + 1)
        if (inRange) {
          if (
            !bestItem ||
            depth > bestDepth ||
            (depth === bestDepth && startMs >= bestStartMs)
          ) {
            bestItem = item
            bestDepth = depth
            bestStartMs = startMs
          }
        }
      }
      if (item.children && item.children.length > 0) {
        visit(item.children, depth + 1)
      }
    }
  }

  visit(flowItems, 0)
  return bestItem
}

const flowParentTypeWeight: Partial<Record<UnifiedFlowItem['type'], number>> = {
  pipeline_node: 50,
  action: 40,
  recognition_node: 35,
  recognition: 30,
  task: 20,
}

const normalizeFlowName = (value?: string): string => {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

const findBestStructuralParentFlowItem = (
  flowItems: UnifiedFlowItem[],
  target: UnifiedFlowItem,
  toTimestampMs: (value?: string) => number
): UnifiedFlowItem | null => {
  const targetTs = toTimestampMs(target.ts || target.end_ts)
  if (!Number.isFinite(targetTs)) return null

  const targetName = normalizeFlowName(target.name)
  let bestItem: UnifiedFlowItem | null = null
  let bestNameMatch = -1
  let bestDepth = -1
  let bestTypeWeight = Number.NEGATIVE_INFINITY
  let bestStartMs = Number.NEGATIVE_INFINITY

  const visit = (items: UnifiedFlowItem[], depth: number) => {
    for (const item of items) {
      if (item.type !== 'wait_freezes') {
        const startMs = toTimestampMs(item.ts || item.end_ts)
        const endMs = toTimestampMs(item.end_ts || item.ts)
        const inRange =
          Number.isFinite(startMs) &&
          targetTs >= startMs &&
          (!Number.isFinite(endMs) || targetTs <= endMs + 1)

        if (inRange) {
          const itemName = normalizeFlowName(item.name)
          const nameMatch = targetName && itemName === targetName ? 1 : 0
          const typeWeight = flowParentTypeWeight[item.type] ?? 0
          const isBetter =
            bestItem == null ||
            nameMatch > bestNameMatch ||
            (nameMatch === bestNameMatch && depth > bestDepth) ||
            (nameMatch === bestNameMatch && depth === bestDepth && typeWeight > bestTypeWeight) ||
            (nameMatch === bestNameMatch && depth === bestDepth && typeWeight === bestTypeWeight && startMs >= bestStartMs)

          if (isBetter) {
            bestItem = item
            bestNameMatch = nameMatch
            bestDepth = depth
            bestTypeWeight = typeWeight
            bestStartMs = startMs
          }
        }
      }

      if (item.children && item.children.length > 0) {
        visit(item.children, depth + 1)
      }
    }
  }

  visit(flowItems, 0)
  return bestItem
}

interface SplitAndAttachWaitFreezesFlowItemsParams {
  recognitionFlow: UnifiedFlowItem[]
  actionFlow: UnifiedFlowItem[]
  waitFreezesFlow: UnifiedFlowItem[]
  toTimestampMs: (value?: string) => number
}

export const splitAndAttachWaitFreezesFlowItems = (
  params: SplitAndAttachWaitFreezesFlowItemsParams
) => {
  const contextItems: UnifiedFlowItem[] = []
  const nonContextItems: UnifiedFlowItem[] = []
  for (const item of params.waitFreezesFlow) {
    const phase = item.wait_freezes_details?.phase
    if (phase === 'context') {
      contextItems.push(item)
    } else {
      nonContextItems.push(item)
    }
  }

  const unassignedContextItems: UnifiedFlowItem[] = []
  for (const wfItem of contextItems) {
    const parent =
      findBestRecognitionParentFlowItem(params.recognitionFlow, wfItem, params.toTimestampMs) ||
      findBestRecognitionParentFlowItem(params.actionFlow, wfItem, params.toTimestampMs)
    if (!parent) {
      unassignedContextItems.push(wfItem)
      continue
    }
    const mergedChildren = sortFlowItemsByTimestamp(
      [
        ...(parent.children ?? []),
        wfItem,
      ],
      params.toTimestampMs
    )
    parent.children = mergedChildren
  }

  const unassignedNonContextItems: UnifiedFlowItem[] = []
  for (const wfItem of nonContextItems) {
    const parent =
      findBestStructuralParentFlowItem(params.actionFlow, wfItem, params.toTimestampMs) ||
      findBestStructuralParentFlowItem(params.recognitionFlow, wfItem, params.toTimestampMs)
    if (!parent) {
      unassignedNonContextItems.push(wfItem)
      continue
    }
    const mergedChildren = sortFlowItemsByTimestamp(
      [
        ...(parent.children ?? []),
        wfItem,
      ],
      params.toTimestampMs
    )
    parent.children = mergedChildren
  }

  return {
    recognitionFlow: params.recognitionFlow,
    actionFlow: params.actionFlow,
    actionScopeWaitFreezes: sortFlowItemsByTimestamp(unassignedNonContextItems, params.toTimestampMs),
    unassignedContextWaitFreezes: sortFlowItemsByTimestamp(unassignedContextItems, params.toTimestampMs),
  }
}

export const partitionActionScopeWaitFreezes = (
  waitFreezesItems: UnifiedFlowItem[],
  toTimestampMs: (value?: string) => number,
  actionStartTs?: string,
  actionEndTs?: string,
  actionStatus?: UnifiedFlowItem['status']
) => {
  const before: UnifiedFlowItem[] = []
  const inside: UnifiedFlowItem[] = []
  const after: UnifiedFlowItem[] = []
  const startMs = toTimestampMs(actionStartTs)
  const endMs = actionStatus === 'running'
    ? Number.POSITIVE_INFINITY
    : toTimestampMs(actionEndTs)
  const hasActionWindow = Number.isFinite(startMs) || Number.isFinite(endMs)

  for (const item of waitFreezesItems) {
    const itemMs = toTimestampMs(item.ts || item.end_ts)

    if (!hasActionWindow) {
      before.push(item)
      continue
    }

    if (Number.isFinite(startMs) && itemMs < startMs) {
      before.push(item)
      continue
    }
    if (Number.isFinite(endMs) && itemMs > endMs + 1) {
      after.push(item)
      continue
    }
    inside.push(item)
  }

  return {
    before: sortFlowItemsByTimestamp(before, toTimestampMs),
    inside: sortFlowItemsByTimestamp(inside, toTimestampMs),
    after: sortFlowItemsByTimestamp(after, toTimestampMs),
  }
}
