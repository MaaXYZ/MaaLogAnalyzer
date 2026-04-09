import type { NestedActionGroup, NestedActionNode } from '../../types'

const resolveActionEndMsForNesting = (
  node: NestedActionNode,
  toTimestampMs: (value?: string) => number
): number => {
  // Running parent actions should keep accepting later child task starts.
  if (node.status === 'running') return Number.POSITIVE_INFINITY
  return toTimestampMs(node.action_details?.end_ts || node.end_ts || node.ts)
}

const pickParentActionNodeForSubTask = (
  parentGroup: NestedActionGroup,
  childGroup: NestedActionGroup,
  toTimestampMs: (value?: string) => number
): NestedActionNode | null => {
  const childStartMs = toTimestampMs(childGroup.ts)
  type Candidate = {
    node: NestedActionNode
    bucket: number
    customPenalty: number
    distance: number
    startMs: number
  }
  let best: Candidate | null = null

  for (const node of parentGroup.nested_actions ?? []) {
    const startMs = toTimestampMs(node.action_details?.ts || node.ts)
    const endMs = resolveActionEndMsForNesting(node, toTimestampMs)
    const inRange = Number.isFinite(childStartMs) &&
      Number.isFinite(startMs) &&
      childStartMs >= startMs &&
      (!Number.isFinite(endMs) || childStartMs <= endMs + 1)
    const bucket = inRange ? 0 : 1
    const customPenalty = node.action_details?.action === 'Custom' ? 0 : 1
    const distance = Number.isFinite(childStartMs) && Number.isFinite(endMs)
      ? Math.abs(childStartMs - endMs)
      : Number.POSITIVE_INFINITY
    const candidate: Candidate = {
      node,
      bucket,
      customPenalty,
      distance,
      startMs,
    }

    if (!best) {
      best = candidate
      continue
    }
    if (candidate.bucket !== best.bucket) {
      if (candidate.bucket < best.bucket) best = candidate
      continue
    }
    if (candidate.customPenalty !== best.customPenalty) {
      if (candidate.customPenalty < best.customPenalty) best = candidate
      continue
    }
    if (candidate.distance !== best.distance) {
      if (candidate.distance < best.distance) best = candidate
      continue
    }
    if (candidate.startMs > best.startMs) {
      best = candidate
    }
  }

  if (best == null) return null
  return best.node
}

const pickParentActionNodeByTimeline = (
  groups: NestedActionGroup[],
  childGroup: NestedActionGroup,
  toTimestampMs: (value?: string) => number
): NestedActionNode | null => {
  const childStartMs = toTimestampMs(childGroup.ts)
  if (!Number.isFinite(childStartMs)) return null

  let bestNode: NestedActionNode | null = null
  let bestBucket = Number.POSITIVE_INFINITY
  let bestCustomPenalty = Number.POSITIVE_INFINITY
  let bestStartMs = Number.NEGATIVE_INFINITY

  const scanGroup = (group: NestedActionGroup) => {
    for (const node of group.nested_actions ?? []) {
      const actionStartMs = toTimestampMs(node.action_details?.ts || node.ts)
      const actionEndMs = resolveActionEndMsForNesting(node, toTimestampMs)
      const contains =
        Number.isFinite(actionStartMs) &&
        childStartMs >= actionStartMs &&
        (!Number.isFinite(actionEndMs) || childStartMs <= actionEndMs + 1)
      if (contains) {
        const bucket = 0
        const customPenalty = node.action_details?.action === 'Custom' ? 0 : 1
        const isBetter =
          bucket < bestBucket ||
          (bucket === bestBucket && customPenalty < bestCustomPenalty) ||
          (bucket === bestBucket && customPenalty === bestCustomPenalty && actionStartMs > bestStartMs)
        if (isBetter) {
          bestNode = node
          bestBucket = bucket
          bestCustomPenalty = customPenalty
          bestStartMs = actionStartMs
        }
      }

      if (node.child_tasks && node.child_tasks.length > 0) {
        for (const childTask of node.child_tasks) {
          scanGroup(childTask)
        }
      }
    }
  }

  for (const group of groups) {
    if (group.task_id === childGroup.task_id) continue
    scanGroup(group)
  }

  return bestNode
}

const sortNestedTaskGroupTree = (
  group: NestedActionGroup,
  toTimestampMs: (value?: string) => number
) => {
  for (const action of group.nested_actions ?? []) {
    if (action.child_tasks && action.child_tasks.length > 0) {
      action.child_tasks.sort((a, b) => toTimestampMs(a.ts) - toTimestampMs(b.ts))
      for (const child of action.child_tasks) {
        sortNestedTaskGroupTree(child, toTimestampMs)
      }
    }
  }
}

interface NestSubTaskActionGroupsParams {
  groups: NestedActionGroup[]
  rootTaskId: number
  subTaskParentByTaskId: Map<number, number>
  toTimestampMs: (value?: string) => number
  cloneGroup: (group: NestedActionGroup) => NestedActionGroup
}

export const nestSubTaskActionGroups = (params: NestSubTaskActionGroupsParams): NestedActionGroup[] => {
  if (params.groups.length <= 1) return params.groups

  const clonedGroups = params.groups.map(params.cloneGroup)
  const groupByTaskId = new Map<number, NestedActionGroup>()
  for (const group of clonedGroups) {
    groupByTaskId.set(group.task_id, group)
  }

  const roots: NestedActionGroup[] = []
  const orderedGroups = [...clonedGroups].sort((a, b) => params.toTimestampMs(a.ts) - params.toTimestampMs(b.ts))

  for (const group of orderedGroups) {
    const parentTaskId = params.subTaskParentByTaskId.get(group.task_id)
    const parentGroup = (
      parentTaskId != null &&
      parentTaskId !== params.rootTaskId &&
      parentTaskId !== group.task_id
    ) ? groupByTaskId.get(parentTaskId) : undefined
    const parentActionNode = parentGroup
      ? pickParentActionNodeForSubTask(parentGroup, group, params.toTimestampMs)
      : pickParentActionNodeByTimeline(clonedGroups, group, params.toTimestampMs)
    if (!parentActionNode) {
      roots.push(group)
      continue
    }

    const existing = parentActionNode.child_tasks ?? []
    parentActionNode.child_tasks = [...existing, group]
  }

  roots.sort((a, b) => params.toTimestampMs(a.ts) - params.toTimestampMs(b.ts))
  for (const root of roots) {
    sortNestedTaskGroupTree(root, params.toTimestampMs)
  }
  return roots
}
