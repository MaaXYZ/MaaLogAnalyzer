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
import {
  findImageByTimestampSuffix,
  findWaitFreezesImages,
} from '../event/imageLookupHelpers'
import type { ScopeNode, ScopeStatus } from '../trace/scopeTypes'

/**
 * Strict trace projector.
 *
 * Keep the projected task tree aligned with trace semantics and avoid legacy UI
 * compatibility shaping here.
 */
interface ProjectionContext {
  currentNodeId?: number
  options: ProjectTasksFromTraceOptions
}

export interface ProjectTasksFromTraceOptions {
  events?: EventNotification[]
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
}

const EMPTY_IMAGE_MAP = new Map<string, string>()

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
  options: ProjectTasksFromTraceOptions,
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
    images: findWaitFreezesImages(
      options.waitFreezesImages ?? EMPTY_IMAGE_MAP,
      scope.endTs ?? scope.ts,
      readScopeName(scope),
    ),
  }
}

const readNestedDetailName = (
  payload: Record<string, unknown>,
  field: string,
): string | undefined => {
  return readStringField(readRecord(payload[field]) ?? {}, 'name')
}

const findErrorImageByNames = (
  options: ProjectTasksFromTraceOptions,
  timestamp: string,
  candidateNames: Array<string | undefined>,
): string | undefined => {
  const source = options.errorImages ?? EMPTY_IMAGE_MAP
  if (source.size === 0) return undefined

  for (const candidate of candidateNames) {
    if (!candidate) continue
    const matched = findImageByTimestampSuffix(source, timestamp, `_${candidate}`)
    if (matched) return matched
  }

  return undefined
}

const resolveScopeErrorImage = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  candidateNames: Array<string | undefined>,
): string | undefined => {
  if (scope.status !== 'failed') return undefined
  return findErrorImageByNames(options, scope.endTs ?? scope.ts, candidateNames)
}

const resolveScopeVisionImage = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  name: string,
  recoId?: number,
): string | undefined => {
  if (recoId == null) return undefined
  return findImageByTimestampSuffix(
    options.visionImages ?? EMPTY_IMAGE_MAP,
    scope.endTs ?? scope.ts,
    `_${name}_${recoId}`,
  )
}

const summarizeFlowItemStatus = (
  items: UnifiedFlowItem[],
): UnifiedFlowItem['status'] => {
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'running')) return 'running'
  return 'success'
}

const shouldSynthesizeForeignTaskGroup = (
  parentScope: ScopeNode,
  childScope: ScopeNode,
): boolean => {
  if (childScope.kind !== 'pipeline_node') return false
  const parentTaskId = readScopeTaskId(parentScope)
  const childTaskId = readScopeTaskId(childScope)
  if (parentTaskId == null || childTaskId == null) return false
  return parentTaskId !== childTaskId
}

const projectSyntheticTaskFlowItem = (
  parentScope: ScopeNode,
  groupedScopes: ScopeNode[],
  context: ProjectionContext,
): UnifiedFlowItem => {
  const firstScope = groupedScopes[0]
  const lastScope = groupedScopes[groupedScopes.length - 1]
  const taskId = readScopeTaskId(firstScope) ?? 0
  const children = groupedScopes.flatMap((scope) => projectFlowScope(scope, context))
  const status = summarizeFlowItemStatus(children)
  const name = readScopeName(firstScope)

  return {
    id: `${parentScope.id}.synthetic-task.${taskId}.seq${firstScope.seq}`,
    type: 'task',
    name,
    status,
    ts: firstScope.ts,
    end_ts: lastScope?.endTs,
    task_id: taskId,
    task_details: {
      task_id: taskId,
      entry: name,
      status: toTaskStatus(
        status === 'running'
          ? 'running'
          : status === 'failed'
            ? 'failed'
            : 'succeeded'
      ),
      ts: firstScope.ts,
      end_ts: lastScope?.endTs,
    },
    children: children.length > 0 ? children : undefined,
  }
}

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

const projectFlowChildren = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem[] => {
  const items: UnifiedFlowItem[] = []
  const children = sortScopesBySeq(scope.children)
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (shouldSynthesizeForeignTaskGroup(scope, child)) {
      const groupedScopes = [child]
      const groupedTaskId = readScopeTaskId(child)
      while (index + 1 < children.length) {
        const next = children[index + 1]
        if (
          !shouldSynthesizeForeignTaskGroup(scope, next) ||
          readScopeTaskId(next) !== groupedTaskId
        ) {
          break
        }
        groupedScopes.push(next)
        index += 1
      }
      items.push(projectSyntheticTaskFlowItem(scope, groupedScopes, context))
      continue
    }

    items.push(...projectFlowScope(child, context))
  }
  return items
}

const projectTaskFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const children = projectFlowChildren(scope, {
    options: context.options,
  })

  return {
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
    children: children.length > 0 ? children : undefined,
  }
}

const projectPipelineNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const nodeName = readScopeName(scope)
  const children = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'pipeline_node',
    name: nodeName,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      nodeName,
      readNestedDetailName(payload, 'actionDetails'),
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectRecognitionFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const name = readScopeName(scope)
  const recoId = readScopeRecoId(scope)
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'recognition',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    reco_id: recoId,
    anchor_name: readStringField(payload, 'anchor'),
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    vision_image: resolveScopeVisionImage(scope, context.options, name, recoId),
    children: children.length > 0 ? children : undefined,
  }
}

const projectRecognitionNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const name = readScopeName(scope)
  const recoId = readScopeRecoId(scope)
  const children = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'recognition_node',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    reco_id: recoId,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    vision_image: resolveScopeVisionImage(scope, context.options, name, recoId),
    children: children.length > 0 ? children : undefined,
  }
}

const projectActionFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const name = readScopeName(scope)
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'action',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    action_id: readScopeActionId(scope),
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'actionDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectActionNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const name = readScopeName(scope)
  const children = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'action_node',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    action_id: readScopeActionId(scope),
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'actionDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectWaitFreezesFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'wait_freezes',
    name: readScopeName(scope),
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: context.currentNodeId,
    wait_freezes_details: normalizeWaitFreezesDetail(scope, context.options),
    children: children.length > 0 ? children : undefined,
  }
}

const projectFlowScope = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem[] => {
  switch (scope.kind) {
    case 'task':
      return [projectTaskFlowItem(scope, context)]
    case 'pipeline_node':
      return [projectPipelineNodeFlowItem(scope, context)]
    case 'recognition':
      return [projectRecognitionFlowItem(scope, context)]
    case 'recognition_node':
      return [projectRecognitionNodeFlowItem(scope, context)]
    case 'action':
      return [projectActionFlowItem(scope, context)]
    case 'action_node':
      return [projectActionNodeFlowItem(scope, context)]
    case 'wait_freezes':
      return [projectWaitFreezesFlowItem(scope, context)]
    case 'next_list':
      return sortScopesBySeq(scope.children).flatMap((child) => projectFlowScope(child, context))
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
  options: ProjectTasksFromTraceOptions,
): NodeInfo => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? 0
  const taskId = readScopeTaskId(scope) ?? 0
  const nodeName = readScopeName(scope)
  const nodeFlow = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options,
  })

  return {
    node_id: nodeId,
    name: nodeName,
    ts: scope.ts,
    end_ts: scope.endTs,
    status: toRuntimeStatus(scope.status),
    task_id: taskId,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    action_details: normalizeActionDetail(payload.actionDetails),
    focus: payload.focus,
    next_list: resolveNodeNextList(scope),
    node_flow: nodeFlow,
    node_details: normalizeNodeDetails(payload.nodeDetails),
    error_image: resolveScopeErrorImage(scope, options, [
      nodeName,
      readNestedDetailName(payload, 'actionDetails'),
      readNestedDetailName(payload, 'recoDetails'),
    ]),
  }
}

const projectTaskScope = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
): TaskInfo => {
  const payload = readScopePayload(scope)
  const pipelineScopes = sortScopesBySeq(scope.children).filter((child) => child.kind === 'pipeline_node')
  const nodes = pipelineScopes.map((pipelineScope) => projectPipelineNodeScope(pipelineScope, options))

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
