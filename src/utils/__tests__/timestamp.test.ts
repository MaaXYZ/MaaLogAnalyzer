import { describe, expect, it } from 'vitest'
import { toTimestampMs } from '../timestamp'

describe('timestamp helper', () => {
  it('parses log timestamps in both space and T formats', () => {
    const space = toTimestampMs('2026-04-08 12:34:56.789')
    const iso = toTimestampMs('2026-04-08T12:34:56.789')
    expect(Number.isFinite(space)).toBe(true)
    expect(space).toBe(iso)
  })

  it('returns positive infinity for empty or invalid values', () => {
    expect(toTimestampMs(undefined)).toBe(Number.POSITIVE_INFINITY)
    expect(toTimestampMs('')).toBe(Number.POSITIVE_INFINITY)
    expect(toTimestampMs('not-a-time')).toBe(Number.POSITIVE_INFINITY)
  })
})
