import { markRaw } from 'vue'
import type { StringPool } from '../stringPool'
import {
  decodeCompactActionDetails,
  decodeCompactNodeDetails,
  decodeEventIdentityIds,
  parseNumericArray,
  parseRoi,
  parseWaitFreezesParam,
  readNumberField,
  readStringField,
} from '../logEventDecoders'

type NormalizedTaskEventListItem = {
  name: string
  anchor: boolean
  jump_back: boolean
}

function normalizeTaskEventListItem(
  raw: unknown,
  stringPool: StringPool
): NormalizedTaskEventListItem | null {
  if (!raw || typeof raw !== 'object') return null
  const item = raw as Record<string, unknown>
  const name = typeof item.name === 'string' ? stringPool.intern(item.name) : ''
  if (!name) return null
  return {
    name,
    anchor: item.anchor === true,
    jump_back: item.jump_back === true,
  }
}

export function compactTaskEventDetails(
  message: string,
  details: Record<string, any>,
  stringPool: StringPool
): Record<string, any> {
  const compact: Record<string, any> = {}

  const ids = decodeEventIdentityIds(details)
  if (ids.task_id != null) compact.task_id = ids.task_id
  if (ids.node_id != null) compact.node_id = ids.node_id
  if (ids.reco_id != null) compact.reco_id = ids.reco_id
  if (ids.action_id != null) compact.action_id = ids.action_id

  const name = readStringField(details, 'name')
  if (name != null) compact.name = stringPool.intern(name)
  const entry = readStringField(details, 'entry')
  if (entry != null) compact.entry = stringPool.intern(entry)
  const status = readStringField(details, 'status')
  if (status != null) compact.status = stringPool.intern(status)
  const error = readStringField(details, 'error')
  if (error != null) compact.error = stringPool.intern(error)
  const reason = readStringField(details, 'reason')
  if (reason != null) compact.reason = stringPool.intern(reason)
  const uuid = readStringField(details, 'uuid')
  if (uuid != null) compact.uuid = stringPool.intern(uuid)
  const hash = readStringField(details, 'hash')
  if (hash != null) compact.hash = stringPool.intern(hash)
  const action = readStringField(details, 'action')
  if (action != null) compact.action = stringPool.intern(action)
  const anchor = readStringField(details, 'anchor')
  if (anchor != null) compact.anchor = stringPool.intern(anchor)

  if (message.startsWith('Node.WaitFreezes.')) {
    if (ids.wf_id != null) compact.wf_id = ids.wf_id
    const phase = readStringField(details, 'phase')
    if (phase != null) compact.phase = stringPool.intern(phase)
    const elapsed = readNumberField(details, 'elapsed')
    if (elapsed != null) compact.elapsed = elapsed
    if (Object.prototype.hasOwnProperty.call(details, 'focus')) {
      const rawFocus = details.focus
      compact.focus = (rawFocus != null && typeof rawFocus === 'object')
        ? markRaw(rawFocus)
        : rawFocus
    }

    const recoIds = parseNumericArray(details.reco_ids)
    if (recoIds) compact.reco_ids = markRaw(recoIds)

    const roi = parseRoi(details.roi)
    if (roi) compact.roi = markRaw(roi)

    const param = parseWaitFreezesParam(details.param)
    if (param) compact.param = markRaw(param)
  }

  if (Array.isArray(details.list)) {
    const list = details.list
      .map((item: unknown) => normalizeTaskEventListItem(item, stringPool))
      .filter((item): item is NormalizedTaskEventListItem => item != null)
    if (list.length > 0) {
      compact.list = markRaw(list)
    }
  }

  if (details.action_details && typeof details.action_details === 'object') {
    const parsed = decodeCompactActionDetails(details.action_details)
    if (parsed) {
      const actionDetails: Record<string, unknown> = {}
      if (parsed.action_id != null) actionDetails.action_id = parsed.action_id
      if (parsed.action != null) actionDetails.action = stringPool.intern(parsed.action)
      if (parsed.name != null) actionDetails.name = stringPool.intern(parsed.name)
      if (parsed.success != null) actionDetails.success = parsed.success
      compact.action_details = markRaw(actionDetails)
    }
  }

  if (details.node_details && typeof details.node_details === 'object') {
    const parsed = decodeCompactNodeDetails(details.node_details)
    if (parsed) {
      const nodeDetails: Record<string, unknown> = {}
      if (parsed.action_id != null) nodeDetails.action_id = parsed.action_id
      if (parsed.node_id != null) nodeDetails.node_id = parsed.node_id
      compact.node_details = markRaw(nodeDetails)
    }
  }

  return markRaw(compact)
}
