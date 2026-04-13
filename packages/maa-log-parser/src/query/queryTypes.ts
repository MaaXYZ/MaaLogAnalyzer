import type { ScopeKind } from '../trace/scopeTypes'

export type TaskNodeKey = `${number}:${number}`
export type TaskLocalKey = `${number}:${number}`

export interface NodeExecutionRef {
  taskId: number
  nodeId: number
  occurrenceIndex: number
  pipelineScopeId: string
  startSeq: number
  endSeq?: number
}

export interface ScopeTimeline {
  scopeId: string
  occurrenceIndex: number
  ts: string
  seq: number
  event: string
  scopeKind: ScopeKind
  taskId?: number
  nodeId?: number
  name?: string
  sourceKey?: string
  line?: number
}

export interface NextListHistoryItem {
  scopeId: string
  occurrenceIndex: number
  sourceKey?: string
  line?: number
  candidates: Array<{
    name: string
    anchor: boolean
    jumpBack: boolean
  }>
  outcome: 'succeeded' | 'failed' | 'unknown'
}

export interface QueryRawLine {
  sourceKey: string
  line: number
  text: string
}

export type QueryErrorCode = 'not_found' | 'ambiguous' | 'invalid_locator'

export type QueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: QueryErrorCode; message: string }
