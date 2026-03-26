import { ref } from 'vue'
import { useIsMobile } from '../../../../composables/useIsMobile'
import { useTextSearchLayout } from '../useTextSearchLayout'
import { useLoadedTargetSource } from '../useLoadedTargetSource'
import { useTextSearchHistory } from '../useTextSearchHistory'
import { useTextSearchFilters } from '../useTextSearchFilters'
import { useTextSearchState } from '../useTextSearchState'
import { buildLoadedTargetSourceOptions } from './contextOptions'
import type { UseTextSearchViewModelOptions } from './types'

const TEXT_SEARCH_LAYOUT_STORAGE_KEY = 'maa-log-analyzer-text-search-layout'

export const useTextSearchViewContext = (options: UseTextSearchViewModelOptions) => {
  const { isMobile } = useIsMobile()
  const { textSearchSplitSize } = useTextSearchLayout(TEXT_SEARCH_LAYOUT_STORAGE_KEY)

  const state = useTextSearchState()

  const {
    sourceMode,
    selectedLoadedTargetId,
    sourceModeOptions,
    loadedTargetOptions,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
  } = useLoadedTargetSource(buildLoadedTargetSourceOptions(state, options))

  const { quickSearchOptions, filterDebugInfo } = useTextSearchFilters(state.hideDebugInfo)
  const { searchHistory, addToHistory, removeFromHistory } = useTextSearchHistory()
  const contentPaneRef = ref<{ scrollToLine: (lineNumber: number) => void } | null>(null)

  return {
    isMobile,
    textSearchSplitSize,
    ...state,
    sourceMode,
    selectedLoadedTargetId,
    sourceModeOptions,
    loadedTargetOptions,
    ensureLoadedTargetReady,
    ensureDeferredLoadedTargetsReady,
    quickSearchOptions,
    filterDebugInfo,
    searchHistory,
    addToHistory,
    removeFromHistory,
    contentPaneRef,
  }
}

export type TextSearchViewContext = ReturnType<typeof useTextSearchViewContext>
