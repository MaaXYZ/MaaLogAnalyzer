import { useLoadedTargetSource } from '../useLoadedTargetSource'
import type { UseTextSearchViewModelOptions } from './types'
import type { ReturnTypeUseTextSearchState } from './stateTypes'

export const buildLoadedTargetSourceOptions = (
  state: ReturnTypeUseTextSearchState,
  options: UseTextSearchViewModelOptions,
): Parameters<typeof useLoadedTargetSource>[0] => ({
  loadedTargets: options.loadedTargets,
  loadedDefaultTargetId: options.loadedDefaultTargetId,
  hasDeferredLoadedTargets: options.hasDeferredLoadedTargets,
  ensureLoadedTargets: options.ensureLoadedTargets,
  ensureTargetContentLoaded: options.ensureTargetContentLoaded,
  fileName: state.fileName,
  fileContent: state.fileContent,
  fileHandle: state.fileHandle,
  fileSizeInMB: state.fileSizeInMB,
  isLargeFile: state.isLargeFile,
  totalLines: state.totalLines,
  showFileContent: state.showFileContent,
  contentKey: state.contentKey,
  isLoadingFile: state.isLoadingFile,
  sourceLoadGeneration: state.sourceLoadGeneration,
  sourceIntentGeneration: state.sourceIntentGeneration,
  resetSearchResultsOnly: state.resetSearchResultsOnly,
})
