import { executeSearchByMode } from './executeByMode'
import { ensureSearchSourceReady } from './sourceGuard'
import type { TextSearchExecutionSnapshot, TextSearchSearchExecutorOptions } from './executorTypes'

export const buildSearchResultState = (options: TextSearchSearchExecutorOptions) => ({
  searchResults: options.searchResults,
  totalMatches: options.totalMatches,
})

export const buildSourceReadyOptions = (
  options: TextSearchSearchExecutorOptions,
): Parameters<typeof ensureSearchSourceReady>[0] => ({
  sourceMode: options.sourceMode,
  fileName: options.fileName,
  fileContent: options.fileContent,
  fileHandle: options.fileHandle,
  prepareSourceMode: options.prepareSourceMode,
  loadedTargets: options.loadedTargets,
  ensureDeferredLoadedTargetsReady: options.ensureDeferredLoadedTargetsReady,
  ensureLoadedTargetReady: options.ensureLoadedTargetReady,
})

export const buildExecuteByModeOptions = (
  options: TextSearchSearchExecutorOptions,
  snapshot: TextSearchExecutionSnapshot,
  shouldAbort: () => boolean,
): Parameters<typeof executeSearchByMode>[0] => ({
  fileContent: snapshot.fileContent,
  fileHandle: snapshot.fileHandle,
  isLargeFile: snapshot.isLargeFile,
  keyword: snapshot.keyword,
  useRegex: snapshot.useRegex,
  caseSensitive: snapshot.caseSensitive,
  maxResults: options.maxResults,
  shouldAbort,
})

export const buildSearchExecutionSnapshot = (
  options: TextSearchSearchExecutorOptions,
): TextSearchExecutionSnapshot => ({
  fileContent: options.fileContent.value,
  fileHandle: options.fileHandle.value,
  isLargeFile: options.isLargeFile.value,
  keyword: options.searchText.value,
  useRegex: options.useRegex.value,
  caseSensitive: options.caseSensitive.value,
})
