import { createAnalyzerToolHandlers } from './toolHandlers'
import type {
  AnalyzerToolErrorCode,
  AnalyzerToolHandlerOptions,
  AnalyzerToolResponse,
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
  ParseLogBundleResult,
} from './types'

export const ANALYZER_TOOL_API_VERSION = 'v1' as const

export interface AnalyzerToolDefinitionMap {
  parse_log_bundle: {
    args: ParseLogBundleArgs
    result: ParseLogBundleResult
  }
  get_task_overview: {
    args: GetTaskOverviewArgs
    result: GetTaskOverviewResult
  }
  get_node_timeline: {
    args: GetNodeTimelineArgs
    result: GetNodeTimelineResult
  }
  get_next_list_history: {
    args: GetNextListHistoryArgs
    result: GetNextListHistoryResult
  }
  get_parent_chain: {
    args: GetParentChainArgs
    result: GetParentChainResult
  }
  get_raw_lines: {
    args: GetRawLinesArgs
    result: GetRawLinesResult
  }
}

export type AnalyzerToolName = keyof AnalyzerToolDefinitionMap

export type AnalyzerToolProtocolRequest<TName extends AnalyzerToolName = AnalyzerToolName> =
  TName extends AnalyzerToolName
    ? {
        request_id: string
        api_version: typeof ANALYZER_TOOL_API_VERSION
        tool: TName
        args: AnalyzerToolDefinitionMap[TName]['args']
      }
    : never

export type AnalyzerToolResult = AnalyzerToolDefinitionMap[AnalyzerToolName]['result']

export type AnalyzerToolProtocolResponse<T = AnalyzerToolResult> = {
  request_id: string | null
  api_version: typeof ANALYZER_TOOL_API_VERSION
} & AnalyzerToolResponse<T>

const TOOL_NAMES = new Set<AnalyzerToolName>([
  'parse_log_bundle',
  'get_task_overview',
  'get_node_timeline',
  'get_next_list_history',
  'get_parent_chain',
  'get_raw_lines',
])

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const isToolName = (value: unknown): value is AnalyzerToolName => {
  return typeof value === 'string' && TOOL_NAMES.has(value as AnalyzerToolName)
}

const protocolFailure = (
  requestId: string | null,
  code: AnalyzerToolErrorCode,
  message: string,
  startedAt: number,
): AnalyzerToolProtocolResponse => ({
  request_id: requestId,
  api_version: ANALYZER_TOOL_API_VERSION,
  ok: false,
  data: null,
  meta: {
    duration_ms: Math.max(0, Date.now() - startedAt),
    warnings: [],
  },
  error: {
    code,
    message,
    retryable: false,
  },
})

export const createAnalyzerToolDispatcher = (options: AnalyzerToolHandlerOptions = {}) => {
  const handlers = createAnalyzerToolHandlers(options)

  return {
    handlers,

    async dispatch(request: unknown): Promise<AnalyzerToolProtocolResponse> {
      const startedAt = Date.now()
      if (!isRecord(request)) {
        return protocolFailure(null, 'INVALID_REQUEST', 'request must be an object', startedAt)
      }

      const requestId =
        typeof request.request_id === 'string' && request.request_id.length > 0
          ? request.request_id
          : null
      if (requestId === null) {
        return protocolFailure(
          null,
          'INVALID_REQUEST',
          'request_id must be a non-empty string',
          startedAt,
        )
      }
      if (request.api_version !== ANALYZER_TOOL_API_VERSION) {
        return protocolFailure(
          requestId,
          'UNSUPPORTED_VERSION',
          `api_version=${String(request.api_version)} is not supported; expected ${ANALYZER_TOOL_API_VERSION}`,
          startedAt,
        )
      }
      if (!isToolName(request.tool)) {
        return protocolFailure(requestId, 'INVALID_REQUEST', 'tool is not supported', startedAt)
      }
      if (!isRecord(request.args)) {
        return protocolFailure(requestId, 'INVALID_REQUEST', 'args must be an object', startedAt)
      }

      let response: AnalyzerToolResponse<AnalyzerToolResult>
      switch (request.tool) {
        case 'parse_log_bundle':
          response = await handlers.parse_log_bundle(request.args as unknown as ParseLogBundleArgs)
          break
        case 'get_task_overview':
          response = await handlers.get_task_overview(
            request.args as unknown as GetTaskOverviewArgs,
          )
          break
        case 'get_node_timeline':
          response = await handlers.get_node_timeline(
            request.args as unknown as GetNodeTimelineArgs,
          )
          break
        case 'get_next_list_history':
          response = await handlers.get_next_list_history(
            request.args as unknown as GetNextListHistoryArgs,
          )
          break
        case 'get_parent_chain':
          response = await handlers.get_parent_chain(request.args as unknown as GetParentChainArgs)
          break
        case 'get_raw_lines':
          response = await handlers.get_raw_lines(request.args as unknown as GetRawLinesArgs)
          break
      }

      return {
        request_id: requestId,
        api_version: ANALYZER_TOOL_API_VERSION,
        ...response,
      }
    },
  }
}
