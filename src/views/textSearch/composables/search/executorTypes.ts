import type { Ref } from 'vue'
import type { LoadedSearchTarget, SearchResult } from '../types'
import type { SourceMode } from '../loadedSource/types'

export interface TextSearchSearchExecutorOptions {
  searchText: Ref<string>
  fileName: Ref<string>
  fileContent: Ref<string>
  fileHandle: Ref<File | null>
  isLargeFile: Ref<boolean>
  isLoadingFile: Ref<boolean>
  isSearching: Ref<boolean>
  sourceMode: Ref<SourceMode>
  loadedTargets: Ref<LoadedSearchTarget[] | undefined>
  ensureDeferredLoadedTargetsReady: () => Promise<void>
  ensureLoadedTargetReady: () => Promise<boolean>
  caseSensitive: Ref<boolean>
  useRegex: Ref<boolean>
  maxResults: number
  searchResults: Ref<SearchResult[]>
  totalMatches: Ref<number>
  addToHistory: (text: string) => void
  abortSearch: Ref<boolean>
}
