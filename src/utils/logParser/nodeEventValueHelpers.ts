import { markRaw } from 'vue'
import type { NextListItem, NodeInfo } from '../../types'
import type { StringPool } from '../stringPool'

export function scopedTaskNodeKey(taskId: number, id: number): string {
  return `${taskId}:${id}`
}

export function withActionTimestamps(
  actionDetails: any,
  stringPool: StringPool,
  startTimestamp?: string,
  endTimestamp?: string,
  fallbackEndTimestamp?: string
) {
  if (!actionDetails) return undefined
  const resolvedEnd = endTimestamp ?? actionDetails.end_ts ?? fallbackEndTimestamp
  const resolvedStart = startTimestamp ?? actionDetails.ts ?? resolvedEnd
  return markRaw({
    ...actionDetails,
    ...(resolvedStart ? { ts: stringPool.intern(resolvedStart) } : {}),
    ...(resolvedEnd ? { end_ts: stringPool.intern(resolvedEnd) } : {}),
  })
}

export function toNextListItems(list: unknown[], stringPool: StringPool): NextListItem[] {
  return list.map((rawItem: unknown) => {
    const item = rawItem && typeof rawItem === 'object'
      ? rawItem as Partial<NextListItem>
      : {}
    return {
      name: stringPool.intern(item.name || ''),
      anchor: item.anchor || false,
      jump_back: item.jump_back || false,
    }
  })
}

export function parseRecognitionAnchorName(
  details: Record<string, any>,
  stringPool: StringPool
): string | undefined {
  if (typeof details.anchor !== 'string') return undefined
  const trimmed = details.anchor.trim()
  if (!trimmed) return undefined
  return stringPool.intern(trimmed)
}

export function resolveEventFocus(
  details: Record<string, any>,
  fallback?: NodeInfo['focus']
): NodeInfo['focus'] | undefined {
  if (!Object.prototype.hasOwnProperty.call(details, 'focus')) return fallback
  if (details.focus == null) return fallback
  return markRaw(details.focus)
}

export function normalizeRecoId(value: unknown): number | null {
  const recoId = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(recoId) ? recoId : null
}

export function resolveRecognitionNodeRecoId(details: Record<string, any>): number | null {
  return normalizeRecoId(
    details.reco_details?.reco_id ??
    details.reco_id ??
    details.node_details?.reco_id
  )
}
