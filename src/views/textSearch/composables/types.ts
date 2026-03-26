export interface LoadedSearchTarget {
  id: string
  label: string
  fileName: string
  content: string
}

export interface SearchResult {
  lineNumber: number
  line: string
  matchStart: number
  matchEnd: number
  context: string
}
