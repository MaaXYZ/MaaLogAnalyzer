import { describe, expect, it } from 'vitest'
import type { MergedRecognitionItem } from '../../../types'
import { buildRecognitionItemKey } from '../recognitionListKeys'

describe('buildRecognitionItemKey', () => {
  it('builds round separator keys by round index and name', () => {
    const item: MergedRecognitionItem = {
      name: '—— 第 1 轮 ——',
      status: 'not-recognized',
      isRoundSeparator: true,
      roundIndex: 1,
    }
    expect(buildRecognitionItemKey(item, 0)).toBe('round-1-—— 第 1 轮 ——')
  })

  it('builds attempt keys from attempt index when available', () => {
    const item: MergedRecognitionItem = {
      name: 'A',
      status: 'failed',
      attemptIndex: 3,
    }
    expect(buildRecognitionItemKey(item, 0)).toBe('attempt-3')
  })

  it('falls back to placeholder key for non-attempt entries', () => {
    const item: MergedRecognitionItem = {
      name: 'B',
      status: 'not-recognized',
    }
    expect(buildRecognitionItemKey(item, 7)).toBe('placeholder-7-B')
  })
})
