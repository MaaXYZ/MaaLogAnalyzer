import { describe, expect, it } from 'vitest'
import type { RecognitionAttempt } from '@windsland52/maa-log-parser/types'
import { createRecognitionAttemptHelpers } from '../recognition/helpers'

const createAttempt = (
  recoId: number,
  status: RecognitionAttempt['status'],
  ts = '2026-04-08 00:00:00.000',
  endTs?: string
): RecognitionAttempt => ({
  reco_id: recoId,
  name: `Reco-${recoId}`,
  ts,
  end_ts: endTs,
  status,
})

describe('RecognitionHelpers', () => {
  it('dedupes attempts by reco_id and prefers terminal/latest attempt', () => {
    const orderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { dedupeRecognitionAttempts } = createRecognitionAttemptHelpers(orderMeta)

    const running = createAttempt(1, 'running', '2026-04-08 00:00:00.001')
    const failed = createAttempt(1, 'failed', '2026-04-08 00:00:00.001', '2026-04-08 00:00:00.200')
    const nestedA = createAttempt(9, 'success')
    const nestedB = createAttempt(9, 'failed')
    running.nested_nodes = [nestedA]
    failed.nested_nodes = [nestedB]

    orderMeta.set(running, { startSeq: 10, endSeq: 20 })
    orderMeta.set(failed, { startSeq: 11, endSeq: 30 })

    const deduped = dedupeRecognitionAttempts([running, failed])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].status).toBe('failed')
    expect(deduped[0].end_ts).toBe('2026-04-08 00:00:00.200')
    expect(deduped[0].nested_nodes).toHaveLength(1)
    expect(deduped[0].nested_nodes?.[0].reco_id).toBe(9)

    const mergedMeta = orderMeta.get(deduped[0])
    expect(mergedMeta).toEqual({ startSeq: 10, endSeq: 30 })
  })

  it('attaches recognition nodes to best-matched attempts by parse order', () => {
    const orderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { attachRecognitionNodesToAttempts } = createRecognitionAttemptHelpers(orderMeta)

    const attemptA = createAttempt(100, 'success')
    const attemptB = createAttempt(200, 'success')
    orderMeta.set(attemptA, { startSeq: 10, endSeq: 20 })
    orderMeta.set(attemptB, { startSeq: 30, endSeq: 40 })

    const nodeForA = createAttempt(101, 'success')
    const nodeForB = createAttempt(201, 'success')
    const orphan = createAttempt(301, 'success')
    orderMeta.set(nodeForA, { startSeq: 15, endSeq: 15 })
    orderMeta.set(nodeForB, { startSeq: 35, endSeq: 35 })
    orderMeta.set(orphan, { startSeq: 5, endSeq: 5 })

    const result = attachRecognitionNodesToAttempts(
      [attemptA, attemptB],
      [nodeForB, orphan, nodeForA]
    )

    expect(result.attempts).toHaveLength(2)
    expect(result.attempts[0].nested_nodes?.map((item) => item.reco_id)).toEqual([101])
    expect(result.attempts[1].nested_nodes?.map((item) => item.reco_id)).toEqual([201])
    expect(result.orphans.map((item) => item.reco_id)).toEqual([301])
  })

  it('clones attempt with copied order meta and deduped nested nodes', () => {
    const orderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const { cloneRecognitionAttempt, attachNodeToAttempt } = createRecognitionAttemptHelpers(orderMeta)

    const base = createAttempt(1, 'success')
    const nested = createAttempt(2, 'running')
    orderMeta.set(base, { startSeq: 1, endSeq: 2 })

    attachNodeToAttempt(base, nested)
    attachNodeToAttempt(base, createAttempt(2, 'failed'))
    const cloned = cloneRecognitionAttempt(base)

    expect(cloned).not.toBe(base)
    expect(cloned.nested_nodes).toHaveLength(1)
    expect(cloned.nested_nodes?.[0].reco_id).toBe(2)
    expect(cloned.nested_nodes?.[0].status).toBe('failed')
    expect(orderMeta.get(cloned)).toEqual({ startSeq: 1, endSeq: 2 })
  })
})
