import type { Ref } from 'vue'
import type { LoadedSearchTarget } from '../types'

export interface UseTextSearchViewModelOptions {
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  loadedDefaultTargetId: Ref<string | undefined>
  hasDeferredLoadedTargets: Ref<boolean | undefined>
  ensureLoadedTargets: Ref<(() => Promise<void>) | undefined>
  ensureTargetContentLoaded?: (targetId: string) => Promise<void>
  findTargetContainingLocate?: (locate: string) => Promise<string | null>
}
