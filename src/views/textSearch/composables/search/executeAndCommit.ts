import { commitSearchResults } from './executorHelpers'
import { executeSearchByMode } from './executeByMode'
import type { TextSearchSearchExecutorOptions } from './executorTypes'
import { buildExecuteByModeOptions, buildSearchResultState } from './optionBuilders'

export const executeAndCommitSearch = async (
  options: TextSearchSearchExecutorOptions,
) => {
  const results = await executeSearchByMode(buildExecuteByModeOptions(options))
  commitSearchResults(buildSearchResultState(options), results)

  if (options.searchText.value && !options.abortSearch.value) {
    options.addToHistory(options.searchText.value)
  }
}
