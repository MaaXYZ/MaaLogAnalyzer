import { useTextSearchFileRuntime } from '../useTextSearchFileRuntime'
import type { TextSearchSearchExecutorOptions } from '../search'
import type { TextSearchViewContext } from './useTextSearchViewContext'
import type { UseTextSearchViewModelOptions } from './types'

export const buildSearchExecutorOptions = (
  context: TextSearchViewContext,
  options: UseTextSearchViewModelOptions,
): TextSearchSearchExecutorOptions => ({
  searchText: context.searchText,
  fileName: context.fileName,
  fileContent: context.fileContent,
  fileHandle: context.fileHandle,
  isLargeFile: context.isLargeFile,
  isLoadingFile: context.isLoadingFile,
  isSearching: context.isSearching,
  sourceMode: context.sourceMode,
  loadedTargets: options.loadedTargets,
  ensureDeferredLoadedTargetsReady: context.ensureDeferredLoadedTargetsReady,
  ensureLoadedTargetReady: context.ensureLoadedTargetReady,
  caseSensitive: context.caseSensitive,
  useRegex: context.useRegex,
  maxResults: context.maxResults,
  searchResults: context.searchResults,
  totalMatches: context.totalMatches,
  addToHistory: context.addToHistory,
  abortSearch: context.abortSearch,
})

export const buildFileRuntimeOptions = (
  context: TextSearchViewContext,
): Parameters<typeof useTextSearchFileRuntime>[0] => ({
  sourceMode: context.sourceMode,
  isLoadingFile: context.isLoadingFile,
  isSearching: context.isSearching,
  abortSearch: context.abortSearch,
  searchText: context.searchText,
  fileName: context.fileName,
  fileContent: context.fileContent,
  fileSizeInMB: context.fileSizeInMB,
  isLargeFile: context.isLargeFile,
  fileHandle: context.fileHandle,
  totalLines: context.totalLines,
  contextLines: context.contextLines,
  contextStartLine: context.contextStartLine,
  selectedLine: context.selectedLine,
  showFileContent: context.showFileContent,
  contentKey: context.contentKey,
  searchResults: context.searchResults,
  totalMatches: context.totalMatches,
  topToolbarRef: context.topToolbarRef,
  contentPaneRef: context.contentPaneRef,
  filterDebugInfo: context.filterDebugInfo,
})
