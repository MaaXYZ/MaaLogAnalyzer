import type { SearchResult } from '../types'
import { runNormalSearch } from './normalSearch'
import { runStreamSearch } from './streamSearch'

interface ExecuteSearchByModeOptions {
  fileContent: string
  fileHandle: File | null
  isLargeFile: boolean
  keyword: string
  useRegex: boolean
  caseSensitive: boolean
  maxResults: number
  shouldAbort: () => boolean
}

export const executeSearchByMode = async (
  options: ExecuteSearchByModeOptions,
): Promise<SearchResult[] | null> => {
  if (options.isLargeFile && options.fileHandle) {
    return runStreamSearch({
      file: options.fileHandle,
      keyword: options.keyword,
      useRegex: options.useRegex,
      caseSensitive: options.caseSensitive,
      maxResults: options.maxResults,
      shouldAbort: options.shouldAbort,
    })
  }

  return runNormalSearch({
    content: options.fileContent,
    keyword: options.keyword,
    useRegex: options.useRegex,
    caseSensitive: options.caseSensitive,
    maxResults: options.maxResults,
    shouldAbort: options.shouldAbort,
  })
}
