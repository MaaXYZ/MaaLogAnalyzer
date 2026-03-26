import { executeSearchByMode } from './executeByMode'
import { ensureSearchSourceReady } from './sourceGuard'
import type { TextSearchSearchExecutorOptions } from './executorTypes'

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
  loadedTargets: options.loadedTargets,
  ensureDeferredLoadedTargetsReady: options.ensureDeferredLoadedTargetsReady,
  ensureLoadedTargetReady: options.ensureLoadedTargetReady,
})

export const buildExecuteByModeOptions = (
  options: TextSearchSearchExecutorOptions,
): Parameters<typeof executeSearchByMode>[0] => ({
  fileContent: options.fileContent.value,
  fileHandle: options.fileHandle.value,
  isLargeFile: options.isLargeFile.value,
  keyword: options.searchText.value,
  useRegex: options.useRegex.value,
  caseSensitive: options.caseSensitive.value,
  maxResults: options.maxResults,
  shouldAbort: () => options.abortSearch.value,
})
