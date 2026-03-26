import type { SearchResult } from '../types'

interface MatchRange {
  start: number
  end: number
}

export const compileSearchPattern = (keyword: string, useRegex: boolean, caseSensitive: boolean) => {
  if (!useRegex) return null
  try {
    return new RegExp(keyword, caseSensitive ? 'g' : 'gi')
  } catch {
    return null
  }
}

export const findMatchInLine = (
  line: string,
  keyword: string,
  useRegex: boolean,
  caseSensitive: boolean,
  searchPattern: RegExp | null,
): MatchRange | null => {
  let matchStart = -1
  let matchEnd = -1

  if (useRegex && searchPattern) {
    const matchResult = line.match(searchPattern)
    if (matchResult && matchResult.index !== undefined) {
      matchStart = matchResult.index
      matchEnd = matchStart + matchResult[0].length
    }
  } else if (caseSensitive) {
    matchStart = line.indexOf(keyword)
    if (matchStart !== -1) {
      matchEnd = matchStart + keyword.length
    }
  } else {
    const lowerLine = line.toLowerCase()
    const lowerSearch = keyword.toLowerCase()
    matchStart = lowerLine.indexOf(lowerSearch)
    if (matchStart !== -1) {
      matchEnd = matchStart + keyword.length
    }
  }

  return matchStart !== -1 ? { start: matchStart, end: matchEnd } : null
}

export const pushSearchResult = (
  results: SearchResult[],
  lineNumber: number,
  line: string,
  match: MatchRange,
) => {
  results.push({
    lineNumber,
    line,
    matchStart: match.start,
    matchEnd: match.end,
    context: line,
  })
}
