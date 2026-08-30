import { describe, expect, it } from 'vitest'
import type { MergedRecognitionItem } from '../../../types'
import { filterCollapsedUnrecognizedRounds } from '../recognitionRoundState'

const makeRoundSeparator = (roundIndex: number): MergedRecognitionItem => ({
  name: `—— 第 ${roundIndex} 轮 ——`,
  status: 'not-recognized',
  isRoundSeparator: true,
  roundIndex,
})

const makePlaceholder = (name: string): MergedRecognitionItem => ({
  name,
  status: 'not-recognized',
})

const makeAttempt = (name: string, attemptIndex: number): MergedRecognitionItem => ({
  name,
  status: 'failed',
  attemptIndex,
})

const mixedRoundList: MergedRecognitionItem[] = [
  makeRoundSeparator(1),
  makeAttempt('A', 0),
  makePlaceholder('B'),
  makeRoundSeparator(2),
  makePlaceholder('X'),
  makePlaceholder('Y'),
  makeAttempt('Z', 2),
]

const expandedRoundList: MergedRecognitionItem[] = [
  ...mixedRoundList.slice(0, 3),
  makeRoundSeparator(2),
  makePlaceholder('X'),
  makePlaceholder('Y'),
  makeAttempt('Z', 2),
]

describe('recognitionRoundState', () => {
  it('filters collapsed fully unrecognized round items but keeps the separator', () => {
    const result = filterCollapsedUnrecognizedRounds(mixedRoundList, new Set([2]), () => false)

    expect(result).toMatchObject([
      { isRoundSeparator: true, roundIndex: 1 },
      { name: 'A', status: 'failed', attemptIndex: 0 },
      { name: 'B', status: 'not-recognized' },
      { isRoundSeparator: true, roundIndex: 2 },
    ])
    expect(result.some((item) => !item.isRoundSeparator && item.name === 'X')).toBe(false)
    expect(result.some((item) => !item.isRoundSeparator && item.name === 'Y')).toBe(false)
  })

  it('keeps everything when an unrecognized round is expanded', () => {
    const result = filterCollapsedUnrecognizedRounds(
      mixedRoundList,
      new Set([2]),
      (roundIndex) => roundIndex === 2,
    )

    expect(result).toEqual(expandedRoundList)
  })
})
