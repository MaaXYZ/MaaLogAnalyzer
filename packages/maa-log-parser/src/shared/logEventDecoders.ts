import type { WaitFreezesDetail } from './types'

export type EventDetails = Record<string, unknown>

export interface TaskLifecycleEventDetails {
  task_id?: number
  entry: string
  hash: string
  uuid: string
}

export interface EventIdentityIds {
  task_id?: number
  node_id?: number
  reco_id?: number
  action_id?: number
  wf_id?: number
}

export interface CompactActionDetails {
  action_id?: number
  action?: string
  name?: string
  success?: boolean
}

export interface CompactNodeDetails {
  action_id?: number
  node_id?: number
}

export const readNumberField = (
  details: EventDetails | undefined,
  field: string,
): number | undefined => {
  if (!details) return undefined
  const value = details[field]
  return typeof value === 'number' ? value : undefined
}

export const readStringField = (
  details: EventDetails | undefined,
  field: string,
): string | undefined => {
  if (!details) return undefined
  const value = details[field]
  return typeof value === 'string' ? value : undefined
}

export const decodeTaskLifecycleEventDetails = (
  details: EventDetails | undefined,
): TaskLifecycleEventDetails => {
  return {
    task_id: readNumberField(details, 'task_id'),
    entry: readStringField(details, 'entry') ?? '',
    hash: readStringField(details, 'hash') ?? '',
    uuid: readStringField(details, 'uuid') ?? '',
  }
}

export const decodeEventIdentityIds = (details: EventDetails | undefined): EventIdentityIds => {
  return {
    task_id: readNumberField(details, 'task_id'),
    node_id: readNumberField(details, 'node_id'),
    reco_id: readNumberField(details, 'reco_id'),
    action_id: readNumberField(details, 'action_id'),
    wf_id: readNumberField(details, 'wf_id'),
  }
}

export const parseNumericArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) return undefined
  const normalized = value
    .map((item: unknown) => (typeof item === 'number' ? item : Number(item)))
    .filter((item: number) => Number.isFinite(item))
  return normalized.length > 0 ? normalized : undefined
}

export const parseRoi = (value: unknown): [number, number, number, number] | undefined => {
  const normalized = parseNumericArray(value)
  if (!normalized || normalized.length !== 4) return undefined
  return [normalized[0], normalized[1], normalized[2], normalized[3]]
}

export const parseWaitFreezesParam = (value: unknown): WaitFreezesDetail['param'] | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const param: WaitFreezesDetail['param'] = {}
  if (typeof raw.method === 'number') param.method = raw.method
  if (typeof raw.rate_limit === 'number') param.rate_limit = raw.rate_limit
  if (typeof raw.threshold === 'number') param.threshold = raw.threshold
  if (typeof raw.time === 'number') param.time = raw.time
  if (typeof raw.timeout === 'number') param.timeout = raw.timeout
  return Object.keys(param).length > 0 ? param : undefined
}

export const decodeCompactActionDetails = (value: unknown): CompactActionDetails | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const compact: CompactActionDetails = {}
  const actionId = readNumberField(raw, 'action_id')
  if (actionId != null) compact.action_id = actionId
  const action = readStringField(raw, 'action')
  if (action != null) compact.action = action
  const name = readStringField(raw, 'name')
  if (name != null) compact.name = name
  const success = raw.success
  if (typeof success === 'boolean') compact.success = success
  return Object.keys(compact).length > 0 ? compact : undefined
}

export const decodeCompactNodeDetails = (value: unknown): CompactNodeDetails | undefined => {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  const compact: CompactNodeDetails = {}
  const actionId = readNumberField(raw, 'action_id')
  if (actionId != null) compact.action_id = actionId
  const nodeId = readNumberField(raw, 'node_id')
  if (nodeId != null) compact.node_id = nodeId
  return Object.keys(compact).length > 0 ? compact : undefined
}
