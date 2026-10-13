import { describe, expect, it } from 'vitest'
import { resolveSearchResultStepLine } from '../searchResultStep'

const results = [{ lineNumber: 10 }, { lineNumber: 25 }, { lineNumber: 40 }]
const step = (currentLine: number | null, delta: number) =>
  resolveSearchResultStepLine(results, currentLine, delta)

describe('resolveSearchResultStepLine', () => {
  it('steps forward and backward from the current hit', () => {
    expect(step(10, 1)).toBe(25)
    expect(step(25, 1)).toBe(40)
    expect(step(40, -1)).toBe(25)
  })

  it('stops at both ends instead of wrapping around', () => {
    expect(step(40, 1)).toBeNull()
    expect(step(10, -1)).toBeNull()
  })

  it('starts from the first hit when the current line is not a hit', () => {
    expect(step(null, 1)).toBe(10)
    expect(step(999, 1)).toBe(10)
  })

  it('returns null when there are no results', () => {
    expect(resolveSearchResultStepLine([], 10, 1)).toBeNull()
  })
})
