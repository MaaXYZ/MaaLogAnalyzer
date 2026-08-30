import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createPerformSearchAction } from '../performSearchAction'
import { executeSearchByMode } from '../executeByMode'
import type { TextSearchSearchExecutorOptions } from '../executorTypes'
import type { LoadedSearchTarget, SearchResult } from '../../types'
import type { SourceMode } from '../../loadedSource/types'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
}

type ExecuteSearchOptions = Parameters<typeof executeSearchByMode>[0]

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

const createResult = (line: string): SearchResult => ({
  lineNumber: 1,
  line,
  matchStart: 0,
  matchEnd: line.length,
  context: line,
})

const createOptions = () => {
  const addToHistory = vi.fn<(text: string) => void>()
  const options: TextSearchSearchExecutorOptions = {
    searchText: ref(''),
    fileName: ref('maa.log'),
    fileContent: ref('content'),
    fileHandle: ref<File | null>(null),
    isLargeFile: ref(false),
    isLoadingFile: ref(false),
    isSearching: ref(false),
    sourceLoadGeneration: ref(0),
    sourceIntentGeneration: ref(0),
    sourceMode: ref<SourceMode>('manual'),
    prepareSourceMode: vi.fn(),
    loadedTargets: ref<LoadedSearchTarget[] | undefined>(undefined),
    ensureDeferredLoadedTargetsReady: async () => {},
    ensureLoadedTargetReady: async () => true,
    caseSensitive: ref(false),
    useRegex: ref(false),
    maxResults: 500,
    searchResults: ref<SearchResult[]>([]),
    totalMatches: ref(0),
    addToHistory,
    searchRequestGeneration: ref(0),
  }
  return { options, addToHistory }
}

describe('createPerformSearchAction', () => {
  it('only commits the latest request and keeps its loading state isolated', async () => {
    const { options, addToHistory } = createOptions()
    const first = createDeferred<SearchResult[] | null>()
    const second = createDeferred<SearchResult[] | null>()
    const executeSearch = vi.fn((execution: ExecuteSearchOptions) => {
      return execution.keyword === 'first' ? first.promise : second.promise
    })
    const performSearch = createPerformSearchAction(options, {
      ensurePreconditions: async () => true,
      executeSearch,
    })

    options.searchText.value = 'first'
    const firstRun = performSearch()
    await vi.waitFor(() => expect(executeSearch).toHaveBeenCalledTimes(1))

    options.searchText.value = 'second'
    const secondRun = performSearch()
    await vi.waitFor(() => expect(executeSearch).toHaveBeenCalledTimes(2))

    const firstExecution = executeSearch.mock.calls[0]?.[0]
    expect(firstExecution?.keyword).toBe('first')
    expect(firstExecution?.shouldAbort()).toBe(true)

    first.resolve([createResult('first result')])
    await firstRun

    expect(options.searchResults.value).toEqual([])
    expect(options.isSearching.value).toBe(true)
    expect(addToHistory).not.toHaveBeenCalled()

    second.resolve([createResult('second result')])
    await secondRun

    expect(options.searchResults.value).toEqual([createResult('second result')])
    expect(options.totalMatches.value).toBe(1)
    expect(options.isSearching.value).toBe(false)
    expect(addToHistory).toHaveBeenCalledOnce()
    expect(addToHistory).toHaveBeenCalledWith('second')
  })

  it('does not let an older precondition completion overtake a newer search', async () => {
    const { options } = createOptions()
    const firstReady = createDeferred<boolean>()
    const secondReady = createDeferred<boolean>()
    const ensurePreconditions = vi
      .fn()
      .mockReturnValueOnce(firstReady.promise)
      .mockReturnValueOnce(secondReady.promise)
    const executeSearch = vi.fn(async (_execution: ExecuteSearchOptions) => [
      createResult('second result'),
    ])
    const performSearch = createPerformSearchAction(options, {
      ensurePreconditions,
      executeSearch,
    })

    options.searchText.value = 'first'
    const firstRun = performSearch()
    await vi.waitFor(() => expect(ensurePreconditions).toHaveBeenCalledTimes(1))

    options.searchText.value = 'second'
    const secondRun = performSearch()
    await vi.waitFor(() => expect(ensurePreconditions).toHaveBeenCalledTimes(2))

    secondReady.resolve(true)
    await secondRun
    firstReady.resolve(true)
    await firstRun

    expect(executeSearch).toHaveBeenCalledTimes(1)
    expect(executeSearch.mock.calls[0]?.[0].keyword).toBe('second')
    expect(options.searchResults.value).toEqual([createResult('second result')])
  })

  it('ignores results and errors after the source generation is invalidated', async () => {
    const { options, addToHistory } = createOptions()
    const pending = createDeferred<SearchResult[] | null>()
    const reportError = vi.fn<(error: unknown) => void>()
    const performSearch = createPerformSearchAction(options, {
      ensurePreconditions: async () => true,
      executeSearch: () => pending.promise,
      reportError,
    })

    options.searchText.value = 'stale'
    const run = performSearch()
    await vi.waitFor(() => expect(options.isSearching.value).toBe(true))

    options.sourceLoadGeneration.value += 1
    options.isSearching.value = false
    pending.reject(new Error('stale failure'))
    await run

    expect(options.searchResults.value).toEqual([])
    expect(addToHistory).not.toHaveBeenCalled()
    expect(reportError).not.toHaveBeenCalled()
    expect(options.isSearching.value).toBe(false)
  })

  it('does not migrate a deferred search onto a new user-selected source', async () => {
    const { options } = createOptions()
    const ready = createDeferred<boolean>()
    const executeSearch = vi.fn(async (_execution: ExecuteSearchOptions) => [
      createResult('unexpected'),
    ])
    const performSearch = createPerformSearchAction(options, {
      ensurePreconditions: () => ready.promise,
      executeSearch,
    })

    options.searchText.value = 'old source'
    const run = performSearch()
    options.sourceIntentGeneration.value += 1
    ready.resolve(true)
    await run

    expect(executeSearch).not.toHaveBeenCalled()
    expect(options.searchResults.value).toEqual([])
    expect(options.isSearching.value).toBe(false)
  })

  it('clears stale results and keeps invalid regex searches out of history', async () => {
    const { options, addToHistory } = createOptions()
    const reportError = vi.fn<(error: unknown) => void>()
    options.searchText.value = '['
    options.useRegex.value = true
    options.searchResults.value = [createResult('stale result')]
    options.totalMatches.value = 1
    const performSearch = createPerformSearchAction(options, {
      ensurePreconditions: async () => true,
      reportError,
    })

    await performSearch()

    expect(options.searchResults.value).toEqual([])
    expect(options.totalMatches.value).toBe(0)
    expect(addToHistory).not.toHaveBeenCalled()
    expect(reportError).toHaveBeenCalledOnce()
    expect(reportError.mock.calls[0]?.[0]).toMatchObject({
      message: '无效的正则表达式',
    })
  })
})
