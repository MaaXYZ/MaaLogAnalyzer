import type { Ref } from 'vue'
import type { SearchResult } from './types'

interface HighlightParts {
  before: string
  match: string
  after: string
}

export const useTextSearchHighlighter = (
  hideDebugInfo: Ref<boolean>,
  filterDebugInfo: (line: string) => string,
) => {
  const highlightMatch = (result: SearchResult): HighlightParts => {
    const filteredLine = filterDebugInfo(result.line)
    if (hideDebugInfo.value && filteredLine !== result.line) {
      const matchText = result.line.substring(result.matchStart, result.matchEnd)
      const newMatchStart = filteredLine.indexOf(matchText)
      if (newMatchStart !== -1) {
        const before = filteredLine.substring(0, newMatchStart)
        const match = matchText
        const after = filteredLine.substring(newMatchStart + matchText.length)
        return { before, match, after }
      }
      return { before: filteredLine, match: '', after: '' }
    }

    const before = result.line.substring(0, result.matchStart)
    const match = result.line.substring(result.matchStart, result.matchEnd)
    const after = result.line.substring(result.matchEnd)
    return { before, match, after }
  }

  return {
    highlightMatch,
  }
}
