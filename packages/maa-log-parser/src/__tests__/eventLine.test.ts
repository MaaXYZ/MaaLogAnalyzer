import { describe, expect, it } from 'vitest'
import { parseEventLine } from '../event/line'

const identity = (value: string) => value

describe('EventLine', () => {
  it('parses valid OnEventNotify line with normalized timestamp and dedup signature', () => {
    const line = '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"Main"}]'
    const parsed = parseEventLine(line, 10, {
      internEventToken: identity,
      forceCopyString: identity,
    })

    expect(parsed).toBeTruthy()
    expect(parsed?.timestamp).toBe('2026-04-08 00:01:02.345')
    expect(parsed?._lineNumber).toBe(10)
    expect(parsed?.processId).toBe('Px1')
    expect(parsed?.threadId).toBe('Tx2')
    expect(parsed?.message).toBe('Tasker.Task.Starting')
    expect(parsed?.details.task_id).toBe(1)
    expect(parsed?._dedupSignature.startsWith('Tasker.Task.Starting|')).toBe(true)
  })

  it('returns null for non-event line or malformed details json', () => {
    const nonEvent = parseEventLine('plain line', 1, {
      internEventToken: identity,
      forceCopyString: identity,
    })
    expect(nonEvent).toBeNull()

    const malformed = parseEventLine(
      '[2026-04-08 00:01:02.345][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={bad-json}]',
      2,
      {
        internEventToken: identity,
        forceCopyString: identity,
      }
    )
    expect(malformed).toBeNull()
  })
})
