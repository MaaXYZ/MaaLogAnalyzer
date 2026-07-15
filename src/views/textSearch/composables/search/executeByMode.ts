import type { SearchResult } from '../types'
import { runNormalSearch } from './normalSearch'
import { runStreamSearch } from './streamSearch'
import { runContentSearch } from './contentSearch'

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
  if (options.isLargeFile) {
    const commonOptions = {
      keyword: options.keyword,
      useRegex: options.useRegex,
      caseSensitive: options.caseSensitive,
      maxResults: options.maxResults,
      shouldAbort: options.shouldAbort,
    }
    return options.fileHandle
      ? runStreamSearch({ file: options.fileHandle, ...commonOptions })
      : runContentSearch({ content: options.fileContent, ...commonOptions })
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
