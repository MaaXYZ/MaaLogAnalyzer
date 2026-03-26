import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import type { SourceMode } from './types'

export interface LoadedSourceStateOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  totalLines: Ref<number>
  showFileContent: Ref<boolean>
  contentKey: Ref<number>
  isLoadingFile: Ref<boolean>
  resetSearchResultsOnly: () => void
}

export interface LoadedSourceActionOptions extends LoadedSourceStateOptions {
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
}

export interface LoadedSourceSyncOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  fileName: Ref<string>
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  applyLoadedTarget: (target: LoadedSearchTarget | undefined) => Promise<void>
}
