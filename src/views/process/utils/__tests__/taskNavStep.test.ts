import { describe, expect, it } from 'vitest'
import { resolveTaskNavStepIndex } from '../taskNavStep'

describe('resolveTaskNavStepIndex', () => {
  it('steps forward and backward from the active task', () => {
    expect(resolveTaskNavStepIndex(5, 2, 1)).toBe(3)
    expect(resolveTaskNavStepIndex(5, 2, -1)).toBe(1)
  })

  it('stops at both ends instead of wrapping around', () => {
    expect(resolveTaskNavStepIndex(5, 4, 1)).toBeNull()
    expect(resolveTaskNavStepIndex(5, 0, -1)).toBeNull()
  })

  it('starts from the first task when the index is missing or out of range', () => {
    expect(resolveTaskNavStepIndex(5, -1, 1)).toBe(0)
    expect(resolveTaskNavStepIndex(5, -1, -1)).toBe(0)
    expect(resolveTaskNavStepIndex(5, 99, 1)).toBe(0)
  })

  it('returns null when there is no task', () => {
    expect(resolveTaskNavStepIndex(0, 0, 1)).toBeNull()
  })
})
