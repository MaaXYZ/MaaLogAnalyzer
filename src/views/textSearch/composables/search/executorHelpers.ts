import type { Ref } from 'vue'
import type { SearchResult } from '../types'
import type { SourceMode } from '../loadedSource/types'

interface SearchResultState {
  searchResults: Ref<SearchResult[]>
  totalMatches: Ref<number>
}

export const clearSearchResultState = (state: SearchResultState) => {
  state.searchResults.value = []
  state.totalMatches.value = 0
}

export const showSourceNotReadyMessage = (sourceMode: SourceMode) => {
  if (sourceMode === 'loaded') {
    alert('请先选择已加载目标文件')
  } else {
    alert('请先选择文件')
  }
}

export const isManualSourceMissing = (
  sourceMode: SourceMode,
  fileName: string,
  fileContent: string,
  fileHandle: File | null,
) => {
  return sourceMode !== 'loaded' && (!fileName || (!fileContent && !fileHandle))
}

export const commitSearchResults = (state: SearchResultState, results: SearchResult[] | null) => {
  if (!results) return
  state.searchResults.value = results
  state.totalMatches.value = results.length
}
