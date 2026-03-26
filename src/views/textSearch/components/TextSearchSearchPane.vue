<script setup lang="ts">
import TextSearchControlCard from './TextSearchControlCard.vue'
import TextSearchResultsCard from './TextSearchResultsCard.vue'
import type { SearchResult } from '../composables/types'

const props = defineProps<{
  mobileMode: boolean
  searchText: string
  isSearching: boolean
  isLoadingFile: boolean
  hasFile: boolean
  caseSensitive: boolean
  useRegex: boolean
  hideDebugInfo: boolean
  quickSearchOptions: string[]
  searchHistory: string[]
  searchOptionExpandedNames: Array<string | number>
  fileName: string
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
  <text-search-control-card
    :mobile-mode="props.mobileMode"
    :search-text="props.searchText"
    :is-searching="props.isSearching"
    :is-loading-file="props.isLoadingFile"
    :has-file="props.hasFile"
    :case-sensitive="props.caseSensitive"
    :use-regex="props.useRegex"
    :hide-debug-info="props.hideDebugInfo"
    :quick-search-options="props.quickSearchOptions"
    :search-history="props.searchHistory"
    :search-option-expanded-names="props.searchOptionExpandedNames"
    @update:search-text="emit('update:searchText', $event)"
    @update:case-sensitive="emit('update:caseSensitive', $event)"
    @update:use-regex="emit('update:useRegex', $event)"
    @update:hide-debug-info="emit('update:hideDebugInfo', $event)"
    @update:search-option-expanded-names="emit('update:searchOptionExpandedNames', $event)"
    @search="emit('search')"
    @quick-search="emit('quickSearch', $event)"
    @remove-history="emit('removeHistory', $event)"
    @use-history="emit('useHistory', $event)"
  />

  <text-search-results-card
    :mobile-mode="props.mobileMode"
    :file-name="props.fileName"
    :is-loading-file="props.isLoadingFile"
    :search-text="props.searchText"
    :is-searching="props.isSearching"
    :search-results="props.searchResults"
    :total-matches="props.totalMatches"
    :highlight-match="props.highlightMatch"
    @select-line="emit('selectLine', $event)"
  />
</template>
