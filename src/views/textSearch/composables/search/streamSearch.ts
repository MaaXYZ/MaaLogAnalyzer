import type { SearchResult } from '../types'
import type { StreamSearchOptions } from './searchTypes'
import {
  compileSearchPattern,
  findMatchInLine,
  pushSearchResult,
} from './matcher'
import { forEachFileLine } from '../stream/fileLineReader'

export const runStreamSearch = async (options: StreamSearchOptions): Promise<SearchResult[] | null> => {
  const searchPattern = compileSearchPattern(options.keyword, options.useRegex, options.caseSensitive)
  if (options.useRegex && !searchPattern) {
    return null
  }

  const results: SearchResult[] = []
  await forEachFileLine(
    {
      file: options.file,
      shouldAbort: options.shouldAbort,
    },
    (line, lineNumber) => {
      if (results.length >= options.maxResults) return false

      const match = findMatchInLine(
        line,
        options.keyword,
        options.useRegex,
        options.caseSensitive,
        searchPattern,
      )
      if (match) {
        pushSearchResult(results, lineNumber, line, match)
      }
    },
  )

  return results
}
