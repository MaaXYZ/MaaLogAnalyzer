import type {
  NodeInfo,
  NestedActionGroup,
  RecognitionAttempt,
  NestedActionNode,
  UnifiedFlowGroup,
  UnifiedFlowItem,
} from '../shared/types'
import { toTimestampMs } from '../shared/timestamp'

const flowTitleMap: Record<UnifiedFlowItem['type'], UnifiedFlowGroup['title']> = {
  pipeline_node: 'PipelineNode',
  recognition: 'Recognition',
  recognition_node: 'RecognitionNode',
  wait_freezes: 'WaitFreezes',
  action: 'Action',
  action_node: 'ActionNode',
  task: 'Task',
}

const flowItemTimestampMs = (item: UnifiedFlowItem): number => {
  return toTimestampMs(item.ts || item.end_ts)
}

const sortFlowItems = (items: UnifiedFlowItem[]): UnifiedFlowItem[] => {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const delta = flowItemTimestampMs(a.item) - flowItemTimestampMs(b.item)
      if (delta !== 0) return delta
      return a.index - b.index
    })
    .map(({ item }) => item)
}

const actionTimelinePhaseWeight = (item: UnifiedFlowItem): number => {
  if (item.type === 'wait_freezes') {
    const phase = item.wait_freezes_details?.phase
    if (phase === 'pre') return 0
    if (phase === 'context') return 5
    if (phase === 'repeat') return 20
    if (phase === 'post') return 40
    return 30
  }
  if (item.type === 'action' || item.type === 'action_node') return 10
  return 15
}

const sortActionTimelineItems = (items: UnifiedFlowItem[]): UnifiedFlowItem[] => {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const timestampDelta = flowItemTimestampMs(a.item) - flowItemTimestampMs(b.item)
      if (timestampDelta !== 0) return timestampDelta
      const phaseDelta = actionTimelinePhaseWeight(a.item) - actionTimelinePhaseWeight(b.item)
      if (phaseDelta !== 0) return phaseDelta
      return a.index - b.index
    })
    .map(({ item }) => item)
}

const sortFlowTree = (item: UnifiedFlowItem): UnifiedFlowItem => {
  if (!item.children || item.children.length === 0) return item
  const sortedChildren = sortFlowItems(item.children).map(sortFlowTree)
  return {
    ...item,
    children: sortedChildren,
  }
}

const mapRecognitionAttempt = (
  attempt: RecognitionAttempt,
  id: string,
  nestedNode = false
): UnifiedFlowItem => {
  const children = (attempt.nested_nodes ?? []).map((nested, nestedIndex) =>
    mapRecognitionAttempt(nested, `${id}.nested.${nestedIndex}`, true)
  )
  return {
    id,
    type: nestedNode ? 'recognition_node' : 'recognition',
    name: attempt.name,
    status: attempt.status,
    ts: attempt.ts,
    end_ts: attempt.end_ts,
    anchor_name: attempt.anchor_name,
    reco_id: attempt.reco_id,
    reco_details: attempt.reco_details,
    error_image: attempt.error_image,
    vision_image: attempt.vision_image,
    children: children.length > 0 ? sortFlowItems(children) : undefined,
  }
}

const mapFlowRecognitionToAttempt = (item: UnifiedFlowItem): RecognitionAttempt => {
  const nestedNodes = (item.children ?? [])
    .filter(child => child.type === 'recognition_node')
    .map(mapFlowRecognitionToAttempt)
  const recoId = item.reco_id ?? item.reco_details?.reco_id
  return {
    reco_id: typeof recoId === 'number' ? recoId : 0,
    name: item.name,
    ts: item.ts,
    end_ts: item.end_ts,
    status: item.status,
    anchor_name: item.anchor_name,
    reco_details: item.reco_details,
    error_image: item.error_image,
    vision_image: item.vision_image,
    nested_nodes: nestedNodes.length > 0 ? nestedNodes : undefined,
  }
}

export const buildRecognitionFlowItems = (attempts: RecognitionAttempt[]): UnifiedFlowItem[] => {
  const roots = attempts.map((attempt, attemptIndex) =>
    mapRecognitionAttempt(attempt, `node.recognition.${attemptIndex}`)
  )
  return sortFlowItems(roots).map(sortFlowTree)
}

const mapActionItem = (
  id: string,
  name: string,
  status: 'success' | 'failed' | 'running',
  startTimestamp: string | undefined,
  endTimestamp: string | undefined,
  actionDetails: UnifiedFlowItem['action_details'],
  actionId?: number,
  type: 'action' | 'action_node' = 'action'
): UnifiedFlowItem => {
  const fallbackTs = startTimestamp || endTimestamp || ''
  return {
    id,
    type,
    name,
    status,
    ts: fallbackTs,
    end_ts: endTimestamp,
    action_id: actionId,
    action_details: actionDetails,
  }
}

const mapEmbeddedFlowItem = (
  item: UnifiedFlowItem,
  itemPath: string
): UnifiedFlowItem => {
  const mappedChildren = (item.children ?? []).map((child, childIndex) =>
    mapEmbeddedFlowItem(child, `${itemPath}.child.${childIndex}`)
  )
  return {
    ...item,
    id: `${itemPath}.${item.type}`,
    children: mappedChildren.length > 0 ? sortFlowItems(mappedChildren) : undefined,
  }
}

const attachChildTasksToActionRoot = (
  items: UnifiedFlowItem[],
  childTaskItems: UnifiedFlowItem[]
): UnifiedFlowItem[] => {
  if (childTaskItems.length === 0) return items

  let attached = false
  const attachRecursively = (nodes: UnifiedFlowItem[]): UnifiedFlowItem[] => {
    return nodes.map((node) => {
      const mappedChildren = node.children ? attachRecursively(node.children) : undefined
      if (!attached && node.type === 'action') {
        attached = true
        return {
          ...node,
          children: sortFlowItems([
            ...(mappedChildren ?? []),
            ...childTaskItems,
          ]),
        }
      }
      if (mappedChildren) {
        return {
          ...node,
          children: mappedChildren,
        }
      }
      return node
    })
  }

  const mappedItems = attachRecursively(items)
  if (attached) return mappedItems
  return sortFlowItems([...mappedItems, ...childTaskItems])
}

const mapNestedPipelineNode = (
  nestedNode: NestedActionNode,
  nodeIndex: number,
  groupPath: string,
  ownerTaskId: number
): UnifiedFlowItem => {
  const baseId = `${groupPath}.pipeline.${nodeIndex}.${nestedNode.node_id}`
  const childTaskItems = (nestedNode.child_tasks ?? []).map((group, childIndex) =>
    mapNestedTaskGroup(group, `${baseId}.task.${childIndex}.${group.task_id}`)
  )
  let children: UnifiedFlowItem[] = []

  if (nestedNode.node_flow && nestedNode.node_flow.length > 0) {
    const scopedNodeFlowChildren = nestedNode.node_flow.map((item, flowIndex) =>
      mapEmbeddedFlowItem(item, `${baseId}.flow.${flowIndex}`)
    )
    children = attachChildTasksToActionRoot(
      sortFlowItems(scopedNodeFlowChildren),
      childTaskItems
    )
  } else {
    const recognitionChildren = (nestedNode.recognitions ?? []).map((attempt, attemptIndex) =>
      mapRecognitionAttempt(attempt, `${baseId}.recognition.${attemptIndex}`)
    )
    const actionChild = nestedNode.action_details
      ? mapActionItem(
          `${baseId}.action.${nestedNode.action_details.action_id ?? nestedNode.node_id}`,
          nestedNode.action_details.name || nestedNode.name,
          nestedNode.status === 'running'
            ? 'running'
            : nestedNode.action_details.success
              ? 'success'
              : 'failed',
          nestedNode.action_details.ts || nestedNode.ts,
          nestedNode.action_details.end_ts || nestedNode.end_ts,
          nestedNode.action_details,
          nestedNode.action_details.action_id,
          'action'
        )
      : null

    const actionChildWithNested = actionChild && childTaskItems.length > 0
      ? { ...actionChild, children: sortFlowItems(childTaskItems) }
      : actionChild
    const pipelineChildren: UnifiedFlowItem[] = [
      ...recognitionChildren,
      ...(actionChildWithNested ? [actionChildWithNested] : childTaskItems),
    ]
    children = sortFlowItems(pipelineChildren)
  }

  return {
    id: baseId,
    type: 'pipeline_node',
    name: nestedNode.name,
    status: nestedNode.status,
    ts: nestedNode.ts || nestedNode.end_ts || '',
    end_ts: nestedNode.end_ts,
    task_id: ownerTaskId,
    node_id: nestedNode.node_id,
    reco_details: nestedNode.reco_details,
    action_details: nestedNode.action_details,
    children: children.length > 0 ? children : undefined,
  }
}

const mapNestedTaskGroup = (
  group: NestedActionGroup,
  groupPath: string
): UnifiedFlowItem => {
  const pipelineChildren = (group.nested_actions ?? []).map((nested, nodeIndex) =>
    mapNestedPipelineNode(nested, nodeIndex, groupPath, group.task_id)
  )
  return {
    id: groupPath,
    type: 'task' as const,
    name: group.name,
    status: group.status,
    ts: group.ts,
    end_ts: group.end_ts,
    task_id: group.task_id,
    task_details: group.task_details,
    children: pipelineChildren.length > 0 ? sortFlowItems(pipelineChildren) : undefined,
  }
}

const buildTaskFlowItemsFromGroups = (
  groups: NestedActionGroup[],
  idPrefix = 'node.task'
): UnifiedFlowItem[] => {
  return groups.map((group, groupIndex) =>
    mapNestedTaskGroup(group, `${idPrefix}.${groupIndex}.${group.task_id}`)
  )
}

export const buildActionFlowItems = (
  actionLevelRecognitionNodes: RecognitionAttempt[],
  nestedActionGroups: NestedActionGroup[]
): UnifiedFlowItem[] => {
  const roots: UnifiedFlowItem[] = []

  const actionLevelRecognitionItems = actionLevelRecognitionNodes.map((attempt, attemptIndex) =>
    mapRecognitionAttempt(attempt, `node.action.recognition.${attemptIndex}`, true)
  )

  const taskItems = buildTaskFlowItemsFromGroups(nestedActionGroups)

  roots.push(...actionLevelRecognitionItems)
  roots.push(...taskItems)

  return sortFlowItems(roots).map(sortFlowTree)
}

export const buildNodeFlowItems = (node: NodeInfo): UnifiedFlowItem[] => {
  return sortFlowItems(node.node_flow ?? []).map(sortFlowTree)
}

export const buildNodeRecognitionFlowItems = (node: NodeInfo): UnifiedFlowItem[] => {
  return buildNodeFlowItems(node).filter(
    item => item.type === 'recognition' || item.type === 'recognition_node'
  )
}

export const buildNodeRecognitionAttempts = (node: NodeInfo): RecognitionAttempt[] => {
  const flowAttempts = buildNodeRecognitionFlowItems(node).map(mapFlowRecognitionToAttempt)
  if (flowAttempts.length > 0) return flowAttempts
  if (!node.reco_details) return []

  const fallbackTimestamp =
    node.action_details?.ts ||
    node.end_ts ||
    node.ts

  return [{
    reco_id: node.reco_details.reco_id,
    name: node.reco_details.name || node.name,
    ts: fallbackTimestamp,
    end_ts: fallbackTimestamp,
    status: node.status === 'running' ? 'running' : 'success',
    reco_details: node.reco_details,
    error_image: node.error_image,
  }]
}

export const buildNodeActionRootItem = (node: NodeInfo): UnifiedFlowItem | null => {
  return buildNodeFlowItems(node).find(
    item => item.type === 'action' || item.type === 'action_node'
  ) || null
}

export const buildNodeWaitFreezesFlowItems = (node: NodeInfo): UnifiedFlowItem[] => {
  const collected: UnifiedFlowItem[] = []
  const visit = (items: UnifiedFlowItem[]) => {
    for (const item of items) {
      if (item.type === 'wait_freezes') {
        collected.push(item)
      }
      if (item.children && item.children.length > 0) {
        visit(item.children)
      }
    }
  }
  visit(buildNodeFlowItems(node))
  return sortFlowItems(collected).map(sortFlowTree)
}

export const buildNodeActionFlowItems = (node: NodeInfo): UnifiedFlowItem[] => {
  const root = buildNodeActionRootItem(node)
  return sortFlowItems(root?.children ?? []).map(sortFlowTree)
}

export const buildNodeActionLevelRecognitionItems = (node: NodeInfo): UnifiedFlowItem[] => {
  return buildNodeActionFlowItems(node).filter(item => item.type === 'recognition_node')
}

export const buildNodeTaskFlowItems = (node: NodeInfo): UnifiedFlowItem[] => {
  return buildNodeActionFlowItems(node).filter(item => item.type === 'task')
}

const buildFallbackActionRootItem = (node: NodeInfo): UnifiedFlowItem | null => {
  if (!node.action_details) return null
  const actionStatus: UnifiedFlowItem['status'] =
    node.status === 'running'
      ? 'running'
      : (node.action_details.success ? 'success' : 'failed')
  const actionTimestamp =
    node.action_details.ts ||
    node.action_details.end_ts ||
    node.end_ts ||
    node.ts

  return {
    id: `node.action.${node.action_details.action_id ?? node.node_id}`,
    type: 'action',
    name: node.action_details.name || node.name,
    status: actionStatus,
    ts: actionTimestamp,
    end_ts: node.action_details.end_ts || node.end_ts,
    action_id: node.action_details.action_id,
    action_details: node.action_details,
    error_image: node.error_image,
  }
}

export const buildNodeActionTimelineItems = (node: NodeInfo): UnifiedFlowItem[] => {
  const nodeFlowItems = buildNodeFlowItems(node)
  const actionRootFromFlow = nodeFlowItems.find(
    item => item.type === 'action' || item.type === 'action_node'
  ) || null
  const actionRootItem = actionRootFromFlow ?? buildFallbackActionRootItem(node)
  const waitFreezesItems = nodeFlowItems.filter(item => item.type === 'wait_freezes')

  const timelineItems: UnifiedFlowItem[] = []
  if (actionRootItem) {
    timelineItems.push(sortFlowTree(actionRootItem))
  }
  timelineItems.push(...waitFreezesItems)

  return sortActionTimelineItems(timelineItems).map(sortFlowTree)
}

export const buildNodeActionRepeatCount = (node: NodeInfo): number | null => {
  const waitFreezesItems = buildNodeWaitFreezesFlowItems(node)
  const repeatWaitFreezesCount = waitFreezesItems.filter(
    item => item.wait_freezes_details?.phase === 'repeat'
  ).length

  const hasActionOrWaitFreezes =
    buildNodeActionRootItem(node) != null ||
    !!node.action_details ||
    waitFreezesItems.length > 0

  if (!hasActionOrWaitFreezes) return null
  return repeatWaitFreezesCount + 1
}

export const groupFlowItemsByType = (items: UnifiedFlowItem[]): UnifiedFlowGroup[] => {
  const groups: UnifiedFlowGroup[] = []
  for (const item of items) {
    const previous = groups.length > 0 ? groups[groups.length - 1] : undefined
    if (previous && previous.type === item.type) {
      previous.items.push(item)
      continue
    }
    groups.push({
      type: item.type,
      title: flowTitleMap[item.type],
      items: [item],
    })
  }
  return groups
}

export const buildNodeFlowGroups = (node: NodeInfo): UnifiedFlowGroup[] => {
  return groupFlowItemsByType(buildNodeFlowItems(node))
}
