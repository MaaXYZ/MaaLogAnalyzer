import { ref } from 'vue'
import { toastError, toastWarning } from '../../../../utils/toast'
import {
  collectTextFilesFromFiles,
  collectDebugAssetsFromFiles,
  readDirectoryFiles,
} from '../../utils/fileLoadingHelpers'
import {
  createPrimaryLogSelectionOptions,
  type LoadedPrimaryLogFile,
  PRIMARY_LOG_FILE_HINT,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
} from '../../../../utils/logFileDiscovery'
import type { UseProcessFileLoaderOptions } from './types'

const getFileRelativePath = (file: File): string => {
  return (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
}

const filterFilesBySelectedDir = (files: Iterable<File>, selectedDirPath: string) => {
  const normalizedDir = selectedDirPath.replace(/\\/g, '/')
  return Array.from(files).filter((file) => {
    if (!normalizedDir) return true
    const normalizedPath = getFileRelativePath(file).replace(/\\/g, '/')
    return normalizedPath.startsWith(`${normalizedDir}/`)
  })
}

const resolveSelectedLogContent = async (
  files: Iterable<File>,
  selectPrimaryLogs: UseProcessFileLoaderOptions['selectPrimaryLogs'],
) => {
  const fileList = Array.from(files)
  const selectedLogs = selectPrimaryLogGroup(
    fileList.map(file => ({
      file,
      name: file.name,
      path: getFileRelativePath(file),
    })),
  )

  if (selectedLogs.length === 0) {
    return {
      content: '',
      scopedFiles: [] as File[],
      primaryLogFiles: [] as LoadedPrimaryLogFile[],
      cancelled: false,
    }
  }

  const selectedOptions = selectPrimaryLogs
    ? await selectPrimaryLogs(createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item)))
    : createPrimaryLogSelectionOptions(selectedLogs.map(({ item }) => item))
  if (!selectedOptions) {
    return {
      content: '',
      scopedFiles: [] as File[],
      primaryLogFiles: [] as LoadedPrimaryLogFile[],
      cancelled: true,
    }
  }
  if (selectedOptions.length === 0) {
    return {
      content: '',
      scopedFiles: [] as File[],
      primaryLogFiles: [] as LoadedPrimaryLogFile[],
      cancelled: false,
    }
  }
  const selectedPaths = new Set(selectedOptions.map(option => option.path))

  const loadedLogs = await Promise.all(selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .map(async ({ item }) => ({
      name: item.name,
      path: item.path,
      content: await item.file.text(),
    })))

  return {
    content: '',
    scopedFiles: filterFilesBySelectedDir(fileList, selectedLogs[0].candidate.dirPath),
    primaryLogFiles: sortLoadedPrimaryLogSegments(loadedLogs),
    cancelled: false,
  }
}

export const useWebFileInputs = (options: UseProcessFileLoaderOptions, setFileLoading: (loading: boolean) => void) => {
  const folderInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  const handleDirectoryEntry = async (dirEntry: FileSystemDirectoryEntry) => {
    try {
      setFileLoading(true)
      options.onFileLoadingStart()

      const files = await readDirectoryFiles(dirEntry)
      const { scopedFiles, primaryLogFiles, cancelled } = await resolveSelectedLogContent(files, options.selectPrimaryLogs)
      if (cancelled) return
      if (primaryLogFiles.length === 0) {
        toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
        return
      }

      const textFiles = await collectTextFilesFromFiles(scopedFiles)
      const debugAssets = await collectDebugAssetsFromFiles(scopedFiles)
      options.onUploadContent(
        '',
        debugAssets.errorImages,
        debugAssets.visionImages,
        debugAssets.waitFreezesImages,
        textFiles,
        primaryLogFiles,
      )
    } catch (error) {
      toastError('读取文件夹失败: ' + error)
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
      options.onUploadFile(file, options.selectPrimaryLogs)
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

    try {
      setFileLoading(true)
      options.onFileLoadingStart()

      const { scopedFiles, primaryLogFiles, cancelled } = await resolveSelectedLogContent(files, options.selectPrimaryLogs)
      if (cancelled) return
      if (primaryLogFiles.length === 0) {
        toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
        return
      }

      const textFiles = await collectTextFilesFromFiles(scopedFiles)
      const debugAssets = await collectDebugAssetsFromFiles(scopedFiles)
      options.onUploadContent(
        '',
        debugAssets.errorImages,
        debugAssets.visionImages,
        debugAssets.waitFreezesImages,
        textFiles,
        primaryLogFiles,
      )
    } catch (error) {
      toastError('读取文件失败: ' + error)
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
      options.onUploadFile(file, options.selectPrimaryLogs)
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
