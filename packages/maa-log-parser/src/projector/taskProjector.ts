import type {
  ActionDetail,
  EventNotification,
  NextListItem,
  NodeInfo,
  RecognitionDetail,
  TaskInfo,
  UnifiedFlowItem,
  WaitFreezesDetail,
} from '../shared/types'
import { toTimestampMs } from '../shared/timestamp'
import type { ScopeNode, ScopeStatus } from '../trace/scopeTypes'

interface ProjectionContext {
  currentNodeId?: number
  fallbackActionDetail?: ActionDetail
  forceRecognitionNode?: boolean
}

interface ProjectedFlowNode {
  item: UnifiedFlowItem
  seq: number
  endSeq?: number
  children?: ProjectedFlowNode[]
}

export interface ProjectTasksFromTraceOptions {
  events?: EventNotification[]
}

const toTaskStatus = (
  status: ScopeStatus,
): TaskInfo['status'] => {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    default:
      return 'running'
  }
}

const toRuntimeStatus = (
  status: ScopeStatus,
): NodeInfo['status'] => {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'failed'
    default:
      return 'running'
  }
}

const sortScopesBySeq = (
  scopes: ScopeNode[],
): ScopeNode[] => {
  return [...scopes].sort((left, right) => left.seq - right.seq)
}

const sortProjectedFlowBySeq = (
  items: ProjectedFlowNode[],
): ProjectedFlowNode[] => {
  return [...items].sort((left, right) => {
    if (left.seq !== right.seq) return left.seq - right.seq
    return (left.endSeq ?? left.seq) - (right.endSeq ?? right.seq)
  })
}

const readRecord = (
  value: unknown,
): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const readScopePayload = (
  scope: ScopeNode,
): Record<string, unknown> => {
  return readRecord(scope.payload) ?? {}
}

const readStringField = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): string | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'string') return camelValue
  if (snakeField) {
    const snakeValue = record[snakeField]
    if (typeof snakeValue === 'string') return snakeValue
  }
  return undefined
}

const readNumberField = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): number | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'number') return camelValue
  if (snakeField) {
    const snakeValue = record[snakeField]
    if (typeof snakeValue === 'number') return snakeValue
  }
  return undefined
}

const readScopeName = (
  scope: ScopeNode,
): string => {
  const payload = readScopePayload(scope)
  return readStringField(payload, 'name')
    ?? readStringField(payload, 'entry')
    ?? scope.kind
}

const readScopeTaskId = (
  scope: ScopeNode,
): number | undefined => {
  if (scope.taskId != null) return scope.taskId
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'taskId', 'task_id')
}

const readScopeNodeId = (
  scope: ScopeNode,
): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'nodeId', 'node_id')
}

const readScopeRecoId = (
  scope: ScopeNode,
): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'recoId', 'reco_id')
}

const readScopeActionId = (
  scope: ScopeNode,
): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'actionId', 'action_id')
}

const readScopeWaitFreezesId = (
  scope: ScopeNode,
): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'wfId', 'wf_id')
}

const normalizeNextList = (
  value: unknown,
): NextListItem[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = readRecord(item) ?? {}
    return {
      name: readStringField(record, 'name') ?? '',
      anchor: record.anchor === true,
      jump_back: record.jumpBack === true || record.jump_back === true,
    }
  })
}

const normalizeNodeDetails = (
  value: unknown,
): NodeInfo['node_details'] | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  return {
    action_id: readNumberField(record, 'actionId', 'action_id') ?? 0,
    completed: record.completed === true,
    name: readStringField(record, 'name') ?? '',
    node_id: readNumberField(record, 'nodeId', 'node_id') ?? 0,
    reco_id: readNumberField(record, 'recoId', 'reco_id') ?? 0,
  }
}

const normalizeRecognitionDetail = (
  value: unknown,
): RecognitionDetail | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  const box = Array.isArray(record.box) && record.box.length === 4
    ? record.box as [number, number, number, number]
    : null

  return {
    reco_id: readNumberField(record, 'recoId', 'reco_id') ?? 0,
    algorithm: readStringField(record, 'algorithm') ?? '',
    box,
    detail: record.detail,
    name: readStringField(record, 'name') ?? '',
  }
}

const normalizeActionDetail = (
  value: unknown,
): ActionDetail | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  const box = Array.isArray(record.box) && record.box.length === 4
    ? record.box as [number, number, number, number]
    : [0, 0, 0, 0] as [number, number, number, number]

  return {
    action_id: readNumberField(record, 'actionId', 'action_id') ?? 0,
    action: readStringField(record, 'action') ?? '',
    box,
    detail: record.detail,
    name: readStringField(record, 'name') ?? '',
    success: record.success === true,
    ts: readStringField(record, 'ts'),
    end_ts: readStringField(record, 'endTs', 'end_ts'),
  }
}

const normalizeWaitFreezesDetail = (
  scope: ScopeNode,
): WaitFreezesDetail => {
  const payload = readScopePayload(scope)
  const roi = Array.isArray(payload.roi) && payload.roi.length === 4
    ? payload.roi as [number, number, number, number]
    : undefined
  const recoIds = Array.isArray(payload.recoIds)
    ? payload.recoIds.filter((value): value is number => typeof value === 'number')
    : undefined

  return {
    wf_id: readScopeWaitFreezesId(scope) ?? 0,
    phase: readStringField(payload, 'waitPhase', 'phase'),
    elapsed: readNumberField(payload, 'elapsed'),
    reco_ids: recoIds,
    roi,
    param: readRecord(payload.param) as WaitFreezesDetail['param'] | undefined,
    focus: payload.focus,
  }
}

const buildProjectedFlowNode = (
  scope: ScopeNode,
  item: UnifiedFlowItem,
): ProjectedFlowNode => ({
  item,
  seq: scope.seq,
  endSeq: scope.endSeq,
})

const withProjectedChildren = (
  node: ProjectedFlowNode,
  children: ProjectedFlowNode[],
): ProjectedFlowNode => ({
  ...node,
  children: sortProjectedFlowBySeq(children),
  item: {
    ...node.item,
    children: children.length > 0
      ? sortProjectedFlowBySeq(children).map((child) => child.item)
      : undefined,
  },
})

const collectTaskScopes = (
  scope: ScopeNode,
  output: ScopeNode[],
): void => {
  for (const child of scope.children) {
    if (child.kind === 'task') {
      output.push(child)
    }
    collectTaskScopes(child, output)
  }
}

const readTaskEventTaskId = (
  event: EventNotification,
): number | undefined => {
  const details = readRecord(event.details)
  if (!details) return undefined
  return readNumberField(details, 'taskId', 'task_id')
}

const projectTaskEvents = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
): EventNotification[] => {
  const taskId = readScopeTaskId(scope)
  const events = options.events
  if (taskId == null || !events || events.length === 0) return []

  const startMs = toTimestampMs(scope.ts)
  const endMs = scope.endTs ? toTimestampMs(scope.endTs) : Number.POSITIVE_INFINITY

  return events
    .filter((event) => {
      if (readTaskEventTaskId(event) !== taskId) return false
      const eventMs = toTimestampMs(event.timestamp)
      if (!Number.isFinite(startMs) || !Number.isFinite(eventMs)) return true
      return eventMs >= startMs && eventMs <= endMs + 1
    })
    .map((event) => ({
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      details: event.details,
      _lineNumber: event._lineNumber,
    }))
}

const isRecognitionFlowItem = (
  item: UnifiedFlowItem,
): boolean => item.type === 'recognition' || item.type === 'recognition_node'

const collectRecognitionParents = (
  nodes: ProjectedFlowNode[],
  output: Array<{ node: ProjectedFlowNode; depth: number }>,
  depth = 0,
): void => {
  for (const node of nodes) {
    if (isRecognitionFlowItem(node.item)) {
      output.push({ node, depth })
    }
    if (node.children && node.children.length > 0) {
      collectRecognitionParents(node.children, output, depth + 1)
    }
  }
}

const reassignTasksToRecognitionParent = (
  nodes: ProjectedFlowNode[],
): ProjectedFlowNode[] => {
  if (nodes.length === 0) return nodes

  const recognitionParents: Array<{ node: ProjectedFlowNode; depth: number }> = []
  collectRecognitionParents(nodes, recognitionParents)
  if (recognitionParents.length === 0) return nodes

  const retained: ProjectedFlowNode[] = []
  for (const node of nodes) {
    if (node.item.type !== 'task') {
      retained.push(node)
      continue
    }

    let best: { node: ProjectedFlowNode; depth: number } | null = null
    for (const candidate of recognitionParents) {
      const candidateEndSeq = candidate.node.endSeq ?? candidate.node.seq
      const inWindow = node.seq >= candidate.node.seq && node.seq <= candidateEndSeq + 1
      if (!inWindow) continue
      if (
        best == null
        || candidate.depth > best.depth
        || (candidate.depth === best.depth && candidate.node.seq >= best.node.seq)
      ) {
        best = candidate
      }
    }

    if (!best) {
      retained.push(node)
      continue
    }

    const currentChildren = best.node.children ?? []
    best.node.children = sortProjectedFlowBySeq([...currentChildren, node])
    best.node.item = {
      ...best.node.item,
      children: best.node.children.map((child) => child.item),
    }
  }

  return retained
}

const projectTaskFlowScope = (
  scope: ScopeNode,
): ProjectedFlowNode => {
  const payload = readScopePayload(scope)
  const childNodes = sortScopesBySeq(scope.children)
    .flatMap((child) => projectScopeToFlowNodes(child, {}))

  return withProjectedChildren(
    buildProjectedFlowNode(scope, {
      id: scope.id,
      type: 'task',
      name: readStringField(payload, 'entry') ?? readScopeName(scope),
      status: toRuntimeStatus(scope.status),
      ts: scope.ts,
      end_ts: scope.endTs,
      task_id: readScopeTaskId(scope),
      task_details: {
        task_id: readScopeTaskId(scope) ?? 0,
        entry: readStringField(payload, 'entry'),
        hash: readStringField(payload, 'hash'),
        uuid: readStringField(payload, 'uuid'),
        status: toTaskStatus(scope.status),
        ts: scope.ts,
        end_ts: scope.endTs,
      },
    }),
    childNodes,
  )
}

const projectRecognitionFlowScope = (
  scope: ScopeNode,
  context: ProjectionContext,
): ProjectedFlowNode => {
  const payload = readScopePayload(scope)
  const childContext: ProjectionContext = {
    ...context,
    forceRecognitionNode: true,
  }
  const childNodes = sortScopesBySeq(scope.children)
    .flatMap((child) => projectScopeToFlowNodes(child, childContext))
  const type: UnifiedFlowItem['type'] =
    scope.kind === 'recognition_node' || context.forceRecognitionNode
      ? 'recognition_node'
      : 'recognition'

  return withProjectedChildren(
    buildProjectedFlowNode(scope, {
      id: scope.id,
      type,
      name: readScopeName(scope),
      status: toRuntimeStatus(scope.status),
      ts: scope.ts,
      end_ts: scope.endTs,
      reco_id: readScopeRecoId(scope),
      anchor_name: readStringField(payload, 'anchor'),
      reco_details: normalizeRecognitionDetail(payload.recoDetails),
    }),
    childNodes,
  )
}

const projectActionFlowScope = (
  scope: ScopeNode,
  context: ProjectionContext,
): ProjectedFlowNode => {
  const payload = readScopePayload(scope)
  const actionDetail = normalizeActionDetail(payload.actionDetails) ?? context.fallbackActionDetail
  const childContext: ProjectionContext = {
    ...context,
    fallbackActionDetail: actionDetail,
    forceRecognitionNode: true,
  }
  const childNodes = sortScopesBySeq(scope.children)
    .flatMap((child) => projectScopeToFlowNodes(child, childContext))

  return withProjectedChildren(
    buildProjectedFlowNode(scope, {
      id: scope.id,
      type: 'action',
      name: actionDetail?.name || readScopeName(scope),
      status: toRuntimeStatus(scope.status),
      ts: actionDetail?.ts || scope.ts,
      end_ts: actionDetail?.end_ts || scope.endTs,
      action_id: readScopeActionId(scope) ?? actionDetail?.action_id,
      action_details: actionDetail,
    }),
    childNodes,
  )
}

const projectWaitFreezesFlowScope = (
  scope: ScopeNode,
  context: ProjectionContext,
): ProjectedFlowNode => buildProjectedFlowNode(scope, {
  id: scope.id,
  type: 'wait_freezes',
  name: readScopeName(scope),
  status: toRuntimeStatus(scope.status),
  ts: scope.ts,
  end_ts: scope.endTs,
  task_id: readScopeTaskId(scope),
  node_id: context.currentNodeId,
  wait_freezes_details: normalizeWaitFreezesDetail(scope),
})

const createSyntheticActionRoot = (
  scope: ScopeNode,
  context: ProjectionContext,
  children: ProjectedFlowNode[],
): ProjectedFlowNode => {
  const payload = readScopePayload(scope)
  const actionDetail = normalizeActionDetail(payload.actionDetails) ?? context.fallbackActionDetail
  const actionId = actionDetail?.action_id ?? readScopeNodeId(scope) ?? 0
  const syntheticScope: ScopeNode = {
    id: `${scope.id}:synthetic-action`,
    kind: 'action',
    status: scope.status,
    ts: children[0]?.item.ts ?? scope.ts,
    endTs: children[children.length - 1]?.item.end_ts ?? scope.endTs,
    seq: children[0]?.seq ?? scope.seq,
    endSeq: children[children.length - 1]?.endSeq ?? scope.endSeq,
    taskId: scope.taskId,
    payload: {},
    children: [],
  }

  return withProjectedChildren(
    buildProjectedFlowNode(syntheticScope, {
      id: `synthetic-action:${scope.id}`,
      type: 'action',
      name: actionDetail?.name || readScopeName(scope),
      status: actionDetail
        ? (actionDetail.success ? 'success' : 'failed')
        : toRuntimeStatus(scope.status),
      ts: actionDetail?.ts || children[0]?.item.ts || scope.ts,
      end_ts: actionDetail?.end_ts || scope.endTs,
      action_id: actionId,
      action_details: actionDetail,
    }),
    children,
  )
}

const composePipelineFlowChildren = (
  scope: ScopeNode,
  context: ProjectionContext,
  options: {
    allowSyntheticActionRoot: boolean
  },
): ProjectedFlowNode[] => {
  const recognitionRoots: ProjectedFlowNode[] = []
  const directWaitFreezes: ProjectedFlowNode[] = []
  const actionScopeChildren: ProjectedFlowNode[] = []
  const explicitActionRoots: ProjectedFlowNode[] = []

  const classify = (nodes: ProjectedFlowNode[]): void => {
    for (const node of nodes) {
      if (isRecognitionFlowItem(node.item)) {
        recognitionRoots.push(node)
        continue
      }
      if (node.item.type === 'wait_freezes') {
        directWaitFreezes.push(node)
        continue
      }
      if (node.item.type === 'action') {
        explicitActionRoots.push(node)
        continue
      }
      actionScopeChildren.push(node)
    }
  }

  for (const child of sortScopesBySeq(scope.children)) {
    switch (child.kind) {
      case 'next_list':
        classify(sortScopesBySeq(child.children).flatMap((nested) => projectScopeToFlowNodes(nested, context)))
        break
      case 'action_node': {
        const payload = readScopePayload(child)
        const actionNodeContext: ProjectionContext = {
          ...context,
          currentNodeId: readScopeNodeId(child) ?? context.currentNodeId,
          fallbackActionDetail: normalizeActionDetail(payload.actionDetails) ?? context.fallbackActionDetail,
          forceRecognitionNode: true,
        }
        classify(sortScopesBySeq(child.children).flatMap((nested) => projectScopeToFlowNodes(nested, actionNodeContext)))
        break
      }
      default:
        classify(projectScopeToFlowNodes(child, context))
        break
    }
  }

  const orderedRecognitionRoots = sortProjectedFlowBySeq(recognitionRoots)
  const orderedWaitFreezes = sortProjectedFlowBySeq(directWaitFreezes)
  const orderedActionScopeChildren = sortProjectedFlowBySeq(actionScopeChildren)
  const orderedExplicitActionRoots = sortProjectedFlowBySeq(explicitActionRoots)

  let actionRoot: ProjectedFlowNode | null = null
  if (orderedExplicitActionRoots.length === 1) {
    const [root] = orderedExplicitActionRoots
    actionRoot = withProjectedChildren(root, [
      ...(root.children ?? []),
      ...orderedActionScopeChildren,
    ])
  } else if (orderedExplicitActionRoots.length > 1) {
    actionRoot = createSyntheticActionRoot(scope, context, [
      ...orderedExplicitActionRoots,
      ...orderedActionScopeChildren,
    ])
  } else if (orderedActionScopeChildren.length > 0 && options.allowSyntheticActionRoot) {
    actionRoot = createSyntheticActionRoot(scope, context, orderedActionScopeChildren)
  }

  if (!actionRoot) {
    return sortProjectedFlowBySeq([
      ...orderedRecognitionRoots,
      ...orderedWaitFreezes,
      ...orderedActionScopeChildren,
    ])
  }

  if (
    actionRoot.item.action_details == null
    || actionRoot.item.action_details.action === 'Custom'
  ) {
    const reassignedChildren = reassignTasksToRecognitionParent(actionRoot.children ?? [])
    actionRoot = withProjectedChildren(actionRoot, reassignedChildren)
  }

  const before: ProjectedFlowNode[] = []
  const inside: ProjectedFlowNode[] = []
  const after: ProjectedFlowNode[] = []
  const actionEndSeq = actionRoot.endSeq ?? actionRoot.seq
  const actionRunning = actionRoot.item.status === 'running'

  for (const waitFreezes of orderedWaitFreezes) {
    if (waitFreezes.seq < actionRoot.seq) {
      before.push(waitFreezes)
      continue
    }
    if (actionRunning || waitFreezes.seq <= actionEndSeq) {
      inside.push(waitFreezes)
      continue
    }
    after.push(waitFreezes)
  }

  const normalizedActionRoot = inside.length > 0
    ? withProjectedChildren(actionRoot, [
      ...(actionRoot.children ?? []),
      ...inside,
    ])
    : actionRoot

  return sortProjectedFlowBySeq([
    ...orderedRecognitionRoots,
    ...before,
    normalizedActionRoot,
    ...after,
  ])
}

const projectPipelineNodeFlowScope = (
  scope: ScopeNode,
  context: ProjectionContext,
): ProjectedFlowNode => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const actionDetail = normalizeActionDetail(payload.actionDetails) ?? context.fallbackActionDetail
  const childContext: ProjectionContext = {
    currentNodeId: nodeId,
    fallbackActionDetail: actionDetail,
    forceRecognitionNode: false,
  }
  const normalizedChildren = composePipelineFlowChildren(scope, childContext, {
    allowSyntheticActionRoot: actionDetail != null,
  })

  return withProjectedChildren(
    buildProjectedFlowNode(scope, {
      id: scope.id,
      type: 'pipeline_node',
      name: actionDetail?.name || readScopeName(scope),
      status: toRuntimeStatus(scope.status),
      ts: scope.ts,
      end_ts: scope.endTs,
      task_id: readScopeTaskId(scope),
      node_id: nodeId,
      reco_details: normalizeRecognitionDetail(payload.recoDetails),
      action_details: actionDetail,
    }),
    normalizedChildren,
  )
}

const projectScopeToFlowNodes = (
  scope: ScopeNode,
  context: ProjectionContext,
): ProjectedFlowNode[] => {
  switch (scope.kind) {
    case 'task':
      return [projectTaskFlowScope(scope)]
    case 'pipeline_node':
      return [projectPipelineNodeFlowScope(scope, context)]
    case 'recognition':
    case 'recognition_node':
      return [projectRecognitionFlowScope(scope, context)]
    case 'action':
      return [projectActionFlowScope(scope, context)]
    case 'wait_freezes':
      return [projectWaitFreezesFlowScope(scope, context)]
    case 'next_list':
      return sortScopesBySeq(scope.children).flatMap((child) => projectScopeToFlowNodes(child, context))
    case 'action_node': {
      const payload = readScopePayload(scope)
      const nestedContext: ProjectionContext = {
        ...context,
        currentNodeId: readScopeNodeId(scope) ?? context.currentNodeId,
        fallbackActionDetail: normalizeActionDetail(payload.actionDetails) ?? context.fallbackActionDetail,
        forceRecognitionNode: true,
      }
      return sortScopesBySeq(scope.children).flatMap((child) => projectScopeToFlowNodes(child, nestedContext))
    }
    case 'controller_action':
    case 'resource_loading':
    case 'trace_root':
      return []
  }
}

const resolveNodeNextList = (
  scope: ScopeNode,
): NextListItem[] => {
  let nextList: NextListItem[] = []
  for (const child of sortScopesBySeq(scope.children)) {
    if (child.kind !== 'next_list') continue
    const payload = readScopePayload(child)
    nextList = normalizeNextList(payload.list)
  }
  return nextList
}

const projectPipelineNodeScope = (
  scope: ScopeNode,
): NodeInfo => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? 0
  const taskId = readScopeTaskId(scope) ?? 0
  const actionDetail = normalizeActionDetail(payload.actionDetails)
  const nodeFlow = composePipelineFlowChildren(scope, {
    currentNodeId: nodeId,
    fallbackActionDetail: actionDetail,
    forceRecognitionNode: false,
  }, {
    allowSyntheticActionRoot: true,
  })

  return {
    node_id: nodeId,
    name: readScopeName(scope),
    ts: scope.ts,
    end_ts: scope.endTs,
    status: toRuntimeStatus(scope.status),
    task_id: taskId,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    action_details: actionDetail,
    focus: payload.focus,
    next_list: resolveNodeNextList(scope),
    node_flow: nodeFlow.map((item) => item.item),
    node_details: normalizeNodeDetails(payload.nodeDetails),
  }
}

const projectTaskScope = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
): TaskInfo => {
  const payload = readScopePayload(scope)
  const pipelineScopes = sortScopesBySeq(scope.children).filter((child) => child.kind === 'pipeline_node')
  const nodes = pipelineScopes.map(projectPipelineNodeScope)

  return {
    task_id: readScopeTaskId(scope) ?? 0,
    entry: readStringField(payload, 'entry') ?? readScopeName(scope),
    hash: readStringField(payload, 'hash') ?? '',
    uuid: readStringField(payload, 'uuid') ?? '',
    start_time: scope.ts,
    end_time: scope.endTs,
    status: toTaskStatus(scope.status),
    nodes,
    events: projectTaskEvents(scope, options),
    duration: scope.endTs
      ? Math.max(0, Date.parse(scope.endTs) - Date.parse(scope.ts))
      : undefined,
  }
}

export const projectTasksFromTrace = (
  root: ScopeNode,
  options: ProjectTasksFromTraceOptions = {},
): TaskInfo[] => {
  const taskScopes: ScopeNode[] = []
  collectTaskScopes(root, taskScopes)

  return sortScopesBySeq(taskScopes)
    .map((scope) => projectTaskScope(scope, options))
    .filter((task) => task.entry !== 'MaaTaskerPostStop')
}
