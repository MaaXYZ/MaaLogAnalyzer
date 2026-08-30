import { describe, expect, it } from 'vitest'
import {
  decodeCompactActionDetails,
  decodeCompactNodeDetails,
  decodeEventIdentityIds,
  decodeTaskLifecycleEventDetails,
  parseNumericArray,
  parseRoi,
  parseWaitFreezesParam,
  readNumberField,
  readStringField,
} from '@windsland52/maa-log-parser/log-event-decoders'

describe('logEventDecoders', () => {
  it('reads typed number and string fields', () => {
    const details = {
      task_id: 42,
      entry: 'MainTask',
    }

    expect(readNumberField(details, 'task_id')).toBe(42)
    expect(readStringField(details, 'entry')).toBe('MainTask')
  })

  it('returns undefined for mismatched field types', () => {
    const details = {
      task_id: '42',
      entry: 100,
    }

    expect(readNumberField(details, 'task_id')).toBeUndefined()
    expect(readStringField(details, 'entry')).toBeUndefined()
  })

  it('decodes task lifecycle details with safe defaults', () => {
    expect(
      decodeTaskLifecycleEventDetails({
        task_id: 7,
        entry: 'Run',
        hash: 'abc',
        uuid: 'u-1',
      }),
    ).toEqual({
      task_id: 7,
      entry: 'Run',
      hash: 'abc',
      uuid: 'u-1',
    })

    expect(
      decodeTaskLifecycleEventDetails({
        task_id: 'bad',
        entry: 0,
      }),
    ).toEqual({
      task_id: undefined,
      entry: '',
      hash: '',
      uuid: '',
    })
  })

  it('decodes common identity ids', () => {
    expect(
      decodeEventIdentityIds({
        task_id: 1,
        node_id: 2,
        reco_id: 3,
        action_id: 4,
        wf_id: 5,
      }),
    ).toEqual({
      task_id: 1,
      node_id: 2,
      reco_id: 3,
      action_id: 4,
      wf_id: 5,
    })

    expect(
      decodeEventIdentityIds({
        task_id: '1',
        node_id: null,
      }),
    ).toEqual({
      task_id: undefined,
      node_id: undefined,
      reco_id: undefined,
      action_id: undefined,
      wf_id: undefined,
    })
  })

  it('parses numeric array and ROI safely', () => {
    expect(parseNumericArray([1, '2', 'x', 3.5])).toEqual([1, 2, 3.5])
    expect(parseNumericArray(['x', undefined])).toBeUndefined()

    expect(parseRoi([1, 2, '3', 4])).toEqual([1, 2, 3, 4])
    expect(parseRoi([1, 2, 3])).toBeUndefined()
    expect(parseRoi(['x', 2, 3, 4])).toBeUndefined()
  })

  it('parses wait-freezes param with known numeric keys only', () => {
    expect(
      parseWaitFreezesParam({
        method: 1,
        rate_limit: 0.5,
        threshold: 0.8,
        time: 10,
        timeout: 1000,
        unexpected: 999,
      }),
    ).toEqual({
      method: 1,
      rate_limit: 0.5,
      threshold: 0.8,
      time: 10,
      timeout: 1000,
    })

    expect(parseWaitFreezesParam({ method: '1' })).toBeUndefined()
    expect(parseWaitFreezesParam(null)).toBeUndefined()
  })

  it('decodes compact action details safely', () => {
    expect(
      decodeCompactActionDetails({
        action_id: 3,
        action: 'Tap',
        name: 'DoTap',
        success: true,
        ignored: 1,
      }),
    ).toEqual({
      action_id: 3,
      action: 'Tap',
      name: 'DoTap',
      success: true,
    })

    expect(decodeCompactActionDetails({ action_id: 'bad' })).toBeUndefined()
    expect(decodeCompactActionDetails(null)).toBeUndefined()
  })

  it('decodes compact node details safely', () => {
    expect(
      decodeCompactNodeDetails({
        action_id: 7,
        node_id: 11,
        extra: 'x',
      }),
    ).toEqual({
      action_id: 7,
      node_id: 11,
    })

    expect(decodeCompactNodeDetails({ action_id: 'x', node_id: null })).toBeUndefined()
    expect(decodeCompactNodeDetails(undefined)).toBeUndefined()
  })
})
