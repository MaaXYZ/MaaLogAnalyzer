import type { SearchResult } from '../types'
import type { NormalSearchOptions } from './searchTypes'
import { compileSearchPattern, findMatchInLine, pushSearchResult } from './matcher'

const SEARCH_CHUNK_SIZE = 1024 * 1024
const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

export const runContentSearch = async (options: NormalSearchOptions): Promise<SearchResult[] | null> => {
  const searchPattern = compileSearchPattern(options.keyword, options.useRegex, options.caseSensitive)
  if (options.useRegex && !searchPattern) return null

  const results: SearchResult[] = []
  let cursor = 0
  let lineNumber = 1
  let nextYieldAt = SEARCH_CHUNK_SIZE

  while (cursor <= options.content.length) {
    if (options.shouldAbort() || results.length >= options.maxResults) break

    let lineEnd = options.content.indexOf('\n', cursor)
    if (lineEnd < 0) lineEnd = options.content.length
    const line = options.content.slice(cursor, lineEnd)
    const match = findMatchInLine(
      line,
      options.keyword,
      options.useRegex,
      options.caseSensitive,
      searchPattern,
    )
    if (match) pushSearchResult(results, lineNumber, line, match)

    if (lineEnd >= options.content.length) break
    cursor = lineEnd + 1
    lineNumber += 1

    if (cursor >= nextYieldAt) {
      nextYieldAt = cursor + SEARCH_CHUNK_SIZE
      await yieldToMainThread()
    }
  }

  return results
}
