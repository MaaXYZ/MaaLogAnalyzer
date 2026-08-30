import { describe, expect, it } from 'vitest'
import { collectWorkerInputTransfers, type LogParserWorkerInput } from '../parserWorkerProtocol'

describe('collectWorkerInputTransfers', () => {
  it('transfers every byte buffer so the main thread drops ownership', () => {
    const first = new ArrayBuffer(8)
    const second = new ArrayBuffer(16)
    const inputs: LogParserWorkerInput[] = [
      { bytes: first, sourcePath: 'debug/maa.log' },
      { bytes: second, sourcePath: 'debug/maa.bak.log' },
    ]

    expect(collectWorkerInputTransfers(inputs)).toEqual([first, second])
  })

  it('skips string-only inputs that cannot be transferred', () => {
    const bytes = new ArrayBuffer(4)
    const inputs: LogParserWorkerInput[] = [{ content: 'inline log text' }, { bytes }]

    expect(collectWorkerInputTransfers(inputs)).toEqual([bytes])
  })

  it('returns an empty transfer list when nothing is transferable', () => {
    expect(collectWorkerInputTransfers([{ content: 'a' }, { content: 'b' }])).toEqual([])
  })

  it('deduplicates shared buffers in the transfer list', () => {
    const bytes = new ArrayBuffer(4)

    expect(collectWorkerInputTransfers([{ bytes }, { bytes }])).toEqual([bytes])
  })
})
