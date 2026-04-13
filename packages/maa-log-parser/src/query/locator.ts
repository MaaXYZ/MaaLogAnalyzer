import type { ScopeKind } from '../trace/scopeTypes'
import type { TaskLocalKey, TaskNodeKey } from './queryTypes'

export type ScopeLocator =
  | { scopeId: string }
  | { kind: ScopeKind; taskId?: number; localId?: number; startSeq?: number }

export interface NodeExecutionLocator {
  taskId: number
  nodeId: number
  occurrenceIndex?: number
  scopeId?: string
}

export type UniqueScopeLocator =
  | { scopeId: string }
  | { taskId: number; nodeId: number; occurrenceIndex: number }

export const buildTaskNodeKey = (
  taskId: number,
  nodeId: number,
): TaskNodeKey => `${taskId}:${nodeId}`

export const buildTaskLocalKey = (
  taskId: number,
  localId: number,
): TaskLocalKey => `${taskId}:${localId}`

export const hasScopeId = (
  locator: ScopeLocator | NodeExecutionLocator | UniqueScopeLocator,
): locator is { scopeId: string } => {
  return 'scopeId' in locator && typeof locator.scopeId === 'string' && locator.scopeId.length > 0
}
