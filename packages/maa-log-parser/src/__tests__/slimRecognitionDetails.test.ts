import { describe, expect, it } from 'vitest'
import {
  SLIM_CANDIDATE_LIMIT,
  slimRecognitionDetailValue,
  slimTaskRecognitionDetails,
} from '../core/slimRecognitionDetails'

const makeCandidate = (i: number) => ({ box: [i, 0, 1, 1], count: 1 })

const makeInner = (allLen: number, filteredLen: number) => ({
  all: Array.from({ length: allLen }, (_, i) => makeCandidate(i)),
  filtered: Array.from({ length: filteredLen }, (_, i) => makeCandidate(i)),
  best: { box: [0, 0, 1, 1], score: 0.9 },
})

describe('slimRecognitionDetails', () => {
  it('caps candidate arrays and records original totals', () => {
    const inner = makeInner(100, 50)
    const tasks = [{ nodes: [{ reco_details: { reco_id: 1, detail: inner } }] }]

    slimTaskRecognitionDetails(tasks as never[])

    expect(inner.all.length).toBe(SLIM_CANDIDATE_LIMIT)
    expect((inner as { allTotal?: number }).allTotal).toBe(100)
    expect(inner.filtered.length).toBe(SLIM_CANDIDATE_LIMIT)
    expect((inner as { filteredTotal?: number }).filteredTotal).toBe(50)
    expect(inner.best).toEqual({ box: [0, 0, 1, 1], score: 0.9 })
  })

  it('leaves small arrays untouched and records no totals', () => {
    const inner = makeInner(3, 2)
    slimRecognitionDetailValue(inner)
    expect(inner.all.length).toBe(3)
    expect(inner.filtered.length).toBe(2)
    expect((inner as { allTotal?: number }).allTotal).toBeUndefined()
  })

  it('handles And-style nested detail arrays', () => {
    const child = { algorithm: 'ColorMatch', box: null, detail: makeInner(20, 0) }
    const root = [{ algorithm: 'And', box: null, detail: [child] }]
    slimRecognitionDetailValue(root)
    expect(child.detail.all.length).toBe(SLIM_CANDIDATE_LIMIT)
    expect((child.detail as { allTotal?: number }).allTotal).toBe(20)
  })

  it('trims shared detail only once and tolerates cycles', () => {
    const inner = makeInner(30, 30)
    const shared = { reco_id: 1, detail: inner }
    const t1: Record<string, unknown> = { reco_details: shared }
    t1.self = t1
    const t2 = { reco_details: shared }

    expect(() => slimTaskRecognitionDetails([t1, t2] as never[])).not.toThrow()
    expect(inner.all.length).toBe(SLIM_CANDIDATE_LIMIT)
    expect((inner as { allTotal?: number }).allTotal).toBe(30)
  })

  it('tolerates missing detail', () => {
    expect(() => slimTaskRecognitionDetails([{}, { nodes: [{ reco_details: {} }] }] as never[])).not.toThrow()
  })
})
