import { onMounted, ref } from 'vue'

export const useTextSearchHistory = () => {
  const searchHistory = ref<string[]>([])
  const storageKey = 'searchHistory'

  onMounted(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved) {
      try {
        searchHistory.value = JSON.parse(saved)
      } catch {
        // ignore parse errors
      }
    }
  })

  const saveSearchHistory = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(searchHistory.value))
    } catch {
      // ignore save errors
    }
  }

  const addToHistory = (text: string) => {
    if (!text || text.trim() === '') return

    const index = searchHistory.value.indexOf(text)
    if (index > -1) {
      searchHistory.value.splice(index, 1)
    }

    searchHistory.value.unshift(text)

    if (searchHistory.value.length > 20) {
      searchHistory.value = searchHistory.value.slice(0, 20)
    }

    saveSearchHistory()
  }

  const removeFromHistory = (text: string) => {
    const index = searchHistory.value.indexOf(text)
    if (index > -1) {
      searchHistory.value.splice(index, 1)
      saveSearchHistory()
    }
  }

  return {
    searchHistory,
    addToHistory,
    removeFromHistory,
  }
}
