import { ref, watch } from 'vue'

const clampSplitSize = (value: unknown, min: number, max: number, fallback: number) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

const loadSplitSize = (storageKey: string, defaultSize: number, min: number, max: number) => {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return defaultSize
    const parsed = JSON.parse(raw) as { splitSize?: number }
    return clampSplitSize(parsed?.splitSize, min, max, defaultSize)
  } catch {
    return defaultSize
  }
}

export const useTextSearchLayout = (storageKey: string) => {
  const min = 0.2
  const max = 0.8
  const fallback = 0.4
  const textSearchSplitSize = ref(loadSplitSize(storageKey, fallback, min, max))

  watch(textSearchSplitSize, (size) => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ splitSize: clampSplitSize(size, min, max, fallback) }),
      )
    } catch {
      // ignore write errors
    }
  })

  return {
    textSearchSplitSize,
  }
}
