import { describe, expect, it } from 'vitest'
import type { NestedActionGroup, RecognitionAttempt } from '@windsland52/maa-log-parser/types'
import { createRecognitionAttemptHelpers } from '../recognition/helpers'
import {
  attachActionLevelRecognitionAcrossScopes,
  resolveFallbackRecoDetails,
  splitRecognitionAttemptsByActionWindow,
} from '../recognition/scopeHelpers'

const createAttempt = (
  recoId: number,
  status: RecognitionAttempt['status'] = 'success',
  recoName?: string
): RecognitionAttempt => ({
  reco_id: recoId,
  name: `Reco-${recoId}`,
  ts: '2026-04-08 00:00:00.000',
  end_ts: '2026-04-08 00:00:00.100',
  status,
  reco_details: recoName
    ? {
      reco_id: recoId,
      algorithm: 'TemplateMatch',
      box: [0, 0, 10, 10],
      detail: {},
      name: recoName,
    }
    : undefined,
})

describe('RecognitionScopeHelpers', () => {
  it('attaches action-level recognitions to nested actions first, then top-level by action window', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const helpers = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const topLevel = createAttempt(100)
    const nestedAttempt = createAttempt(200)
    recognitionOrderMeta.set(topLevel, { startSeq: 10, endSeq: 20 })
    recognitionOrderMeta.set(nestedAttempt, { startSeq: 30, endSeq: 40 })

    const nestedGroups: NestedActionGroup[] = [{
      task_id: 1,
      name: 'SubTask',
      ts: '2026-04-08 00:00:00.000',
      status: 'success',
      nested_actions: [{
        node_id: 1,
        name: 'ActionNode',
        ts: '2026-04-08 00:00:00.000',
        status: 'success',
        recognitions: [nestedAttempt],
      }],
    }]

    const nodeForNested = createAttempt(201)
    const nodeForTopLevel = createAttempt(101)
    const nodeRemaining = createAttempt(301)
    recognitionOrderMeta.set(nodeForNested, { startSeq: 35, endSeq: 35 })
    recognitionOrderMeta.set(nodeForTopLevel, { startSeq: 15, endSeq: 15 })
    recognitionOrderMeta.set(nodeRemaining, { startSeq: 28, endSeq: 28 })

    const result = attachActionLevelRecognitionAcrossScopes({
      topLevelAttempts: [topLevel],
      nestedActionGroups: nestedGroups,
      actionLevelNodes: [nodeRemaining, nodeForNested, nodeForTopLevel],
      actionStartOrder: 25,
      recognitionOrderMeta,
      cloneRecognitionAttempt: helpers.cloneRecognitionAttempt,
      sortByParseOrderThenRecoId: helpers.sortByParseOrderThenRecoId,
      pickBestAttemptIndex: helpers.pickBestAttemptIndex,
      attachNodeToAttempt: helpers.attachNodeToAttempt,
      dedupeRecognitionAttempts: helpers.dedupeRecognitionAttempts,
    })

    expect(result.topLevelAttempts[0].nested_nodes?.map((item) => item.reco_id)).toEqual([101])
    const nestedRecognitions = result.nestedActionGroups[0].nested_actions[0].recognitions ?? []
    expect(nestedRecognitions[0].nested_nodes?.map((item) => item.reco_id)).toEqual([201])
    expect(result.remaining.map((item) => item.reco_id)).toEqual([301])
  })

  it('splits recognitions by action window boundaries', () => {
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const before = createAttempt(1)
    const inWindow = createAttempt(2)
    const after = createAttempt(3)
    recognitionOrderMeta.set(before, { startSeq: 10, endSeq: 14 })
    recognitionOrderMeta.set(inWindow, { startSeq: 16, endSeq: 20 })
    recognitionOrderMeta.set(after, { startSeq: 30, endSeq: 35 })

    const split = splitRecognitionAttemptsByActionWindow(
      [before, inWindow, after],
      recognitionOrderMeta,
      15,
      25
    )
    expect(split.topLevel.map((item) => item.reco_id)).toEqual([1, 3])
    expect(split.actionLevel.map((item) => item.reco_id)).toEqual([2])
  })

  it('resolves fallback reco details from details payload or last recognition', () => {
    const first = createAttempt(1, 'success', 'RecoA')
    const second = createAttempt(2, 'success', 'RecoB')

    const explicit = resolveFallbackRecoDetails(
      { reco_details: { reco_id: 99, algorithm: 'A', box: null, detail: {}, name: 'Explicit' } },
      [first, second]
    )
    expect(explicit?.name).toBe('Explicit')

    const fallback = resolveFallbackRecoDetails({}, [first, second])
    expect(fallback?.name).toBe('RecoB')
  })
})
