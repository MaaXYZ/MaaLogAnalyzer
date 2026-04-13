import { LogParser } from '../core/logParser'
import type { ProtocolEvent } from '../protocol/types'
import { createQueryHelpers } from '../query/helpers'
import type { NodeExecutionRef, QueryRawLine } from '../query/queryTypes'
import { getRawLine, getRawLinesByRefs } from '../raw/store'
import { readScopeIdentityFields } from '../trace/scopeId'
import type { ScopeNode, ScopeStatus } from '../trace/scopeTypes'
import { buildLineEvidence } from './evidenceBuilders'
import { createAnalyzerSessionStore } from './sessionStore'
import type {
  AnalyzerSession,
  AnalyzerToolErrorCode,
  AnalyzerToolHandlerOptions,
  AnalyzerToolResponse,
  AnalyzerSessionStoreLike,
  GetNextListHistoryArgs,
  GetNextListHistoryResult,
  GetNodeTimelineArgs,
  GetNodeTimelineResult,
  GetParentChainArgs,
  GetParentChainResult,
  GetRawLinesArgs,
  GetRawLinesResult,
  GetTaskOverviewArgs,
  GetTaskOverviewResult,
  ParseLogBundleArgs,
  ParseLogBundleInput,
  ParseLogBundleResult,
  ResolvedLogSourceInput,
} from './types'

const NON_ROOT_SCOPE_KINDS = new Set([
  'resource_loading',
  'controller_action',
  'task',
  'pipeline_node',
  'recognition_node',
  'action_node',
  'next_list',
  'recognition',
  'action',
  'wait_freezes',
] as const)

const nowTimestamp = (): number => Date.now()

const ok = <T>(
  data: T,
  warnings: string[],
  startedAt: number,
): AnalyzerToolResponse<T> => ({
  ok: true,
  data,
  meta: {
    duration_ms: Math.max(0, nowTimestamp() - startedAt),
    warnings,
  },
  error: null,
})

const fail = <T>(
  code: AnalyzerToolErrorCode,
  message: string,
  warnings: string[],
  startedAt: number,
): AnalyzerToolResponse<T> => ({
  ok: false,
  data: null,
  meta: {
    duration_ms: Math.max(0, nowTimestamp() - startedAt),
    warnings,
  },
  error: {
    code,
    message,
    retryable: code === 'DATA_NOT_READY' || code === 'INTERNAL_ERROR',
  },
})

const toToolStatus = (
  status: ScopeStatus,
): 'success' | 'failed' | 'running' => {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'failed'
    default:
      return 'running'
  }
}

const toDurationMs = (
  startTs?: string,
  endTs?: string,
): number => {
  if (!startTs || !endTs) return 0
  const startMs = Date.parse(startTs)
  const endMs = Date.parse(endTs)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return 0
  return Math.max(0, endMs - startMs)
}

const readScopeName = (
  scope: ScopeNode,
): string => {
  const payload = scope.payload as Record<string, unknown> | null | undefined
  if (!payload) return ''
  const name = payload.name
  if (typeof name === 'string' && name.length > 0) return name
  const entry = payload.entry
  if (typeof entry === 'string' && entry.length > 0) return entry
  return scope.kind
}

const readScopeEvent = (
  scope: ScopeNode,
  field: 'startEvent' | 'latestEvent' | 'endEvent',
): ProtocolEvent | null => {
  const payload = scope.payload as Record<string, unknown> | null | undefined
  if (!payload) return null
  const event = payload[field]
  if (!event || typeof event !== 'object') return null
  return event as ProtocolEvent
}

const buildWarnings = (
  sources: ResolvedLogSourceInput[],
  taskCount: number,
  eventCount: number,
): string[] => {
  const warnings: string[] = []
  const hasContent = sources.some((source) => source.content.trim().length > 0)
  if (!hasContent) {
    warnings.push('Empty log content.')
  }
  if (eventCount === 0 && hasContent) {
    warnings.push('No !!!OnEventNotify!!! events found in content.')
  }
  if (eventCount > 0 && taskCount === 0) {
    warnings.push('Events were parsed but no task lifecycle was assembled.')
  }
  return warnings
}

const normalizeResolvedSources = (
  input: ParseLogBundleInput,
  resolved: ResolvedLogSourceInput | ResolvedLogSourceInput[] | null | undefined,
  sourceOffsetBase: number,
): Array<{
  content: string
  sourceKey: string
  sourcePath?: string
  inputIndex: number
}> => {
  if (!resolved) return []

  const entries = Array.isArray(resolved) ? resolved : [resolved]
  return entries
    .filter((entry) => typeof entry.content === 'string')
    .map((entry, offset) => {
      const sourcePath = entry.source_path ?? input.path
      const sourceKey = entry.source_key ?? sourcePath ?? `input:${sourceOffsetBase + offset}`
      return {
        content: entry.content,
        sourceKey,
        sourcePath,
        inputIndex: sourceOffsetBase + offset,
      }
    })
}

const findTaskScopes = (
  session: AnalyzerSession,
  taskId: number,
): ScopeNode[] => {
  return session.artifacts.index.taskScopesByTaskId.get(taskId) ?? []
}

const collectPipelineNodeScopesForTask = (
  session: AnalyzerSession,
  taskId?: number,
): ScopeNode[] => {
  const scopes: ScopeNode[] = []
  for (const bucket of session.artifacts.index.pipelineNodeScopesByTaskIdAndNodeId.values()) {
    for (const scope of bucket) {
      if (taskId != null && scope.taskId !== taskId) continue
      scopes.push(scope)
    }
  }
  scopes.sort((left, right) => left.seq - right.seq)
  return scopes
}

const countRecoFailures = (
  session: AnalyzerSession,
  taskId?: number,
): number => {
  let count = 0
  for (const scope of session.artifacts.index.scopeById.values()) {
    if (taskId != null && scope.taskId !== taskId) continue
    if (
      (scope.kind === 'recognition' || scope.kind === 'recognition_node')
      && scope.status === 'failed'
    ) {
      count += 1
    }
  }
  return count
}

const validateLimit = (
  limit: number | undefined,
): string | null => {
  if (limit == null) return null
  return limit >= 0 ? null : 'limit must be >= 0'
}

const resolveSession = (
  store: AnalyzerSessionStoreLike,
  sessionId: string,
): AnalyzerSession | null => {
  return store.get(sessionId) ?? null
}

const resolveNodeExecutions = (
  session: AnalyzerSession,
  taskId: number,
  nodeId: number,
  scopeId?: string,
  occurrenceIndex?: number,
  requireUnique?: boolean,
): {
  executions: NodeExecutionRef[]
  errorCode?: AnalyzerToolErrorCode
  errorMessage?: string
} => {
  const helpers = createQueryHelpers(session.artifacts.index)
  const executions = helpers.findNodeExecutions(taskId, nodeId)
  if (executions.length === 0) {
    return {
      executions: [],
      errorCode: 'NODE_NOT_FOUND',
      errorMessage: `node_id=${nodeId} not found for task_id=${taskId}`,
    }
  }

  if (scopeId) {
    const execution = session.artifacts.index.nodeExecutionByPipelineScopeId.get(scopeId)
    if (!execution || execution.taskId !== taskId || execution.nodeId !== nodeId) {
      return {
        executions: [],
        errorCode: 'SCOPE_NOT_FOUND',
        errorMessage: `scope_id=${scopeId} not found for task_id=${taskId}, node_id=${nodeId}`,
      }
    }
    return { executions: [execution] }
  }

  if (occurrenceIndex != null) {
    const execution = executions.find((item) => item.occurrenceIndex === occurrenceIndex)
    if (!execution) {
      return {
        executions: [],
        errorCode: 'SCOPE_NOT_FOUND',
        errorMessage: `occurrence_index=${occurrenceIndex} not found for task_id=${taskId}, node_id=${nodeId}`,
      }
    }
    return { executions: [execution] }
  }

  if (requireUnique && executions.length > 1) {
    return {
      executions: [],
      errorCode: 'AMBIGUOUS_SCOPE_SELECTOR',
      errorMessage: `multiple node executions found for task_id=${taskId}, node_id=${nodeId}`,
    }
  }

  return requireUnique ? { executions: [executions[0]] } : { executions }
}

const buildTimelineEvidences = (
  session: AnalyzerSession,
  toolName: string,
  items: Array<{
    sourceKey?: string | null
    line?: number | null
    taskId?: number
    nodeId?: number
    scopeId?: string
    occurrenceIndex?: number
  }>,
): GetNodeTimelineResult['evidences'] => {
  if (!session.artifacts.rawLines) return []

  const refs = items
    .filter((item) => item.sourceKey && item.line != null && item.line > 0)
    .map((item) => ({
      sourceKey: item.sourceKey ?? '',
      line: item.line ?? 0,
    }))
  const rawLines = getRawLinesByRefs(session.artifacts.rawLines, refs)
  const itemByLine = new Map<string, typeof items[number]>()
  for (const item of items) {
    if (!item.sourceKey || item.line == null) continue
    itemByLine.set(`${item.sourceKey}:${item.line}`, item)
  }

  return rawLines.map((line) => {
    const matched = itemByLine.get(`${line.sourceKey}:${line.line}`)
    return buildLineEvidence({
      session_id: session.sessionId,
      source_tool: toolName,
      source_key: line.sourceKey,
      line: line.line,
      text: line.text,
      task_id: matched?.taskId,
      node_id: matched?.nodeId,
      scope_id: matched?.scopeId,
      occurrence_index: matched?.occurrenceIndex,
    })
  })
}

const buildTaskEvidences = (
  session: AnalyzerSession,
  taskScopes: ScopeNode[],
): GetTaskOverviewResult['evidences'] => {
  if (!session.artifacts.rawLines || taskScopes.length === 0) return []

  const primaryScope = taskScopes[0]
  const startEvent = readScopeEvent(primaryScope, 'startEvent')
  if (!startEvent) return []

  const rawLine = getRawLine(session.artifacts.rawLines, {
    sourceKey: startEvent.source.sourceKey,
    line: startEvent.source.line,
  })
  if (!rawLine) return []

  return [buildLineEvidence({
    session_id: session.sessionId,
    source_tool: 'get_task_overview',
    source_key: rawLine.sourceKey,
    line: rawLine.line,
    text: rawLine.text,
    task_id: primaryScope.taskId,
    scope_id: primaryScope.id,
    payload: {
      scope_kind: primaryScope.kind,
      status: primaryScope.status,
      name: readScopeName(primaryScope),
    },
  })]
}

const collectTaskRawLines = (
  session: AnalyzerSession,
  taskId: number,
  filter: {
    sourceKey?: string
    keywords?: string[]
    lineStart?: number
    lineEnd?: number
    limit?: number
  },
): QueryRawLine[] => {
  if (!session.artifacts.rawLines) return []

  const helpers = createQueryHelpers(session.artifacts.index)
  const refs = new Map<string, { sourceKey: string; line: number }>()
  for (const scope of findTaskScopes(session, taskId)) {
    const eventsResult = helpers.getScopeEvents(scope.id)
    if (!eventsResult.ok) continue
    for (const event of eventsResult.value) {
      const line = event.source.line
      const sourceKey = event.source.sourceKey
      refs.set(`${sourceKey}:${line}`, { sourceKey, line })
    }
  }

  const rawLines = getRawLinesByRefs(session.artifacts.rawLines, refs.values())
  const filtered = rawLines.filter((line) => {
    if (filter.sourceKey && line.sourceKey !== filter.sourceKey) return false
    if (filter.lineStart != null && line.line < filter.lineStart) return false
    if (filter.lineEnd != null && line.line > filter.lineEnd) return false
    if (filter.keywords && filter.keywords.length > 0) {
      return filter.keywords.every((keyword) => line.text.includes(keyword))
    }
    return true
  })

  return filter.limit != null && filter.limit >= 0
    ? filtered.slice(0, filter.limit)
    : filtered
}

export const createAnalyzerToolHandlers = (
  options: AnalyzerToolHandlerOptions = {},
) => {
  const store = options.store ?? createAnalyzerSessionStore()
  const parseOptions = options.parse_options

  return {
    store,

    async parse_log_bundle(
      args: ParseLogBundleArgs,
    ): Promise<AnalyzerToolResponse<ParseLogBundleResult>> {
      const startedAt = nowTimestamp()

      if (!args.session_id || !Array.isArray(args.inputs)) {
        return fail('INVALID_REQUEST', 'session_id and inputs are required', [], startedAt)
      }
      if (!options.resolve_input) {
        return fail('INVALID_REQUEST', 'input resolver is not configured', [], startedAt)
      }

      try {
        const resolvedInputs: Array<{
          content: string
          sourceKey: string
          sourcePath?: string
          inputIndex: number
        }> = []
        let sourceOffset = 0
        for (const [inputIndex, input] of args.inputs.entries()) {
          const resolved = await options.resolve_input(input, { input_index: inputIndex })
          const normalized = normalizeResolvedSources(input, resolved, sourceOffset)
          sourceOffset += normalized.length
          resolvedInputs.push(...normalized)
        }

        const parser = options.create_parser?.() ?? new LogParser()
        await parser.parseInputs(resolvedInputs, undefined, {
          ...parseOptions,
          storeRawLines: true,
        })
        const artifacts = parser.getParseArtifactsSnapshot()
        const warnings = buildWarnings(
          resolvedInputs.map((input) => ({
            content: input.content,
            source_key: input.sourceKey,
            source_path: input.sourcePath,
          })),
          artifacts.index.taskScopesByTaskId.size,
          artifacts.events.length,
        )
        store.set({
          sessionId: args.session_id,
          artifacts,
          warnings,
          createdAt: options.now?.() ?? new Date().toISOString(),
        })

        return ok({
          session_id: args.session_id,
          task_count: artifacts.index.taskScopesByTaskId.size,
          event_count: artifacts.events.length,
          warnings,
        }, warnings, startedAt)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return fail('INTERNAL_ERROR', message, [], startedAt)
      }
    },

    async get_task_overview(
      args: GetTaskOverviewArgs,
    ): Promise<AnalyzerToolResponse<GetTaskOverviewResult>> {
      const startedAt = nowTimestamp()
      const session = resolveSession(store, args.session_id)
      if (!session) {
        return fail('SESSION_NOT_FOUND', `session_id=${args.session_id} not found`, [], startedAt)
      }

      const warnings = session.warnings
      if (args.task_id != null) {
        const taskScopes = findTaskScopes(session, args.task_id)
        if (taskScopes.length === 0) {
          return fail('TASK_NOT_FOUND', `task_id=${args.task_id} not found`, warnings, startedAt)
        }

        const pipelineScopes = collectPipelineNodeScopesForTask(session, args.task_id)
        const firstScope = taskScopes[0]
        const lastScope = taskScopes[taskScopes.length - 1]
        const firstPayload = firstScope.payload as Record<string, unknown>
        const entry = typeof firstPayload.entry === 'string' ? firstPayload.entry : ''

        return ok({
          task: {
            task_id: args.task_id,
            entry,
            status: toToolStatus(lastScope.status),
            duration_ms: toDurationMs(firstScope.ts, lastScope.endTs ?? lastScope.ts),
          },
          summary: {
            node_count: pipelineScopes.length,
            failed_node_count: pipelineScopes.filter((scope) => scope.status === 'failed').length,
            reco_failed_count: countRecoFailures(session, args.task_id),
          },
          evidences: buildTaskEvidences(session, taskScopes),
        }, warnings, startedAt)
      }

      const pipelineScopes = collectPipelineNodeScopesForTask(session)
      return ok({
        task: null,
        summary: {
          node_count: pipelineScopes.length,
          failed_node_count: pipelineScopes.filter((scope) => scope.status === 'failed').length,
          reco_failed_count: countRecoFailures(session),
        },
        evidences: [],
      }, warnings, startedAt)
    },

    async get_node_timeline(
      args: GetNodeTimelineArgs,
    ): Promise<AnalyzerToolResponse<GetNodeTimelineResult>> {
      const startedAt = nowTimestamp()
      const invalidLimit = validateLimit(args.limit)
      if (invalidLimit) {
        return fail('INVALID_REQUEST', invalidLimit, [], startedAt)
      }

      const session = resolveSession(store, args.session_id)
      if (!session) {
        return fail('SESSION_NOT_FOUND', `session_id=${args.session_id} not found`, [], startedAt)
      }

      const warnings = session.warnings
      const resolution = resolveNodeExecutions(
        session,
        args.task_id,
        args.node_id,
        args.scope_id,
        args.occurrence_index,
      )
      if (resolution.errorCode || resolution.executions.length === 0) {
        return fail(
          resolution.errorCode ?? 'NODE_NOT_FOUND',
          resolution.errorMessage ?? 'node execution not found',
          warnings,
          startedAt,
        )
      }

      const helpers = createQueryHelpers(session.artifacts.index)
      const timelineResult = helpers.getNodeTimeline({
        taskId: args.task_id,
        nodeId: args.node_id,
        scopeId: args.scope_id,
        occurrenceIndex: args.occurrence_index,
      }, args.limit)
      if (!timelineResult.ok) {
        return fail('NODE_NOT_FOUND', timelineResult.message, warnings, startedAt)
      }

      const timeline = (args.limit != null && args.limit >= 0
        ? timelineResult.value.slice(0, args.limit)
        : timelineResult.value)
        .map((item) => ({
          scope_id: item.scopeId,
          occurrence_index: item.occurrenceIndex,
          ts: item.ts,
          event: item.event,
          node_id: item.nodeId ?? args.node_id,
          name: item.name ?? '',
          source_key: item.sourceKey ?? null,
          line: item.line ?? null,
        }))

      return ok({
        timeline,
        evidences: buildTimelineEvidences(session, 'get_node_timeline', timeline.map((item) => ({
          sourceKey: item.source_key,
          line: item.line,
          taskId: args.task_id,
          nodeId: args.node_id,
          scopeId: item.scope_id,
          occurrenceIndex: item.occurrence_index,
        }))),
      }, warnings, startedAt)
    },

    async get_next_list_history(
      args: GetNextListHistoryArgs,
    ): Promise<AnalyzerToolResponse<GetNextListHistoryResult>> {
      const startedAt = nowTimestamp()
      const invalidLimit = validateLimit(args.limit)
      if (invalidLimit) {
        return fail('INVALID_REQUEST', invalidLimit, [], startedAt)
      }

      const session = resolveSession(store, args.session_id)
      if (!session) {
        return fail('SESSION_NOT_FOUND', `session_id=${args.session_id} not found`, [], startedAt)
      }

      const warnings = session.warnings
      const resolution = resolveNodeExecutions(
        session,
        args.task_id,
        args.node_id,
        args.scope_id,
        args.occurrence_index,
      )
      if (resolution.errorCode || resolution.executions.length === 0) {
        return fail(
          resolution.errorCode ?? 'NODE_NOT_FOUND',
          resolution.errorMessage ?? 'node execution not found',
          warnings,
          startedAt,
        )
      }

      const helpers = createQueryHelpers(session.artifacts.index)
      const historyResult = helpers.getNextListHistory({
        taskId: args.task_id,
        nodeId: args.node_id,
        scopeId: args.scope_id,
        occurrenceIndex: args.occurrence_index,
      }, args.limit)
      if (!historyResult.ok) {
        return fail('NODE_NOT_FOUND', historyResult.message, warnings, startedAt)
      }

      const history = (args.limit != null && args.limit >= 0
        ? historyResult.value.slice(0, args.limit)
        : historyResult.value)
        .map((item) => ({
          scope_id: item.scopeId,
          occurrence_index: item.occurrenceIndex,
          source_key: item.sourceKey ?? null,
          line: item.line ?? null,
          candidates: item.candidates.map((candidate) => ({
            name: candidate.name,
            anchor: candidate.anchor,
            jump_back: candidate.jumpBack,
          })),
          outcome: item.outcome,
        }))

      return ok({
        history,
        evidences: buildTimelineEvidences(session, 'get_next_list_history', history.map((item) => ({
          sourceKey: item.source_key,
          line: item.line,
          taskId: args.task_id,
          nodeId: args.node_id,
          scopeId: item.scope_id,
          occurrenceIndex: item.occurrence_index,
        }))),
      }, warnings, startedAt)
    },

    async get_parent_chain(
      args: GetParentChainArgs,
    ): Promise<AnalyzerToolResponse<GetParentChainResult>> {
      const startedAt = nowTimestamp()
      const session = resolveSession(store, args.session_id)
      if (!session) {
        return fail('SESSION_NOT_FOUND', `session_id=${args.session_id} not found`, [], startedAt)
      }

      const warnings = session.warnings
      const resolution = resolveNodeExecutions(
        session,
        args.task_id,
        args.node_id,
        args.scope_id,
        args.occurrence_index,
        true,
      )
      if (resolution.errorCode || resolution.executions.length === 0) {
        return fail(
          resolution.errorCode ?? 'NODE_NOT_FOUND',
          resolution.errorMessage ?? 'node execution not found',
          warnings,
          startedAt,
        )
      }

      const execution = resolution.executions[0]
      const helpers = createQueryHelpers(session.artifacts.index)
      const chainResult = helpers.getParentChain(
        args.scope_id
          ? { scopeId: args.scope_id }
          : { taskId: args.task_id, nodeId: args.node_id, occurrenceIndex: execution.occurrenceIndex },
      )
      if (!chainResult.ok) {
        return fail('SCOPE_NOT_FOUND', chainResult.message, warnings, startedAt)
      }

      const chain = chainResult.value
        .filter((scope) => scope.kind !== 'trace_root' && NON_ROOT_SCOPE_KINDS.has(scope.kind))
        .map((scope, index) => {
          const identity = readScopeIdentityFields(scope.payload)
          return {
            scope_id: scope.id,
            scope_kind: scope.kind,
            task_id: scope.taskId ?? identity.taskId,
            node_id: identity.nodeId,
            name: readScopeName(scope),
            occurrence_index: index === 0 ? execution.occurrenceIndex : undefined,
            relation: (index === 0
              ? 'self'
              : index === 1
                ? 'parent'
                : 'ancestor') as 'self' | 'parent' | 'ancestor',
          }
        })

      return ok({
        chain,
        evidences: buildTimelineEvidences(session, 'get_parent_chain', chain.map((item) => {
          const scope = session.artifacts.index.scopeById.get(item.scope_id)
          const startEvent = scope ? readScopeEvent(scope, 'startEvent') : null
          return {
            sourceKey: startEvent?.source.sourceKey,
            line: startEvent?.source.line,
            taskId: item.task_id,
            nodeId: item.node_id,
            scopeId: item.scope_id,
            occurrenceIndex: item.occurrence_index,
          }
        })),
      }, warnings, startedAt)
    },

    async get_raw_lines(
      args: GetRawLinesArgs,
    ): Promise<AnalyzerToolResponse<GetRawLinesResult>> {
      const startedAt = nowTimestamp()
      const invalidLimit = validateLimit(args.limit)
      if (invalidLimit) {
        return fail('INVALID_REQUEST', invalidLimit, [], startedAt)
      }

      const session = resolveSession(store, args.session_id)
      if (!session) {
        return fail('SESSION_NOT_FOUND', `session_id=${args.session_id} not found`, [], startedAt)
      }

      const warnings = session.warnings
      const taskScopes = findTaskScopes(session, args.task_id)
      if (taskScopes.length === 0) {
        return fail('TASK_NOT_FOUND', `task_id=${args.task_id} not found`, warnings, startedAt)
      }
      if (!session.artifacts.rawLines) {
        return fail('DATA_NOT_READY', 'raw lines are not available for this session', warnings, startedAt)
      }

      const lines = collectTaskRawLines(session, args.task_id, {
        sourceKey: args.source_key,
        keywords: args.keywords,
        lineStart: args.line_start,
        lineEnd: args.line_end,
        limit: args.limit,
      })

      return ok({
        lines: lines.map((line) => ({
          source_key: line.sourceKey,
          line: line.line,
          text: line.text,
        })),
        evidences: lines.map((line) => buildLineEvidence({
          session_id: session.sessionId,
          source_tool: 'get_raw_lines',
          source_key: line.sourceKey,
          line: line.line,
          text: line.text,
          task_id: args.task_id,
        })),
      }, warnings, startedAt)
    },
  }
}
