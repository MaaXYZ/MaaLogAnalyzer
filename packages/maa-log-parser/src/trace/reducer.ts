import type {
  ActionEvent,
  ActionNodeEvent,
  ControllerActionEvent,
  NextListEvent,
  PipelineNodeEvent,
  ProtocolEvent,
  RecognitionEvent,
  RecognitionNodeEvent,
  ResourceLoadingEvent,
  TaskEvent,
  WaitFreezesEvent,
} from '../protocol/types'
import { createScopeId } from './scopeId'
import type { ScopeKind, ScopeNode, ScopeStatus } from './scopeTypes'

export interface TraceScopePayload extends Record<string, unknown> {
  startEvent: ProtocolEvent
  latestEvent: ProtocolEvent
  endEvent?: ProtocolEvent
}

type TraceScopeNode = ScopeNode<TraceScopePayload>
type TraceRootNode = ScopeNode<Record<string, never>>

interface ReducerState {
  root: TraceRootNode
  openScopes: TraceScopeNode[]
  openScopeStacksByKey: Map<string, TraceScopeNode[]>
  openTaskScopesByTaskId: Map<number, TraceScopeNode[]>
  openPipelineScopesByTaskId: Map<number, TraceScopeNode[]>
  openNextListScopesByTaskId: Map<number, TraceScopeNode[]>
}

const BUSINESS_SCOPE_KINDS = new Set<ScopeKind>([
  'task',
  'pipeline_node',
  'recognition_node',
  'action_node',
  'next_list',
  'recognition',
  'action',
  'wait_freezes',
])

const isBusinessScope = (kind: ScopeKind): boolean => BUSINESS_SCOPE_KINDS.has(kind)

const matchesScopeSource = (
  scope: TraceScopeNode,
  event: ProtocolEvent,
): boolean => {
  const payload = scope.payload as Record<string, unknown>
  return payload.processId === event.processId && payload.threadId === event.threadId
}

const pushMapStack = <K, V>(
  map: Map<K, V[]>,
  key: K,
  value: V,
): void => {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }
  map.set(key, [value])
}

const peekMapStack = <K, V>(
  map: Map<K, V[]>,
  key: K,
): V | null => {
  const current = map.get(key)
  if (!current || current.length === 0) return null
  return current[current.length - 1] ?? null
}

const removeMapStackValue = <K, V>(
  map: Map<K, V[]>,
  key: K,
  value: V,
): void => {
  const current = map.get(key)
  if (!current || current.length === 0) return
  const index = current.lastIndexOf(value)
  if (index < 0) return
  current.splice(index, 1)
  if (current.length === 0) {
    map.delete(key)
  }
}

const removeOpenScope = (
  state: ReducerState,
  scope: TraceScopeNode,
): void => {
  const index = state.openScopes.lastIndexOf(scope)
  if (index >= 0) {
    state.openScopes.splice(index, 1)
  }
}

const toScopeStatus = (
  phase: ProtocolEvent['phase'],
): ScopeStatus => {
  switch (phase) {
    case 'starting':
      return 'running'
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
  }
}

const readTaskId = (
  event:
    | TaskEvent
    | PipelineNodeEvent
    | RecognitionNodeEvent
    | ActionNodeEvent
    | NextListEvent
    | RecognitionEvent
    | ActionEvent
    | WaitFreezesEvent
    | ControllerActionEvent
    | ResourceLoadingEvent,
): number | undefined => ('taskId' in event ? event.taskId : undefined)

const mergeDefinedFields = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const merged = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value
    }
  }
  return merged
}

const buildScopePayload = (
  event: ProtocolEvent,
  existing?: TraceScopePayload,
  endEvent?: ProtocolEvent,
): TraceScopePayload => {
  const merged = mergeDefinedFields(
    (existing ?? {}) as Record<string, unknown>,
    event as unknown as Record<string, unknown>,
  )

  return {
    ...merged,
    startEvent: existing?.startEvent ?? event,
    latestEvent: event,
    endEvent: endEvent ?? existing?.endEvent,
  } as TraceScopePayload
}

const buildScopeKey = (event: ProtocolEvent): string | null => {
  switch (event.kind) {
    case 'resource_loading':
      return event.resId != null ? `resource:${event.resId}` : null
    case 'controller_action':
      return event.ctrlId != null ? `controller:${event.ctrlId}` : null
    case 'task':
      return event.taskId != null ? `task:${event.taskId}` : null
    case 'pipeline_node':
      return event.taskId != null && event.nodeId != null
        ? `task:${event.taskId}:pipeline:${event.nodeId}`
        : null
    case 'recognition_node':
      return event.taskId != null && event.nodeId != null
        ? `task:${event.taskId}:recognition-node:${event.nodeId}`
        : null
    case 'action_node':
      return event.taskId != null && event.nodeId != null
        ? `task:${event.taskId}:action-node:${event.nodeId}`
        : null
    case 'recognition':
      return event.taskId != null && event.recoId != null
        ? `task:${event.taskId}:recognition:${event.recoId}`
        : null
    case 'action':
      return event.taskId != null && event.actionId != null
        ? `task:${event.taskId}:action:${event.actionId}`
        : null
    case 'wait_freezes':
      return event.taskId != null && event.wfId != null
        ? `task:${event.taskId}:wait_freezes:${event.wfId}`
        : null
    case 'next_list':
      return null
  }
}

const attachChild = (
  parent: TraceRootNode | TraceScopeNode,
  child: TraceScopeNode,
): void => {
  parent.children.push(child)
}

const createRootNode = (events: ProtocolEvent[]): TraceRootNode => ({
  id: createScopeId('trace_root', {}, 0),
  kind: 'trace_root',
  status: 'running',
  ts: events[0]?.ts ?? '',
  endTs: events.length > 0 ? events[events.length - 1]?.ts : undefined,
  seq: 0,
  endSeq: events.length > 0 ? events[events.length - 1]?.seq : undefined,
  payload: {},
  children: [],
})

const findNearestOpenBusinessScope = (
  state: ReducerState,
  options: {
    taskId?: number
    event?: ProtocolEvent
  } = {},
): TraceScopeNode | null => {
  for (let index = state.openScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.openScopes[index]
    if (!isBusinessScope(scope.kind)) continue
    if (options.taskId != null && scope.taskId !== options.taskId) continue
    if (options.event && !matchesScopeSource(scope, options.event)) continue
    return scope
  }
  return null
}

const resolveParentScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceRootNode | TraceScopeNode => {
  const taskId = readTaskId(event)

  switch (event.kind) {
    case 'resource_loading':
      return state.root
    case 'controller_action':
      return findNearestOpenBusinessScope(state, { event }) ?? state.root
    case 'task':
      return findNearestOpenBusinessScope(state, { event }) ?? state.root
    case 'pipeline_node':
      return taskId != null
        ? peekMapStack(state.openTaskScopesByTaskId, taskId)
          ?? findNearestOpenBusinessScope(state, { event })
          ?? state.root
        : state.root
    case 'next_list':
      return taskId != null
        ? peekMapStack(state.openPipelineScopesByTaskId, taskId)
          ?? peekMapStack(state.openTaskScopesByTaskId, taskId)
          ?? findNearestOpenBusinessScope(state, { event })
          ?? state.root
        : state.root
    case 'recognition':
      return taskId != null
        ? peekMapStack(state.openNextListScopesByTaskId, taskId)
          ?? findNearestOpenBusinessScope(state, { taskId })
          ?? peekMapStack(state.openTaskScopesByTaskId, taskId)
          ?? state.root
        : state.root
    case 'action':
    case 'wait_freezes':
    case 'recognition_node':
    case 'action_node':
      return taskId != null
        ? findNearestOpenBusinessScope(state, { taskId })
          ?? peekMapStack(state.openTaskScopesByTaskId, taskId)
          ?? findNearestOpenBusinessScope(state, { event })
          ?? state.root
        : state.root
  }
}

const createScopeNode = (
  event: ProtocolEvent,
): TraceScopeNode => ({
  id: createScopeId(event.kind, event, event.seq, readTaskId(event)),
  kind: event.kind,
  status: toScopeStatus(event.phase),
  ts: event.ts,
  endTs: event.phase === 'starting' ? undefined : event.ts,
  seq: event.seq,
  endSeq: event.phase === 'starting' ? undefined : event.seq,
  taskId: readTaskId(event),
  payload: buildScopePayload(event, undefined, event.phase === 'starting' ? undefined : event),
  children: [],
})

const openScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceScopeNode => {
  const scope = createScopeNode(event)
  const parent = resolveParentScope(state, event)
  attachChild(parent, scope)
  state.openScopes.push(scope)

  const scopeKey = buildScopeKey(event)
  if (scopeKey) {
    pushMapStack(state.openScopeStacksByKey, scopeKey, scope)
  }

  const taskId = scope.taskId
  switch (scope.kind) {
    case 'task':
      if (taskId != null) {
        pushMapStack(state.openTaskScopesByTaskId, taskId, scope)
      }
      break
    case 'pipeline_node':
      if (taskId != null) {
        pushMapStack(state.openPipelineScopesByTaskId, taskId, scope)
      }
      break
    case 'next_list':
      if (taskId != null) {
        pushMapStack(state.openNextListScopesByTaskId, taskId, scope)
      }
      break
    default:
      break
  }

  return scope
}

const finalizeScope = (
  state: ReducerState,
  scope: TraceScopeNode,
  event: ProtocolEvent,
): TraceScopeNode => {
  scope.status = toScopeStatus(event.phase)
  scope.endTs = event.ts
  scope.endSeq = event.seq
  scope.payload = buildScopePayload(event, scope.payload, event)

  removeOpenScope(state, scope)

  const scopeKey = buildScopeKey(event)
  if (scopeKey) {
    removeMapStackValue(state.openScopeStacksByKey, scopeKey, scope)
  }

  const taskId = scope.taskId
  switch (scope.kind) {
    case 'task':
      if (taskId != null) {
        removeMapStackValue(state.openTaskScopesByTaskId, taskId, scope)
      }
      break
    case 'pipeline_node':
      if (taskId != null) {
        removeMapStackValue(state.openPipelineScopesByTaskId, taskId, scope)
      }
      break
    case 'next_list':
      if (taskId != null) {
        removeMapStackValue(state.openNextListScopesByTaskId, taskId, scope)
      }
      break
    default:
      break
  }

  return scope
}

const closeScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceScopeNode => {
  const scopeKey = buildScopeKey(event)
  const scope = scopeKey
    ? peekMapStack(state.openScopeStacksByKey, scopeKey)
    : event.kind === 'next_list' && event.taskId != null
      ? peekMapStack(state.openNextListScopesByTaskId, event.taskId)
      : null

  if (!scope) {
    return createSyntheticTerminalScope(state, event)
  }

  return finalizeScope(state, scope, event)
}

const createSyntheticTerminalScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceScopeNode => {
  const scope = createScopeNode(event)
  const parent = resolveParentScope(state, event)
  attachChild(parent, scope)
  return scope
}

const createReducerState = (events: ProtocolEvent[]): ReducerState => ({
  root: createRootNode(events),
  openScopes: [],
  openScopeStacksByKey: new Map(),
  openTaskScopesByTaskId: new Map(),
  openPipelineScopesByTaskId: new Map(),
  openNextListScopesByTaskId: new Map(),
})

export const buildTraceTree = (
  events: ProtocolEvent[],
): TraceRootNode => {
  const state = createReducerState(events)

  for (const event of events) {
    if (event.phase === 'starting') {
      openScope(state, event)
      continue
    }

    closeScope(state, event)
  }

  state.root.endTs = events.length > 0 ? events[events.length - 1]?.ts : state.root.endTs
  state.root.endSeq = events.length > 0 ? events[events.length - 1]?.seq : state.root.endSeq
  return state.root
}
