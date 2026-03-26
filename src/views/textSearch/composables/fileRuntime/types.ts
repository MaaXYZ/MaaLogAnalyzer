import type { Ref } from 'vue'
import type { SourceMode } from '../loadedSource/types'
import type { SearchResult } from '../types'

export interface TextSearchFileRuntimeOptions {
  sourceMode: Ref<SourceMode>
  isLoadingFile: Ref<boolean>
  isSearching: Ref<boolean>
  abortSearch: Ref<boolean>
  searchText: Ref<string>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  fileHandle: Ref<File | null>
  totalLines: Ref<number>
  contextLines: Ref<string[]>
  contextStartLine: Ref<number>
  selectedLine: Ref<number | null>
  showFileContent: Ref<boolean>
  contentKey: Ref<number>
  searchResults: Ref<SearchResult[]>
  totalMatches: Ref<number>
  topToolbarRef: Ref<{ resetFileInput: () => void } | null>
  contentPaneRef: Ref<{ scrollToLine: (lineNumber: number) => void } | null>
  filterDebugInfo: (line: string) => string
}

export interface HandleRuntimeFileUploadOptions {
  sourceMode: Ref<SourceMode>
  isLoadingFile: Ref<boolean>
  fileName: Ref<string>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  totalLines: Ref<number>
}

export interface ClearRuntimeContentOptions {
  abortSearch: Ref<boolean>
  isSearching: Ref<boolean>
  contentKey: Ref<number>
  showFileContent: Ref<boolean>
  selectedLine: Ref<number | null>
  searchResults: Ref<SearchResult[]>
  totalMatches: Ref<number>
  searchText: Ref<string>
  isLargeFile: Ref<boolean>
  fileHandle: Ref<File | null>
  totalLines: Ref<number>
  fileSizeInMB: Ref<number>
  contextLines: Ref<string[]>
  contextStartLine: Ref<number>
  fileContent: Ref<string>
  fileName: Ref<string>
  topToolbarRef: Ref<{ resetFileInput: () => void } | null>
}

export interface JumpToLineRuntimeOptions {
  selectedLine: Ref<number | null>
  isLargeFile: Ref<boolean>
  fileHandle: Ref<File | null>
  showFileContent: Ref<boolean>
  contentPaneRef: Ref<{ scrollToLine: (lineNumber: number) => void } | null>
}

export interface LoadContextLinesOptions {
  fileHandle: Ref<File | null>
  totalLines: Ref<number>
  contextLines: Ref<string[]>
  contextStartLine: Ref<number>
}
