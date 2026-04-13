import type { ParseArtifactsSnapshot, ParseFileOptions } from '../core/logParser'
import type { ScopeKind } from '../trace/scopeTypes'

export interface AnalyzerSession {
  sessionId: string
  artifacts: ParseArtifactsSnapshot
  warnings: string[]
  createdAt: string
}

export interface ParseLogBundleInput {
  path: string
  kind: 'file' | 'folder' | 'zip'
}

export interface ResolvedLogSourceInput {
  content: string
  source_key?: string
  source_path?: string
}

export interface ParseLogBundleArgs {
  session_id: string
  inputs: ParseLogBundleInput[]
}

export interface ParseLogBundleResult {
  session_id: string
  task_count: number
  event_count: number
  warnings: string[]
}

export interface GetTaskOverviewArgs {
  session_id: string
  task_id?: number
}

export interface GetTaskOverviewResult {
  task: {
    task_id: number
    entry: string
    status: 'success' | 'failed' | 'running'
    duration_ms: number
  } | null
  summary: {
    node_count: number
    failed_node_count: number
    reco_failed_count: number
  }
  evidences: Evidence[]
}

export interface GetNodeTimelineArgs {
  session_id: string
  task_id: number
  node_id: number
  scope_id?: string
  occurrence_index?: number
  limit?: number
}

export interface GetNodeTimelineResult {
  timeline: Array<{
    scope_id: string
    occurrence_index: number
    ts: string
    event: string
    node_id: number
    name: string
    source_key: string | null
    line: number | null
  }>
  evidences: Evidence[]
}

export interface GetNextListHistoryArgs {
  session_id: string
  task_id: number
  node_id: number
  scope_id?: string
  occurrence_index?: number
  limit?: number
}

export interface GetNextListHistoryResult {
  history: Array<{
    scope_id: string
    occurrence_index: number
    source_key: string | null
    line: number | null
    candidates: Array<{
      name: string
      anchor: boolean
      jump_back: boolean
    }>
    outcome: 'succeeded' | 'failed' | 'unknown'
  }>
  evidences: Evidence[]
}

export interface GetParentChainArgs {
  session_id: string
  task_id: number
  node_id: number
  scope_id?: string
  occurrence_index?: number
}

export interface GetParentChainResult {
  chain: Array<{
    scope_id: string
    scope_kind: ScopeKind
    task_id?: number
    node_id?: number
    name: string
    occurrence_index?: number
    relation: 'self' | 'parent' | 'ancestor'
  }>
  evidences: Evidence[]
}

export interface GetRawLinesArgs {
  session_id: string
  task_id: number
  source_key?: string
  keywords?: string[]
  line_start?: number
  line_end?: number
  limit?: number
}

export interface GetRawLinesResult {
  lines: Array<{
    source_key: string
    line: number
    text: string
  }>
  evidences: Evidence[]
}

export interface Evidence {
  evidence_id: string
  source_tool: string
  source_range: {
    session_id: string
    source_key?: string
    task_id?: number
    node_id?: number
    scope_id?: string
    occurrence_index?: number
    line_start?: number
    line_end?: number
  }
  payload: Record<string, unknown>
  confidence: number
}

export type AnalyzerToolErrorCode =
  | 'INVALID_REQUEST'
  | 'UNSUPPORTED_VERSION'
  | 'SESSION_NOT_FOUND'
  | 'TASK_NOT_FOUND'
  | 'NODE_NOT_FOUND'
  | 'SCOPE_NOT_FOUND'
  | 'AMBIGUOUS_SCOPE_SELECTOR'
  | 'DATA_NOT_READY'
  | 'INTERNAL_ERROR'

export interface AnalyzerToolError {
  code: AnalyzerToolErrorCode
  message: string
  retryable: boolean
}

export type AnalyzerToolResponse<T> =
  | {
    ok: true
    data: T
    meta: {
      duration_ms: number
      warnings: string[]
    }
    error: null
  }
  | {
    ok: false
    data: null
    meta: {
      duration_ms: number
      warnings: string[]
    }
    error: AnalyzerToolError
  }

export type AnalyzerInputResolver = (
  input: ParseLogBundleInput,
  context: { input_index: number },
) => Promise<ResolvedLogSourceInput | ResolvedLogSourceInput[] | null | undefined>
  | ResolvedLogSourceInput
  | ResolvedLogSourceInput[]
  | null
  | undefined

export interface AnalyzerToolHandlerOptions {
  store?: AnalyzerSessionStoreLike
  resolve_input?: AnalyzerInputResolver
  parse_options?: ParseFileOptions
  create_parser?: () => {
    parseInputs: (
      inputs: Array<{
        content: string
        sourceKey?: string
        sourcePath?: string
        inputIndex?: number
      }>,
      onProgress?: ((progress: { current: number; total: number; percentage: number }) => void) | undefined,
      options?: ParseFileOptions,
    ) => Promise<void>
    getParseArtifactsSnapshot: () => ParseArtifactsSnapshot
  }
  now?: () => string
}

export interface AnalyzerSessionStoreLike {
  get: (sessionId: string) => AnalyzerSession | undefined
  set: (session: AnalyzerSession) => AnalyzerSession
  delete?: (sessionId: string) => boolean
  clear?: () => void
}
