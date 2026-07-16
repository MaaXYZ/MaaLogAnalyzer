import { executeAndCommitSearch } from './executeAndCommit'
import { toastError } from '../../../../utils/toast'
import { ensureSearchPreconditions } from './preconditions'
import type { TextSearchSearchExecutorOptions } from './executorTypes'

export const createPerformSearchAction = (options: TextSearchSearchExecutorOptions) => {
  return async () => {
    const preconditionsReady = await ensureSearchPreconditions(options)
    if (!preconditionsReady) {
      return
    }

    options.isSearching.value = true
    options.abortSearch.value = false

    try {
      await executeAndCommitSearch(options)
    } catch (error) {
      toastError('搜索失败: ' + error)
    } finally {
      options.isSearching.value = false
    }
  }
}
