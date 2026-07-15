import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import type { LogParser, ParseSourceInput } from '@windsland52/maa-log-parser'
import { createProcessLogContent } from './contentProcessor'
import type { LogLoadingPipelineOptions } from './types'

const createOptions = (parser: LogParser): LogLoadingPipelineOptions => ({
  parser,
  createParser: () => parser,
  loading: ref(false),
  showParsingModal: ref(false),
  parseProgress: ref(0),
  stopRealtimeSession: vi.fn(),
  resetAnalysisState: vi.fn(),
  resetParserDebugAssets: vi.fn(),
  setDeferredTextSearchTargets: vi.fn(),
  pickPreferredLogTargetId: vi.fn(() => ''),
  applyParsedTasks: vi.fn(),
  onWarning: vi.fn(),
  onError: vi.fn(),
})

describe('createProcessLogContent', () => {
  it('routes folder parse inputs through parseInputs', async () => {
    const parser = {
      resetParsedEvents: vi.fn(),
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseInputs: vi.fn(async () => undefined),
      parseFile: vi.fn(async () => undefined),
      consumeTasks: vi.fn(() => []),
    } as unknown as LogParser
    const processLogContent = createProcessLogContent(createOptions(parser))
    const parseInputs: ParseSourceInput[] = [
      {
        content: 'first',
        sourceKey: 'maa.bak.log',
        sourcePath: 'maa.bak.log',
        inputIndex: 0,
      },
      {
        content: 'second',
        sourceKey: 'maa.log',
        sourcePath: 'maa.log',
        inputIndex: 1,
      },
    ]

    await processLogContent({ content: '', parseInputs })

    expect(parser.parseInputs).toHaveBeenCalledWith(parseInputs, expect.any(Function))
    expect(parser.parseFile).not.toHaveBeenCalled()
  })

  it('keeps content-only callers on parseFile', async () => {
    const parser = {
      resetParsedEvents: vi.fn(),
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseInputs: vi.fn(async () => undefined),
      parseFile: vi.fn(async () => undefined),
      consumeTasks: vi.fn(() => []),
    } as unknown as LogParser
    const processLogContent = createProcessLogContent(createOptions(parser))

    await processLogContent({ content: 'single log' })

    expect(parser.parseFile).toHaveBeenCalledWith('single log', expect.any(Function))
    expect(parser.parseInputs).not.toHaveBeenCalled()
  })

  it('discards an older parse that finishes after a newer request', async () => {
    let finishFirstParse!: () => void
    const firstParser = {
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseFile: vi.fn(() => new Promise<void>((resolve) => { finishFirstParse = resolve })),
      consumeTasks: vi.fn(() => [{ task_id: 1 }]),
    } as unknown as LogParser
    const secondParser = {
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseFile: vi.fn(async () => undefined),
      consumeTasks: vi.fn(() => [{ task_id: 2 }]),
    } as unknown as LogParser
    const rootParser = { resetParsedEvents: vi.fn() } as unknown as LogParser
    const options = createOptions(rootParser)
    options.createParser = vi.fn()
      .mockReturnValueOnce(firstParser)
      .mockReturnValueOnce(secondParser)
    const processLogContent = createProcessLogContent(options)

    const firstRequest = processLogContent({ content: 'first' })
    await processLogContent({ content: 'second' })
    finishFirstParse()
    await firstRequest

    expect(options.applyParsedTasks).toHaveBeenCalledTimes(1)
    expect(options.applyParsedTasks).toHaveBeenCalledWith([{ task_id: 2 }], false)
  })
})
