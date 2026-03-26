import { useTextSearchFileRuntime } from '../useTextSearchFileRuntime'
import { useTextSearchHighlighter } from '../useTextSearchHighlighter'
import { createPerformSearchAction } from '../search'
import { buildFileRuntimeOptions, buildSearchExecutorOptions } from './actionOptions'
import type { TextSearchViewContext } from './useTextSearchViewContext'
import type { UseTextSearchViewModelOptions } from './types'

export const useTextSearchViewActions = (
  context: TextSearchViewContext,
  options: UseTextSearchViewModelOptions,
) => {
  const performSearch = createPerformSearchAction(buildSearchExecutorOptions(context, options))

  const {
    handleFileUpload,
    clearContent,
    jumpToLine,
    fileLines,
  } = useTextSearchFileRuntime(buildFileRuntimeOptions(context))

  const { highlightMatch } = useTextSearchHighlighter(context.hideDebugInfo, context.filterDebugInfo)

  const useHistoryItem = (text: string) => {
    context.searchText.value = text
    performSearch()
  }

  return {
    performSearch,
    handleFileUpload,
    clearContent,
    jumpToLine,
    fileLines,
    highlightMatch,
    useHistoryItem,
  }
}
