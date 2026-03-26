import { ref } from 'vue'

export const useTextSearchFileState = () => {
  const fileContent = ref('')
  const fileName = ref('')
  const fileSizeInMB = ref(0)
  const isLargeFile = ref(false)
  const fileHandle = ref<File | null>(null)
  const totalLines = ref(0)
  const contextLines = ref<string[]>([])
  const contextStartLine = ref(0)

  return {
    fileContent,
    fileName,
    fileSizeInMB,
    isLargeFile,
    fileHandle,
    totalLines,
    contextLines,
    contextStartLine,
  }
}
