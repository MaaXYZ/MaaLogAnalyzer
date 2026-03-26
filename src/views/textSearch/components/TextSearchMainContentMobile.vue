<script setup lang="ts">
import TextSearchSearchPane from './TextSearchSearchPane.vue'
import type { SearchResult } from '../composables/types'

const props = defineProps<{
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
}>()

const emit = defineEmits<{
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
}>()
</script>

<template>
  <div style="flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; padding: 8px; overflow: hidden">
    <text-search-search-pane
      :mobile-mode="true"
      :search-text="props.searchText"
      :is-searching="props.isSearching"
      :is-loading-file="props.isLoadingFile"
      :has-file="!!props.fileName"
      :case-sensitive="props.caseSensitive"
      :use-regex="props.useRegex"
      :hide-debug-info="props.hideDebugInfo"
      :quick-search-options="props.quickSearchOptions"
      :search-history="props.searchHistory"
      :search-option-expanded-names="props.searchOptionExpandedNames"
      :file-name="props.fileName"
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
  </div>
</template>
