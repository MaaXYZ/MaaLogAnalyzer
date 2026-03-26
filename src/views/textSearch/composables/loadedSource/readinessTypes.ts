import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'
import type { SourceMode } from './types'

export interface EnsureLoadedTargetReadyOptions {
  sourceMode: Ref<SourceMode>
  selectedLoadedTargetId: Ref<string>
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  applyLoadedTarget: (target: LoadedSearchTarget | undefined) => Promise<void>
}

export interface EnsureDeferredTargetsReadyOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
}
