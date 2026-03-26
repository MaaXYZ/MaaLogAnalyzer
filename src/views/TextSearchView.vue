
<script setup lang="ts">
import { toRef } from 'vue'
import TextSearchTopToolbar from './textSearch/components/TextSearchTopToolbar.vue'
import TextSearchMainContent from './textSearch/components/TextSearchMainContent.vue'
import {
  useTextSearchViewActions,
  useTextSearchViewContext,
  type UseTextSearchViewModelOptions,
} from './textSearch/composables/viewModel'
import type { LoadedSearchTarget } from './textSearch/composables/types'

// Props
const props = withDefaults(defineProps<{
  isDark?: boolean
  loadedTargets?: LoadedSearchTarget[]
  loadedDefaultTargetId?: string
  hasDeferredLoadedTargets?: boolean
  ensureLoadedTargets?: (() => Promise<void>) | undefined
}>(), {
  isDark: true,
  loadedTargets: () => [],
  loadedDefaultTargetId: '',
  hasDeferredLoadedTargets: false,
  ensureLoadedTargets: undefined
})

const viewModelOptions: UseTextSearchViewModelOptions = {
  loadedTargets: toRef(props, 'loadedTargets'),
  loadedDefaultTargetId: toRef(props, 'loadedDefaultTargetId'),
  hasDeferredLoadedTargets: toRef(props, 'hasDeferredLoadedTargets'),
  ensureLoadedTargets: toRef(props, 'ensureLoadedTargets'),
}

const context = useTextSearchViewContext(viewModelOptions)
const actions = useTextSearchViewActions(context, viewModelOptions)

const {
  isMobile,
  textSearchSplitSize,
  searchText,
  fileContent,
  fileName,
  fileSizeInMB,
  caseSensitive,
  useRegex,
  topToolbarRef,
  isSearching,
  isLoadingFile,
  selectedLine,
  searchOptionExpandedNames,
  mobileControlExpandedNames,
  showFileContent,
  contentKey,
  hideDebugInfo,
  isLargeFile,
  totalLines,
  contextLines,
  contextStartLine,
  searchResults,
  totalMatches,
  sourceMode,
  selectedLoadedTargetId,
  sourceModeOptions,
  loadedTargetOptions,
  quickSearchOptions,
  filterDebugInfo,
  searchHistory,
  contentPaneRef,
  performSearch,
  handleFileUpload,
  clearContent,
  jumpToLine,
  fileLines,
  highlightMatch,
  useHistoryItem,
  removeFromHistory,
} = {
  ...context,
  ...actions,
}

void topToolbarRef
void contentPaneRef

</script>

<template>
  <div style="height: 100%; display: flex; flex-direction: column" data-tour="textsearch-root" :class="{ 'dark-theme': props.isDark }">
    <!-- 顶部工具栏 -->
    <text-search-top-toolbar
      ref="topToolbarRef"
      :is-mobile="isMobile"
      :is-loading-file="isLoadingFile"
      :file-name="fileName"
      :total-lines="totalLines"
      :file-size-in-m-b="fileSizeInMB"
      :is-large-file="isLargeFile"
      :source-mode="sourceMode"
      :source-mode-options="sourceModeOptions"
      :selected-loaded-target-id="selectedLoadedTargetId"
      :loaded-target-options="loadedTargetOptions"
      :case-sensitive="caseSensitive"
      :use-regex="useRegex"
      :hide-debug-info="hideDebugInfo"
      :quick-search-options="quickSearchOptions"
      :search-text="searchText"
      :search-history="searchHistory"
      :mobile-control-expanded-names="mobileControlExpandedNames"
      @file-upload="handleFileUpload"
      @clear-content="clearContent"
      @update:source-mode="sourceMode = $event"
      @update:selected-loaded-target-id="selectedLoadedTargetId = $event"
      @update:case-sensitive="caseSensitive = $event"
      @update:use-regex="useRegex = $event"
      @update:hide-debug-info="hideDebugInfo = $event"
      @update:mobile-control-expanded-names="mobileControlExpandedNames = $event"
      @use-history-item="useHistoryItem"
      @remove-history-item="removeFromHistory"
    />
    
    <!-- 主内容区域 -->
    <text-search-main-content
      ref="contentPaneRef"
      :is-mobile="isMobile"
      :content-key="contentKey"
      :text-search-split-size="textSearchSplitSize"
      :search-text="searchText"
      :is-searching="isSearching"
      :is-loading-file="isLoadingFile"
      :file-name="fileName"
      :case-sensitive="caseSensitive"
      :use-regex="useRegex"
      :hide-debug-info="hideDebugInfo"
      :quick-search-options="quickSearchOptions"
      :search-history="searchHistory"
      :search-option-expanded-names="searchOptionExpandedNames"
      :search-results="searchResults"
      :total-matches="totalMatches"
      :highlight-match="highlightMatch"
      :is-dark="!!props.isDark"
      :is-large-file="isLargeFile"
      :file-content="fileContent"
      :show-file-content="showFileContent"
      :total-lines="totalLines"
      :file-size-in-m-b="fileSizeInMB"
      :context-lines="contextLines"
      :context-start-line="contextStartLine"
      :selected-line="selectedLine"
      :file-lines="fileLines"
      :filter-debug-info="filterDebugInfo"
      @update:text-search-split-size="textSearchSplitSize = $event"
      @update:search-text="searchText = $event"
      @update:case-sensitive="caseSensitive = $event"
      @update:use-regex="useRegex = $event"
      @update:hide-debug-info="hideDebugInfo = $event"
      @update:search-option-expanded-names="searchOptionExpandedNames = $event"
      @search="performSearch"
      @quick-search="useHistoryItem"
      @remove-history="removeFromHistory"
      @use-history="useHistoryItem"
      @select-line="jumpToLine"
      @update:show-file-content="showFileContent = $event"
      @update:selected-line="selectedLine = $event"
    />
  </div>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}
</style>
