import { nextTick } from 'vue'
import type { ClearRuntimeContentOptions } from './types'

export const clearRuntimeContent = (options: ClearRuntimeContentOptions) => {
  options.abortSearch.value = true
  options.isSearching.value = false

  options.contentKey.value++
  options.showFileContent.value = false
  options.selectedLine.value = null

  options.searchResults.value = []
  options.totalMatches.value = 0
  options.searchText.value = ''

  options.isLargeFile.value = false
  options.fileHandle.value = null
  options.totalLines.value = 0
  options.fileSizeInMB.value = 0
  options.contextLines.value = []
  options.contextStartLine.value = 0

  nextTick(() => {
    options.fileContent.value = ''
    options.fileName.value = ''
    options.topToolbarRef.value?.resetFileInput()

    if (typeof window !== 'undefined' && 'gc' in window) {
      ;(window as any).gc()
    }

    nextTick(() => {
      // settled
    })
  })
}
