export interface BridgeCachedImageRefs {
  raw: number | null
  draws: number[]
}

export interface BridgeRecognitionImageState {
  raw: string | null
  draws: string[]
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const toPositiveInteger = (value: unknown): number | null => {
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

const toPositiveIntegerArray = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []
  const result: number[] = []
  for (const item of value) {
    const normalized = toPositiveInteger(item)
    if (normalized == null) continue
    result.push(normalized)
  }
  return result
}

const hasImageDataUrlPayload = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('data:image/')) return false
  const commaIndex = trimmed.indexOf(',')
  if (commaIndex < 0) return false
  const payload = trimmed.slice(commaIndex + 1).trim()
  return payload.length > 0
}

export const toImageDataUrl = (imageData: unknown): string | null => {
  if (typeof imageData === 'string') {
    const trimmed = imageData.trim()
    if (trimmed.startsWith('data:image/')) {
      return hasImageDataUrlPayload(trimmed) ? trimmed : null
    }
    return null
  }

  const imageRecord = asRecord(imageData)
  if (!imageRecord) return null

  const dataUrl = typeof imageRecord.dataUrl === 'string' ? imageRecord.dataUrl.trim() : ''
  if (dataUrl.startsWith('data:image/')) {
    return hasImageDataUrlPayload(dataUrl) ? dataUrl : null
  }

  const rawBase64 = typeof imageRecord.base64 === 'string' ? imageRecord.base64.trim() : ''
  if (!rawBase64) return null

  if (rawBase64.startsWith('data:image/')) {
    return hasImageDataUrlPayload(rawBase64) ? rawBase64 : null
  }

  let normalizedBase64 = rawBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalizedBase64.length % 4
  if (padding > 0) {
    normalizedBase64 += '='.repeat(4 - padding)
  }
  if (!normalizedBase64) return null

  const mimeType = typeof imageRecord.mimeType === 'string' && imageRecord.mimeType.trim()
    ? imageRecord.mimeType.trim()
    : 'image/png'
  return `data:${mimeType};base64,${normalizedBase64}`
}

export const parseCachedImageRefs = (detailData: unknown): BridgeCachedImageRefs => {
  const detailRecord = asRecord(detailData)
  const infoRecord = asRecord(detailRecord?.info)
  const cachedImageRecord = asRecord(detailRecord?.cached_image) ?? asRecord(infoRecord?.cached_image)
  return {
    raw: toPositiveInteger(cachedImageRecord?.raw),
    draws: toPositiveIntegerArray(cachedImageRecord?.draws),
  }
}

export const parseInlineRecoImages = (detailData: unknown): BridgeRecognitionImageState => {
  const detailRecord = asRecord(detailData)
  const raw = toImageDataUrl(detailRecord?.raw) ?? null

  const drawCandidates: unknown[] = []
  if (Array.isArray(detailRecord?.draws)) {
    drawCandidates.push(...detailRecord.draws)
  }
  if (detailRecord?.draw != null) {
    drawCandidates.push(detailRecord.draw)
  }

  const draws = drawCandidates
    .map((item) => toImageDataUrl(item))
    .filter((item): item is string => typeof item === 'string' && item.length > 0)

  return { raw, draws }
}
