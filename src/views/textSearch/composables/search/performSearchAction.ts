import { executeAndCommitSearch } from './executeAndCommit'
import { executeSearchByMode } from './executeByMode'
import { toastError } from '../../../../utils/toast'
import { ensureSearchPreconditions } from './preconditions'
import type { TextSearchSearchExecutorOptions } from './executorTypes'
import { buildSearchExecutionSnapshot } from './optionBuilders'
import { clearSearchResultState } from './executorHelpers'

interface PerformSearchActionDependencies {
  ensurePreconditions?: typeof ensureSearchPreconditions
  executeSearch?: typeof executeSearchByMode
  reportError?: (error: unknown) => void
}

export const createPerformSearchAction = (
  options: TextSearchSearchExecutorOptions,
  dependencies: PerformSearchActionDependencies = {},
) => {
  const ensurePreconditions = dependencies.ensurePreconditions ?? ensureSearchPreconditions
  const executeSearch = dependencies.executeSearch ?? executeSearchByMode
  const reportError =
    dependencies.reportError ??
    ((error: unknown) => {
      toastError('搜索失败: ' + error)
    })
  let latestInvocationId = 0

  return async () => {
    const invocationId = ++latestInvocationId
    options.searchRequestGeneration.value += 1
    options.isSearching.value = false
    const sourceIntentGeneration = options.sourceIntentGeneration.value
    const isLatestInvocation = () => invocationId === latestInvocationId
    const isCurrentIntent = () =>
      isLatestInvocation() && options.sourceIntentGeneration.value === sourceIntentGeneration
    let isCurrent = isCurrentIntent

    try {
      const preconditionsReady = await ensurePreconditions(options, isCurrentIntent)
      if (!isCurrentIntent() || !preconditionsReady) return

      const requestGeneration = options.searchRequestGeneration.value
      const sourceLoadGeneration = options.sourceLoadGeneration.value
      isCurrent = () =>
        isCurrentIntent() &&
        options.searchRequestGeneration.value === requestGeneration &&
        options.sourceLoadGeneration.value === sourceLoadGeneration
      const snapshot = buildSearchExecutionSnapshot(options)
      options.isSearching.value = true

      await executeAndCommitSearch(options, { snapshot, isCurrent }, executeSearch)
    } catch (error) {
      if (isCurrent()) {
        clearSearchResultState({
          searchResults: options.searchResults,
          totalMatches: options.totalMatches,
        })
        reportError(error)
      }
    } finally {
      if (isCurrent()) {
        options.isSearching.value = false
      }
    }
  }
}
