import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import type { SourceMode } from './types'

export interface LoadedSourceStateOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  /** 懒加载策略下，切换到内容尚未加载的目标前调用，加载该目标内容 */
  ensureTargetContentLoaded?: (targetId: string) => Promise<void>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  fileSizeInMB: Ref<number>
  isLargeFile: Ref<boolean>
  totalLines: Ref<number>
  showFileContent: Ref<boolean>
  contentKey: Ref<number>
  isLoadingFile: Ref<boolean>
  sourceLoadGeneration: Ref<number>
  sourceIntentGeneration: Ref<number>
  resetSearchResultsOnly: () => void
}

export interface LoadedSourceActionOptions extends LoadedSourceStateOptions {
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  prepareLoadedTarget: (id: string) => void
}

export interface LoadedSourceSyncOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  ensureTargetContentLoaded?: (targetId: string) => Promise<void>
  fileName: Ref<string>
  sourceLoadGeneration: Ref<number>
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  prepareSourceMode: (mode: SourceMode) => void
  prepareLoadedTarget: (id: string) => void
  applyLoadedTarget: (target: LoadedSearchTarget | undefined) => Promise<void>
}
