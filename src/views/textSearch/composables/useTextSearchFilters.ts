import type { Ref } from 'vue'

const DEBUG_INFO_PATTERN = /\[P[xX]\d+\]|\[T[xX]\d+\]|\[L\d+\]|\[[^\]]+\.(cpp|h|hpp|c)\]/gi

export const useTextSearchFilters = (hideDebugInfo: Ref<boolean>) => {
  const quickSearchOptions = [
    'reco hit',
    'Version',
    '[ERR]',
    'display_width_=',
  ]

  const filterDebugInfo = (line: string): string => {
    if (!hideDebugInfo.value) return line
    return line.replace(DEBUG_INFO_PATTERN, '').replace(/\s{2,}/g, ' ').trim()
  }

  return {
    quickSearchOptions,
    filterDebugInfo,
  }
}
