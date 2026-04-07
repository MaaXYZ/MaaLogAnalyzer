import { describe, expect, it } from 'vitest'
import {
  decodeTaskLifecycleEventDetails,
  readNumberField,
  readStringField,
} from '../logEventDecoders'

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
      })
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
      })
    ).toEqual({
      task_id: undefined,
      entry: '',
      hash: '',
      uuid: '',
    })
  })
})
