export const toTimestampMs = (value?: string): number => {
  if (!value) return Number.POSITIVE_INFINITY
  const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}
