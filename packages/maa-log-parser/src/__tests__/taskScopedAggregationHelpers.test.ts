import { describe, expect, it } from 'vitest'
import {
  clearTaskNodeAggregation,
  getOrCreateTaskNodeAggregation,
  getTaskNextList,
  resetTaskNodeAggregation,
  setTaskNextList,
} from '../task/scopedAggregationHelpers'

describe('TaskScopedAggregationHelpers', () => {
  it('creates and returns task scoped aggregation', () => {
    const map = new Map<number, any>()
    const a = getOrCreateTaskNodeAggregation(map, 1)
    const b = getOrCreateTaskNodeAggregation(map, 1)

    expect(a).toBe(b)
    expect(a.nextList).toEqual([])
    expect(a.waitFreezesRuntimeStates.size).toBe(0)
  })

  it('sets and reads task next list', () => {
    const map = new Map<number, any>()
    const nextList = [{ name: 'A', anchor: true, jump_back: false }]

    const saved = setTaskNextList(map, 2, nextList)
    expect(saved).toEqual(nextList)
    expect(getTaskNextList(map, 2)).toEqual(nextList)
    expect(getTaskNextList(map, 999)).toEqual([])
  })

  it('resets and clears aggregation by task', () => {
    const map = new Map<number, any>()
    const agg = getOrCreateTaskNodeAggregation(map, 3)
    agg.nextList = [{ name: 'B', anchor: false, jump_back: false }]
    agg.waitFreezesRuntimeStates.set(1, {
      wf_id: 1,
      name: 'WF',
      ts: '2026-04-08 00:00:00.000',
      status: 'running',
      order: 1,
    })

    resetTaskNodeAggregation(map, 3)
    expect(getTaskNextList(map, 3)).toEqual([])
    expect(getOrCreateTaskNodeAggregation(map, 3).waitFreezesRuntimeStates.size).toBe(0)

    clearTaskNodeAggregation(map, 3)
    expect(map.has(3)).toBe(false)
  })
})
