export interface SearchExecutionOptions {
  keyword: string
  useRegex: boolean
  caseSensitive: boolean
  maxResults: number
}

export interface NormalSearchOptions extends SearchExecutionOptions {
  content: string
  shouldAbort: () => boolean
}

export interface StreamSearchOptions extends SearchExecutionOptions {
  file: File
  shouldAbort: () => boolean
}
