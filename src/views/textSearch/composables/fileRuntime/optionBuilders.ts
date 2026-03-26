import type {
  ClearRuntimeContentOptions,
  HandleRuntimeFileUploadOptions,
  JumpToLineRuntimeOptions,
  LoadContextLinesOptions,
  TextSearchFileRuntimeOptions,
} from './types'

export const buildHandleFileUploadOptions = (
  options: TextSearchFileRuntimeOptions,
): HandleRuntimeFileUploadOptions => ({
  sourceMode: options.sourceMode,
  isLoadingFile: options.isLoadingFile,
  fileName: options.fileName,
  fileSizeInMB: options.fileSizeInMB,
  isLargeFile: options.isLargeFile,
  fileContent: options.fileContent,
  fileHandle: options.fileHandle,
  totalLines: options.totalLines,
})

export const buildClearRuntimeOptions = (
  options: TextSearchFileRuntimeOptions,
): ClearRuntimeContentOptions => ({
  abortSearch: options.abortSearch,
  isSearching: options.isSearching,
  contentKey: options.contentKey,
  showFileContent: options.showFileContent,
  selectedLine: options.selectedLine,
  searchResults: options.searchResults,
  totalMatches: options.totalMatches,
  searchText: options.searchText,
  isLargeFile: options.isLargeFile,
  fileHandle: options.fileHandle,
  totalLines: options.totalLines,
  fileSizeInMB: options.fileSizeInMB,
  contextLines: options.contextLines,
  contextStartLine: options.contextStartLine,
  fileContent: options.fileContent,
  fileName: options.fileName,
  topToolbarRef: options.topToolbarRef,
})

export const buildLoadContextLinesOptions = (
  options: TextSearchFileRuntimeOptions,
): LoadContextLinesOptions => ({
  fileHandle: options.fileHandle,
  totalLines: options.totalLines,
  contextLines: options.contextLines,
  contextStartLine: options.contextStartLine,
})

export const buildJumpToLineOptions = (
  options: TextSearchFileRuntimeOptions,
): JumpToLineRuntimeOptions => ({
  selectedLine: options.selectedLine,
  isLargeFile: options.isLargeFile,
  fileHandle: options.fileHandle,
  showFileContent: options.showFileContent,
  contentPaneRef: options.contentPaneRef,
})
