import type { ScopeKind } from './scopeTypes'

export interface ScopeIdentityFields {
  taskId?: number
  nodeId?: number
  recoId?: number
  actionId?: number
  wfId?: number
  resId?: number
  ctrlId?: number
}

export interface ScopeIdParts {
  kind: ScopeKind
  taskId?: number
  localId?: number
  startSeq: number
}

const readNumberField = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField: string,
): number | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'number') return camelValue
  const snakeValue = record[snakeField]
  if (typeof snakeValue === 'number') return snakeValue
  return undefined
}

export const readScopeIdentityFields = (payload: unknown): ScopeIdentityFields => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return {}
  }

  const record = payload as Record<string, unknown>
  return {
    taskId: readNumberField(record, 'taskId', 'task_id'),
    nodeId: readNumberField(record, 'nodeId', 'node_id'),
    recoId: readNumberField(record, 'recoId', 'reco_id'),
    actionId: readNumberField(record, 'actionId', 'action_id'),
    wfId: readNumberField(record, 'wfId', 'wf_id'),
    resId: readNumberField(record, 'resId', 'res_id'),
    ctrlId: readNumberField(record, 'ctrlId', 'ctrl_id'),
  }
}

export const resolveScopeLocalId = (
  kind: ScopeKind,
  payload: unknown,
): number | undefined => {
  const identity = readScopeIdentityFields(payload)
  switch (kind) {
    case 'task':
      return identity.taskId
    case 'pipeline_node':
    case 'recognition_node':
    case 'action_node':
      return identity.nodeId
    case 'recognition':
      return identity.recoId
    case 'action':
      return identity.actionId
    case 'wait_freezes':
      return identity.wfId
    case 'resource_loading':
      return identity.resId
    case 'controller_action':
      return identity.ctrlId
    case 'next_list':
    case 'trace_root':
      return undefined
  }
}

export const buildScopeId = ({
  kind,
  taskId,
  localId,
  startSeq,
}: ScopeIdParts): string => {
  return `${kind}:${taskId ?? 0}:${localId ?? 0}:seq${startSeq}`
}

export const createScopeId = (
  kind: ScopeKind,
  payload: unknown,
  startSeq: number,
  explicitTaskId?: number,
): string => {
  const identity = readScopeIdentityFields(payload)
  return buildScopeId({
    kind,
    taskId: explicitTaskId ?? identity.taskId,
    localId: resolveScopeLocalId(kind, payload),
    startSeq,
  })
}
