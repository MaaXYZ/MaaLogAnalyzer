import type { SearchResult } from '../types'
import type { NormalSearchOptions } from './searchTypes'
import {
  compileSearchPattern,
  findMatchInLine,
  pushSearchResult,
} from './matcher'

export const runNormalSearch = async (options: NormalSearchOptions): Promise<SearchResult[] | null> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      const searchPattern = compileSearchPattern(options.keyword, options.useRegex, options.caseSensitive)
      if (options.useRegex && !searchPattern) {
        resolve(null)
        return
      }

      const lines = options.content.split('\n')
      const results: SearchResult[] = []

      for (let index = 0; index < lines.length; index++) {
        if (options.shouldAbort() || results.length >= options.maxResults) break

        const line = lines[index]
        const match = findMatchInLine(
          line,
          options.keyword,
          options.useRegex,
          options.caseSensitive,
          searchPattern,
        )
        if (match) {
          pushSearchResult(results, index + 1, line, match)
        }
      }

      resolve(results)
    }, 10)
  })
}
