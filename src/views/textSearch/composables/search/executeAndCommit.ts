import { commitSearchResults } from './executorHelpers'
import { executeSearchByMode } from './executeByMode'
import type { ActiveTextSearchRequest, TextSearchSearchExecutorOptions } from './executorTypes'
import { buildExecuteByModeOptions, buildSearchResultState } from './optionBuilders'

export const executeAndCommitSearch = async (
  options: TextSearchSearchExecutorOptions,
  request: ActiveTextSearchRequest,
  executeSearch: typeof executeSearchByMode = executeSearchByMode,
) => {
  const results = await executeSearch(
    buildExecuteByModeOptions(options, request.snapshot, () => !request.isCurrent()),
  )
  if (!request.isCurrent()) return

  commitSearchResults(buildSearchResultState(options), results)

  if (results && request.snapshot.keyword) {
    options.addToHistory(request.snapshot.keyword)
  }
}
