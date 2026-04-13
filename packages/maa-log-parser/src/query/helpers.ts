import type { ProtocolEvent } from '../protocol/types'
import { readScopeIdentityFields, resolveScopeLocalId } from '../trace/scopeId'
import type { ScopeNode } from '../trace/scopeTypes'
import {
  buildTaskNodeKey,
  hasScopeId,
  type NodeExecutionLocator,
  type ScopeLocator,
  type UniqueScopeLocator,
} from './locator'
import type {
  NextListHistoryItem,
  NodeExecutionRef,
  QueryErrorCode,
  QueryResult,
  ScopeTimeline,
} from './queryTypes'
import type { TraceIndex } from './traceIndex'

const ok = <T>(value: T): QueryResult<T> => ({ ok: true, value })

const fail = <T>(error: QueryErrorCode, message: string): QueryResult<T> => ({
  ok: false,
  error,
  message,
})

export const findScopeById = (
  index: TraceIndex,
  scopeId: string,
): ScopeNode | null => {
  return index.scopeById.get(scopeId) ?? null
}

export const findScopesByLocator = (
  index: TraceIndex,
  locator: ScopeLocator,
): ScopeNode[] => {
  if (hasScopeId(locator)) {
    const scope = findScopeById(index, locator.scopeId)
    return scope ? [scope] : []
  }

  const matches: ScopeNode[] = []
  for (const scope of index.scopeById.values()) {
    if (scope.kind !== locator.kind) continue
    const scopeTaskId = scope.taskId ?? readScopeIdentityFields(scope.payload).taskId
    if (locator.taskId != null && scopeTaskId !== locator.taskId) continue

    if (locator.localId != null) {
      const localId = resolveScopeLocalId(scope.kind, scope.payload)
      if (localId !== locator.localId) continue
    }

    if (locator.startSeq != null && scope.seq !== locator.startSeq) continue
    matches.push(scope)
  }

  matches.sort((left, right) => left.seq - right.seq)
  return matches
}

export const findNodeExecutions = (
  index: TraceIndex,
  taskId: number,
  nodeId: number,
): NodeExecutionRef[] => {
  return index.nodeExecutionsByTaskIdAndNodeId.get(buildTaskNodeKey(taskId, nodeId)) ?? []
}

export const findNodeExecution = (
  index: TraceIndex,
  locator: UniqueScopeLocator,
): QueryResult<NodeExecutionRef> => {
  if (hasScopeId(locator)) {
    const execution = index.nodeExecutionByPipelineScopeId.get(locator.scopeId)
    if (!execution) {
      return fail('not_found', `pipeline scope not found: ${locator.scopeId}`)
    }
    return ok(execution)
  }

  const executions = findNodeExecutions(index, locator.taskId, locator.nodeId)
  const execution = executions.find((item) => item.occurrenceIndex === locator.occurrenceIndex)
  if (!execution) {
    return fail(
      'not_found',
      `node execution not found: task=${locator.taskId} node=${locator.nodeId} occurrence=${locator.occurrenceIndex}`,
    )
  }

  return ok(execution)
}

const resolveNodeExecutions = (
  index: TraceIndex,
  locator: NodeExecutionLocator,
): QueryResult<NodeExecutionRef[]> => {
  if (hasScopeId(locator)) {
    const execution = index.nodeExecutionByPipelineScopeId.get(locator.scopeId)
    if (!execution) {
      return fail('not_found', `pipeline scope not found: ${locator.scopeId}`)
    }
    return ok([execution])
  }

  if (locator.occurrenceIndex != null) {
    const execution = findNodeExecution(index, {
      taskId: locator.taskId,
      nodeId: locator.nodeId,
      occurrenceIndex: locator.occurrenceIndex,
    })
    return execution.ok ? ok([execution.value]) : execution
  }

  const executions = findNodeExecutions(index, locator.taskId, locator.nodeId)
  if (executions.length === 0) {
    return fail(
      'not_found',
      `node executions not found: task=${locator.taskId} node=${locator.nodeId}`,
    )
  }

  return ok(executions)
}

const scopeContainsSeq = (
  scope: ScopeNode,
  seq: number,
): boolean => {
  const endSeq = scope.endSeq ?? scope.seq
  return seq >= scope.seq && seq <= endSeq
}

const findInnermostScopeAtSeq = (
  scope: ScopeNode,
  seq: number,
): ScopeNode => {
  const sortedChildren = [...scope.children].sort((left, right) => left.seq - right.seq)
  for (const child of sortedChildren) {
    if (!scopeContainsSeq(child, seq)) continue
    return findInnermostScopeAtSeq(child, seq)
  }
  return scope
}

const readScopeName = (scope: ScopeNode): string | undefined => {
  const payload = scope.payload as Record<string, unknown> | null | undefined
  if (!payload) return undefined
  return typeof payload.name === 'string' ? payload.name : undefined
}

const readScopeStartSource = (
  scope: ScopeNode,
): ProtocolEvent['source'] | undefined => {
  const payload = scope.payload as Record<string, unknown> | null | undefined
  if (!payload) return undefined
  const startEvent = payload.startEvent
  if (!startEvent || typeof startEvent !== 'object') return undefined
  const protocolEvent = startEvent as ProtocolEvent
  return protocolEvent.source
}

const collectScopesByKind = (
  scope: ScopeNode,
  kind: ScopeNode['kind'],
  output: ScopeNode[],
): void => {
  for (const child of scope.children) {
    if (child.kind === kind) {
      output.push(child)
    }
    collectScopesByKind(child, kind, output)
  }
}

const toTimelineItems = (
  index: TraceIndex,
  execution: NodeExecutionRef,
  limit?: number,
): ScopeTimeline[] => {
  const pipelineScope = index.scopeById.get(execution.pipelineScopeId)
  if (!pipelineScope) return []

  const eventsResult = getScopeEvents(index, execution.pipelineScopeId)
  if (!eventsResult.ok) return []

  const items = eventsResult.value.map((event) => {
    const matchedScope = findInnermostScopeAtSeq(pipelineScope, event.seq)
    const identity = readScopeIdentityFields(matchedScope.payload)
    return {
      scopeId: matchedScope.id,
      occurrenceIndex: execution.occurrenceIndex,
      ts: event.ts,
      seq: event.seq,
      event: event.rawMessage,
      scopeKind: matchedScope.kind,
      taskId: matchedScope.taskId ?? identity.taskId,
      nodeId: identity.nodeId,
      name: readScopeName(matchedScope),
      sourceKey: event.source.sourceKey,
      line: event.source.line,
    }
  })

  return limit != null && limit >= 0 ? items.slice(0, limit) : items
}

const toNextListHistoryItems = (
  index: TraceIndex,
  execution: NodeExecutionRef,
  limit?: number,
): NextListHistoryItem[] => {
  const pipelineScope = index.scopeById.get(execution.pipelineScopeId)
  if (!pipelineScope) return []

  const nextListScopes: ScopeNode[] = []
  collectScopesByKind(pipelineScope, 'next_list', nextListScopes)
  nextListScopes.sort((left, right) => left.seq - right.seq)

  const items = nextListScopes.map((scope) => {
    const payload = scope.payload as Record<string, unknown> | null | undefined
    const rawCandidates = Array.isArray(payload?.list) ? payload.list : []
    const source = readScopeStartSource(scope)
    const outcome: NextListHistoryItem['outcome'] = scope.status === 'running'
      ? 'unknown'
      : scope.status
    return {
      scopeId: scope.id,
      occurrenceIndex: execution.occurrenceIndex,
      sourceKey: source?.sourceKey,
      line: source?.line,
      candidates: rawCandidates.map((candidate) => {
        const raw = candidate as Record<string, unknown>
        return {
          name: typeof raw.name === 'string' ? raw.name : '',
          anchor: raw.anchor === true,
          jumpBack: raw.jumpBack === true || raw.jump_back === true,
        }
      }),
      outcome,
    }
  })

  return limit != null && limit >= 0 ? items.slice(0, limit) : items
}

export const getParentChain = (
  index: TraceIndex,
  locator: UniqueScopeLocator,
): QueryResult<ScopeNode[]> => {
  const execution = findNodeExecution(index, locator)
  if (!execution.ok) return execution

  const chain: ScopeNode[] = []
  let currentScopeId: string | null = execution.value.pipelineScopeId
  while (currentScopeId) {
    const scope = index.scopeById.get(currentScopeId)
    if (!scope) {
      return fail('not_found', `scope missing from index: ${currentScopeId}`)
    }
    chain.push(scope)
    currentScopeId = index.parentScopeIdByScopeId.get(currentScopeId) ?? null
  }

  return ok(chain)
}

export const getScopeEvents = (
  index: TraceIndex,
  scopeId: string,
): QueryResult<ProtocolEvent[]> => {
  const scope = index.scopeById.get(scopeId)
  if (!scope) {
    return fail('not_found', `scope not found: ${scopeId}`)
  }

  const endSeq = scope.endSeq ?? scope.seq
  const events = [...index.eventBySeq.values()]
    .filter((event) => event.seq >= scope.seq && event.seq <= endSeq)
    .sort((left, right) => left.seq - right.seq)

  return ok(events)
}

export const getNodeTimeline = (
  index: TraceIndex,
  locator: NodeExecutionLocator,
  limit?: number,
): QueryResult<ScopeTimeline[]> => {
  const executions = resolveNodeExecutions(index, locator)
  if (!executions.ok) return executions

  return ok(
    executions.value.flatMap((execution) => toTimelineItems(index, execution, limit)),
  )
}

export const getNextListHistory = (
  index: TraceIndex,
  locator: NodeExecutionLocator,
  limit?: number,
): QueryResult<NextListHistoryItem[]> => {
  const executions = resolveNodeExecutions(index, locator)
  if (!executions.ok) return executions

  return ok(
    executions.value.flatMap((execution) => toNextListHistoryItems(index, execution, limit)),
  )
}

export const createQueryHelpers = (index: TraceIndex) => ({
  findScopeById: (scopeId: string) => findScopeById(index, scopeId),
  findScopesByLocator: (locator: ScopeLocator) => findScopesByLocator(index, locator),
  findNodeExecutions: (taskId: number, nodeId: number) => findNodeExecutions(index, taskId, nodeId),
  findNodeExecution: (locator: UniqueScopeLocator) => findNodeExecution(index, locator),
  getParentChain: (locator: UniqueScopeLocator) => getParentChain(index, locator),
  getNodeTimeline: (locator: NodeExecutionLocator, limit?: number) => getNodeTimeline(index, locator, limit),
  getNextListHistory: (locator: NodeExecutionLocator, limit?: number) => getNextListHistory(index, locator, limit),
  getScopeEvents: (scopeId: string) => getScopeEvents(index, scopeId),
})
