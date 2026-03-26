import type { UnifiedFlowItem } from '../../../types'

export const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export const toFiniteNumber = (value: unknown, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return value
}

export const toPositiveInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = Math.trunc(value)
    return normalized > 0 ? normalized : null
  }
  if (typeof value === 'string') {
    const parsed = Number(value)
    if (!Number.isFinite(parsed)) return null
    const normalized = Math.trunc(parsed)
    return normalized > 0 ? normalized : null
  }
  return null
}

export const toTrimmedNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized ? normalized : null
}

export const flattenFlowItems = (
  items: UnifiedFlowItem[] | undefined,
  output: UnifiedFlowItem[] = [],
): UnifiedFlowItem[] => {
  if (!items || items.length === 0) return output
  for (const item of items) {
    output.push(item)
    if (item.children && item.children.length > 0) {
      flattenFlowItems(item.children, output)
    }
  }
  return output
}
