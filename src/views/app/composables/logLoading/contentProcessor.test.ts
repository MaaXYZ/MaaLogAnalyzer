import { afterEach, describe, expect, it, vi } from 'vitest'
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
  afterEach(() => {
    vi.useRealTimers()
  })

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

    expect(parser.parseInputs).toHaveBeenCalledWith(
      parseInputs,
      expect.any(Function),
      expect.objectContaining({ onInputParsed: expect.any(Function) }),
    )
    expect(parser.parseFile).not.toHaveBeenCalled()
  })

  it('decodes and chronologically sorts raw folder inputs for inline fallback', async () => {
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
    const encoder = new TextEncoder()

    await processLogContent({
      content: '',
      sortParseInputs: true,
      parseInputs: [
        {
          bytes: encoder.encode('[2026-04-16 15:00:00.000][INF] current\n'),
          sourceKey: 'maa.log',
          sourcePath: 'maa.log',
        },
        {
          bytes: encoder.encode('[2026-04-16 14:00:00.000][INF] backup\n'),
          sourceKey: 'maa.bak.log',
          sourcePath: 'maa.bak.log',
        },
      ],
    })

    expect(parser.parseInputs).toHaveBeenCalledWith(
      [
        expect.objectContaining({ sourcePath: 'maa.bak.log', inputIndex: 0 }),
        expect.objectContaining({ sourcePath: 'maa.log', inputIndex: 1 }),
      ],
      expect.any(Function),
      expect.objectContaining({ onInputParsed: expect.any(Function) }),
    )
  })

  it('emits incremental task summaries at each segment boundary and clears them on success', async () => {
    const summariesByBoundary = [
      [{ task_id: 1, entry: 'FirstTask', status: 'succeeded' as const, start_time: 't1', node_count: 1 }],
      [
        { task_id: 1, entry: 'FirstTask', status: 'succeeded' as const, start_time: 't1', node_count: 1 },
        { task_id: 2, entry: 'SecondTask', status: 'succeeded' as const, start_time: 't2', node_count: 2 },
      ],
    ]
    const parser = {
      resetParsedEvents: vi.fn(),
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseInputs: vi.fn(async (_inputs, _onProgress, options) => {
        options.onInputParsed({ index: 0, total: 2 })
        options.onInputParsed({ index: 1, total: 2 })
      }),
      parseFile: vi.fn(async () => undefined),
      getTaskSummaries: vi.fn(() => summariesByBoundary.shift() ?? []),
      consumeTasks: vi.fn(() => [
        {
          task_id: 1,
          entry: 'FirstTask',
          hash: '',
          uuid: '',
          start_time: 't1',
          status: 'succeeded',
          nodes: [],
          events: [],
        },
      ]),
    } as unknown as LogParser

    const onTaskSummaries = vi.fn()
    const processLogContent = createProcessLogContent({
      ...createOptions(parser),
      onTaskSummaries,
    })

    await processLogContent({
      content: '',
      parseInputs: [
        { content: 'first', sourceKey: 'seg-1', sourcePath: 'seg-1', inputIndex: 0 },
        { content: 'second', sourceKey: 'seg-2', sourcePath: 'seg-2', inputIndex: 1 },
      ],
    })

    // 起点清空 → 两个分卷边界各发一次 → 成功后清空
    expect(onTaskSummaries.mock.calls.map((call) => (call[0] as unknown[]).length)).toEqual([
      0, 1, 2, 0,
    ])
    expect(onTaskSummaries.mock.calls[1]![1]).toEqual({ parsedInputs: 1, totalInputs: 2 })
    expect(onTaskSummaries.mock.calls[2]![1]).toEqual({ parsedInputs: 2, totalInputs: 2 })
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
      parseFile: vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishFirstParse = resolve
          }),
      ),
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
    options.createParser = vi
      .fn()
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

  const createParserStub = (parseFile: () => Promise<void>) =>
    ({
      resetParsedEvents: vi.fn(),
      setErrorImages: vi.fn(),
      setVisionImages: vi.fn(),
      setWaitFreezesImages: vi.fn(),
      parseInputs: vi.fn(async () => undefined),
      parseFile: vi.fn(parseFile),
      consumeTasks: vi.fn(() => []),
    }) as unknown as LogParser

  it('does not flash the parsing modal when parsing finishes quickly', async () => {
    vi.useFakeTimers()
    const options = createOptions(createParserStub(async () => undefined))
    const processLogContent = createProcessLogContent(options)

    await processLogContent({ content: 'sample' })
    expect(options.showParsingModal.value).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(options.showParsingModal.value).toBe(false)
  })

  it('shows the parsing modal only when parsing outlasts the delay', async () => {
    vi.useFakeTimers()
    let finishParse!: () => void
    const options = createOptions(
      createParserStub(
        () =>
          new Promise<void>((resolve) => {
            finishParse = resolve
          }),
      ),
    )
    const processLogContent = createProcessLogContent(options)

    const request = processLogContent({ content: 'big log' })
    expect(options.showParsingModal.value).toBe(false)

    vi.advanceTimersByTime(300)
    expect(options.showParsingModal.value).toBe(true)

    finishParse()
    await request
    expect(options.showParsingModal.value).toBe(false)

    vi.advanceTimersByTime(1000)
    expect(options.showParsingModal.value).toBe(false)
  })
})
