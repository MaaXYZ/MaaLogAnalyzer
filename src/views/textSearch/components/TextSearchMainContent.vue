<script setup lang="ts">
import { ref } from 'vue'
import TextSearchMainContentMobile from './TextSearchMainContentMobile.vue'
import TextSearchMainContentDesktop from './TextSearchMainContentDesktop.vue'
import type { SearchResult } from '../composables/types'

interface FileLineItem {
  key: number
  content: string
}

const props = defineProps<{
  isMobile: boolean
  contentKey: number
  textSearchSplitSize: number
  searchText: string
  isSearching: boolean
  isLoadingFile: boolean
  fileName: string
  caseSensitive: boolean
  useRegex: boolean
  hideDebugInfo: boolean
  quickSearchOptions: string[]
  searchHistory: string[]
  searchOptionExpandedNames: Array<string | number>
  searchResults: SearchResult[]
  totalMatches: number
  highlightMatch: (result: SearchResult) => { before: string; match: string; after: string }
  isDark: boolean
  isLargeFile: boolean
  fileContent: string
  showFileContent: boolean
  totalLines: number
  fileSizeInMB: number
  contextLines: string[]
  contextStartLine: number
  selectedLine: number | null
  fileLines: FileLineItem[]
  filterDebugInfo: (line: string) => string
}>()

const emit = defineEmits<{
  'update:textSearchSplitSize': [value: number]
  'update:searchText': [value: string]
  'update:caseSensitive': [value: boolean]
  'update:useRegex': [value: boolean]
  'update:hideDebugInfo': [value: boolean]
  'update:searchOptionExpandedNames': [value: Array<string | number>]
  search: []
  quickSearch: [value: string]
  removeHistory: [value: string]
  useHistory: [value: string]
  selectLine: [lineNumber: number]
  'update:showFileContent': [value: boolean]
  'update:selectedLine': [value: number | null]
}>()

const desktopContentRef = ref<{ scrollToLine: (lineNumber: number) => void } | null>(null)

defineExpose({
  scrollToLine: (lineNumber: number) => desktopContentRef.value?.scrollToLine(lineNumber),
})
</script>

<template>
  <text-search-main-content-mobile
    v-if="props.isMobile"
    :search-text="props.searchText"
    :is-searching="props.isSearching"
    :is-loading-file="props.isLoadingFile"
    :file-name="props.fileName"
    :case-sensitive="props.caseSensitive"
    :use-regex="props.useRegex"
    :hide-debug-info="props.hideDebugInfo"
    :quick-search-options="props.quickSearchOptions"
    :search-history="props.searchHistory"
    :search-option-expanded-names="props.searchOptionExpandedNames"
    :search-results="props.searchResults"
    :total-matches="props.totalMatches"
    :highlight-match="props.highlightMatch"
    @update:search-text="emit('update:searchText', $event)"
    @update:case-sensitive="emit('update:caseSensitive', $event)"
    @update:use-regex="emit('update:useRegex', $event)"
    @update:hide-debug-info="emit('update:hideDebugInfo', $event)"
    @update:search-option-expanded-names="emit('update:searchOptionExpandedNames', $event)"
    @search="emit('search')"
    @quick-search="emit('quickSearch', $event)"
    @remove-history="emit('removeHistory', $event)"
    @use-history="emit('useHistory', $event)"
    @select-line="emit('selectLine', $event)"
  />

  <text-search-main-content-desktop
    v-else
    ref="desktopContentRef"
    :key="props.contentKey"
    :content-key="props.contentKey"
    :text-search-split-size="props.textSearchSplitSize"
    :search-text="props.searchText"
    :is-searching="props.isSearching"
    :is-loading-file="props.isLoadingFile"
    :file-name="props.fileName"
    :case-sensitive="props.caseSensitive"
    :use-regex="props.useRegex"
    :hide-debug-info="props.hideDebugInfo"
    :quick-search-options="props.quickSearchOptions"
    :search-history="props.searchHistory"
    :search-option-expanded-names="props.searchOptionExpandedNames"
    :search-results="props.searchResults"
    :total-matches="props.totalMatches"
    :highlight-match="props.highlightMatch"
    :is-dark="props.isDark"
    :is-large-file="props.isLargeFile"
    :file-content="props.fileContent"
    :show-file-content="props.showFileContent"
    :total-lines="props.totalLines"
    :file-size-in-m-b="props.fileSizeInMB"
    :context-lines="props.contextLines"
    :context-start-line="props.contextStartLine"
    :selected-line="props.selectedLine"
    :file-lines="props.fileLines"
    :filter-debug-info="props.filterDebugInfo"
    @update:text-search-split-size="emit('update:textSearchSplitSize', $event)"
    @update:search-text="emit('update:searchText', $event)"
    @update:case-sensitive="emit('update:caseSensitive', $event)"
    @update:use-regex="emit('update:useRegex', $event)"
    @update:hide-debug-info="emit('update:hideDebugInfo', $event)"
    @update:search-option-expanded-names="emit('update:searchOptionExpandedNames', $event)"
    @search="emit('search')"
    @quick-search="emit('quickSearch', $event)"
    @remove-history="emit('removeHistory', $event)"
    @use-history="emit('useHistory', $event)"
    @select-line="emit('selectLine', $event)"
    @update:show-file-content="emit('update:showFileContent', $event)"
    @update:selected-line="emit('update:selectedLine', $event)"
  />
</template>
