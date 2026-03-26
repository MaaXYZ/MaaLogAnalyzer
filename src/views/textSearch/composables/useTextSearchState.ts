import {
  useTextSearchFileState,
  useTextSearchSearchState,
  useTextSearchUiState,
} from './state'

export const useTextSearchState = () => {
  const uiState = useTextSearchUiState()
  const fileState = useTextSearchFileState()
  const searchState = useTextSearchSearchState()

  const resetSearchResultsOnly = () => {
    searchState.abortSearch.value = true
    searchState.isSearching.value = false
    searchState.searchResults.value = []
    searchState.totalMatches.value = 0
    uiState.selectedLine.value = null
    fileState.contextLines.value = []
    fileState.contextStartLine.value = 0
  }

  return {
    ...uiState,
    ...fileState,
    ...searchState,
    resetSearchResultsOnly,
  }
}
