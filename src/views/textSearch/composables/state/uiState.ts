import { ref } from 'vue'

export const useTextSearchUiState = () => {
  const searchText = ref('')
  const caseSensitive = ref(true)
  const useRegex = ref(false)
  const topToolbarRef = ref<{ resetFileInput: () => void } | null>(null)
  const selectedLine = ref<number | null>(null)
  const searchOptionExpandedNames = ref<Array<string | number>>(['search-options'])
  const mobileControlExpandedNames = ref<Array<string | number>>([])
  const showFileContent = ref(false)
  const contentKey = ref(0)
  const hideDebugInfo = ref(true)

  return {
    searchText,
    caseSensitive,
    useRegex,
    topToolbarRef,
    selectedLine,
    searchOptionExpandedNames,
    mobileControlExpandedNames,
    showFileContent,
    contentKey,
    hideDebugInfo,
  }
}
