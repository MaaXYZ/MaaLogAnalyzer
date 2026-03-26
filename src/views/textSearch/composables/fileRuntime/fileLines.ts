import { computed, type Ref } from 'vue'

interface UseFileLinesOptions {
  fileContent: Ref<string>
  filterDebugInfo: (line: string) => string
}

export const useFileLines = (options: UseFileLinesOptions) => {
  return computed(() => {
    if (!options.fileContent.value) return []
    return options.fileContent.value.split('\n').map((line, index) => ({
      key: index,
      content: options.filterDebugInfo(line),
    }))
  })
}
