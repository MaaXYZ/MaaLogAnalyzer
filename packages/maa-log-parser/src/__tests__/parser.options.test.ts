import { describe, expect, it } from 'vitest'
import { LogParser } from '@windsland52/maa-log-parser'

describe('LogParser parse options', () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid chunkLineCount %s',
    async (chunkLineCount) => {
      const parser = new LogParser()

      await expect(
        parser.parseFile('non-empty', undefined, {
          chunkLineCount,
          yieldControl: null,
        }),
      ).rejects.toThrow(new RangeError('chunkLineCount must be a positive safe integer'))
    },
  )

  it('accepts a positive safe integer chunkLineCount', async () => {
    const parser = new LogParser()

    await expect(
      parser.parseFile('first\nsecond', undefined, {
        chunkLineCount: 1,
        yieldControl: null,
      }),
    ).resolves.toBeUndefined()
  })

  it('rejects a concurrent full parse without resetting the active input', async () => {
    const parser = new LogParser()
    const firstLine =
      '[2026-04-08 00:01:02.001][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":1,"entry":"First"}]'
    const secondLine =
      '[2026-04-08 00:01:02.002][INF][Px1][Tx2][test] !!!OnEventNotify!!! [handle=1] [msg=Tasker.Task.Starting] [details={"task_id":2,"entry":"Second"}]'
    let releaseFirstParse!: () => void
    let signalFirstYield!: () => void
    const firstParseBlocked = new Promise<void>((resolve) => {
      releaseFirstParse = resolve
    })
    const firstYieldReached = new Promise<void>((resolve) => {
      signalFirstYield = resolve
    })

    const firstParse = parser.parseFile(firstLine, undefined, {
      chunkLineCount: 1,
      yieldControl: async () => {
        signalFirstYield()
        await firstParseBlocked
      },
    })
    await firstYieldReached

    await expect(
      parser.parseFile(secondLine, undefined, {
        yieldControl: null,
      }),
    ).rejects.toThrow('A full parse is already in progress')

    releaseFirstParse()
    await firstParse

    expect(parser.getTasksSnapshot()).toMatchObject([{ task_id: 1, entry: 'First' }])
    expect(parser.getTasksSnapshot()).toHaveLength(1)
  })

  it('releases the full parse guard after a parse error', async () => {
    const parser = new LogParser()

    await expect(
      parser.parseFile('first', undefined, {
        yieldControl: () => {
          throw new Error('yield failed')
        },
      }),
    ).rejects.toThrow('yield failed')

    await expect(
      parser.parseFile('second', undefined, {
        yieldControl: null,
      }),
    ).resolves.toBeUndefined()
  })
})
