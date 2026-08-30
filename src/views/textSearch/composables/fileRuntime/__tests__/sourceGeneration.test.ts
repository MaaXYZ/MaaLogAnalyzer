import { describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'
import { createFileRuntimeActions } from '../actions'
import { buildHandleFileUploadOptions } from '../optionBuilders'
import { handleRuntimeFileUpload } from '../uploadAction'
import { loadContextLinesForRuntime } from '../contextLoader'
import type { TextSearchFileRuntimeOptions } from '../types'
import type { SearchResult } from '../../types'
import type { SourceMode } from '../../loadedSource/types'
import type { readUploadedFile } from '../fileUpload'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

type UploadedFile = Awaited<ReturnType<typeof readUploadedFile>>

const createRuntimeOptions = (): TextSearchFileRuntimeOptions => {
  const sourceLoadGeneration = ref(0)
  const sourceIntentGeneration = ref(0)
  const searchRequestGeneration = ref(0)
  const isSearching = ref(false)
  const searchResults = ref<SearchResult[]>([])
  const totalMatches = ref(0)
  const contextLines = ref<string[]>([])
  const contextStartLine = ref(0)
  const resetSearchResultsOnly = vi.fn(() => {
    searchRequestGeneration.value += 1
    isSearching.value = false
    searchResults.value = []
    totalMatches.value = 0
    contextLines.value = []
    contextStartLine.value = 0
  })

  return {
    sourceMode: ref<SourceMode>('manual'),
    sourceLoadGeneration,
    sourceIntentGeneration,
    isLoadingFile: ref(false),
    isSearching,
    searchRequestGeneration,
    resetSearchResultsOnly,
    searchText: ref(''),
    fileName: ref('old.log'),
    fileContent: ref('old content'),
    fileSizeInMB: ref(1),
    isLargeFile: ref(false),
    fileHandle: ref<File | null>(null),
    totalLines: ref(1),
    contextLines,
    contextStartLine,
    selectedLine: ref<number | null>(null),
    showFileContent: ref(false),
    contentKey: ref(0),
    searchResults,
    totalMatches,
    topToolbarRef: ref<{ resetFileInput: () => void } | null>(null),
    contentPaneRef: ref<{ scrollToLine: (lineNumber: number) => void } | null>(null),
    filterDebugInfo: (line) => line,
  }
}

const createUploadEvent = (name: string): Event =>
  ({
    target: {
      files: [{ name } as File],
    },
  }) as unknown as Event

const createUploadedFile = (fileName: string): UploadedFile => ({
  fileName,
  fileSizeInMB: 1,
  isLargeFile: false,
  fileContent: `${fileName} content`,
  fileHandle: null,
  totalLines: 1,
})

describe('file source generations', () => {
  it('only lets the latest manual upload commit or finish loading', async () => {
    const options = createRuntimeOptions()
    const first = createDeferred<UploadedFile>()
    const second = createDeferred<UploadedFile>()
    const reportError = vi.fn<(error: unknown) => void>()
    const readFile = vi.fn((file: File) =>
      file.name === 'first.log' ? first.promise : second.promise,
    )
    const uploadOptions = buildHandleFileUploadOptions(options)

    const firstRun = handleRuntimeFileUpload(uploadOptions, createUploadEvent('first.log'), {
      readFile,
      reportError,
    })
    const secondRun = handleRuntimeFileUpload(uploadOptions, createUploadEvent('second.log'), {
      readFile,
      reportError,
    })

    first.resolve(createUploadedFile('first.log'))
    await firstRun

    expect(options.fileName.value).toBe('old.log')
    expect(options.isLoadingFile.value).toBe(true)

    second.resolve(createUploadedFile('second.log'))
    await secondRun

    expect(options.fileName.value).toBe('second.log')
    expect(options.fileContent.value).toBe('second.log content')
    expect(options.isLoadingFile.value).toBe(false)
    expect(reportError).not.toHaveBeenCalled()
  })

  it('does not let a pending upload restore content after clear', async () => {
    const options = createRuntimeOptions()
    const pending = createDeferred<UploadedFile>()
    const upload = handleRuntimeFileUpload(
      buildHandleFileUploadOptions(options),
      createUploadEvent('pending.log'),
      { readFile: () => pending.promise },
    )

    createFileRuntimeActions(options).clearContent()

    expect(options.fileName.value).toBe('')
    expect(options.fileContent.value).toBe('')
    expect(options.isLoadingFile.value).toBe(false)

    pending.resolve(createUploadedFile('pending.log'))
    await upload
    await nextTick()

    expect(options.fileName.value).toBe('')
    expect(options.fileContent.value).toBe('')
  })

  it('keeps the newest context request when an older read finishes last', async () => {
    const options = createRuntimeOptions()
    options.isLargeFile.value = true
    const first = createDeferred<void>()
    const second = createDeferred<void>()
    const loadContext = vi.fn(
      async (
        loaderOptions: Parameters<typeof loadContextLinesForRuntime>[0],
        targetLine: number,
        dependencies?: Parameters<typeof loadContextLinesForRuntime>[2],
      ) => {
        await (targetLine === 1 ? first.promise : second.promise)
        if (dependencies?.shouldApply?.()) {
          loaderOptions.contextLines.value = [`context ${targetLine}`]
          loaderOptions.contextStartLine.value = targetLine
        }
      },
    )
    const actions = createFileRuntimeActions(options, { loadContextLines: loadContext })

    const firstJump = actions.jumpToLine(1)
    const secondJump = actions.jumpToLine(2)

    second.resolve()
    await secondJump
    first.resolve()
    await firstJump

    expect(options.contextLines.value).toEqual(['context 2'])
    expect(options.contextStartLine.value).toBe(2)
    expect(options.selectedLine.value).toBe(2)
  })

  it('drops context loaded from a superseded source', async () => {
    const options = createRuntimeOptions()
    const pending = createDeferred<{ lines: string[]; startLine: number }>()
    const load = loadContextLinesForRuntime(
      {
        sourceLoadGeneration: options.sourceLoadGeneration,
        fileHandle: options.fileHandle,
        fileContent: options.fileContent,
        totalLines: options.totalLines,
        contextLines: options.contextLines,
        contextStartLine: options.contextStartLine,
      },
      1,
      { readFromContent: () => pending.promise },
    )

    options.sourceLoadGeneration.value += 1
    pending.resolve({ lines: ['stale'], startLine: 1 })
    await load

    expect(options.contextLines.value).toEqual([])
  })
})
