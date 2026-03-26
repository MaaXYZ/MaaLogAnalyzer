import { ref } from 'vue'
import {
  isMainLogFileName,
  isBakLogFileName,
  collectTextFilesFromFiles,
  readDirectoryFiles,
} from '../../utils/fileLoadingHelpers'
import type { UseProcessFileLoaderOptions } from './types'

const findLogPair = (files: Iterable<File>) => {
  let bakLogFile: File | null = null
  let mainLogFile: File | null = null

  for (const file of files) {
    const fileName = file.name.toLowerCase()
    if (isBakLogFileName(fileName)) {
      bakLogFile = file
    } else if (isMainLogFileName(fileName)) {
      mainLogFile = file
    }
  }

  return { bakLogFile, mainLogFile }
}

const readCombinedLogContent = async (bakLogFile: File | null, mainLogFile: File | null) => {
  let combinedContent = ''
  if (bakLogFile) {
    combinedContent += await bakLogFile.text()
  }
  if (mainLogFile) {
    if (combinedContent && !combinedContent.endsWith('\n')) {
      combinedContent += '\n'
    }
    combinedContent += await mainLogFile.text()
  }
  return combinedContent
}

export const useWebFileInputs = (options: UseProcessFileLoaderOptions, setFileLoading: (loading: boolean) => void) => {
  const folderInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  const handleDirectoryEntry = async (dirEntry: FileSystemDirectoryEntry) => {
    try {
      setFileLoading(true)
      options.onFileLoadingStart()

      const files = await readDirectoryFiles(dirEntry)
      const { bakLogFile, mainLogFile } = findLogPair(files)
      if (!bakLogFile && !mainLogFile) {
        alert('文件夹中未找到日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
        return
      }

      const combinedContent = await readCombinedLogContent(bakLogFile, mainLogFile)
      if (combinedContent) {
        const textFiles = await collectTextFilesFromFiles(files)
        options.onUploadContent(combinedContent, undefined, undefined, undefined, textFiles)
      }
    } catch (error) {
      alert('读取文件夹失败: ' + error)
    } finally {
      setFileLoading(false)
      options.onFileLoadingEnd()
    }
  }

  const handleDrop = async (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()

    const items = event.dataTransfer?.items
    if (!items || items.length === 0) return

    const firstItem = items[0]
    const entry = firstItem.webkitGetAsEntry?.()
    if (entry?.isDirectory) {
      await handleDirectoryEntry(entry as FileSystemDirectoryEntry)
      return
    }

    const file = firstItem.getAsFile()
    if (file) {
      options.onUploadFile(file)
    }
  }

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

  const handleFolderChange = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    const { bakLogFile, mainLogFile } = findLogPair(files)
    if (!bakLogFile && !mainLogFile) {
      alert('文件夹中未找到日志文件（maa.log / maa.bak.log / maafw.log / maafw.bak.log）')
      return
    }

    try {
      setFileLoading(true)
      options.onFileLoadingStart()

      const combinedContent = await readCombinedLogContent(bakLogFile, mainLogFile)
      if (combinedContent) {
        const textFiles = await collectTextFilesFromFiles(files)
        options.onUploadContent(combinedContent, undefined, undefined, undefined, textFiles)
      }
    } catch (error) {
      alert('读取文件失败: ' + error)
    } finally {
      setFileLoading(false)
      options.onFileLoadingEnd()
      input.value = ''
    }
  }

  const triggerFolderSelect = () => {
    folderInputRef.value?.click()
  }

  const triggerFileSelect = () => {
    fileInputRef.value?.click()
  }

  const handleFileInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) {
      options.onUploadFile(file)
    }
    input.value = ''
  }

  return {
    folderInputRef,
    fileInputRef,
    handleDrop,
    handleDragOver,
    handleFolderChange,
    handleFileInputChange,
    triggerFolderSelect,
    triggerFileSelect,
  }
}
