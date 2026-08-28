import { ref } from 'vue'
import { toastError, toastWarning } from '../../../../utils/toast'
import {
  collectTextFilesFromFiles,
  collectDebugAssetsFromFiles,
  readDirectoryFiles,
} from '../../utils/fileLoadingHelpers'
import {
  createPrimaryLogSelectionOptions,
  type FilePrimaryLogFile,
  PRIMARY_LOG_FILE_HINT,
  selectPrimaryLogGroup,
} from '../../../../utils/logFileDiscovery'
import { decodeFileContent } from '../../../../utils/textEncoding'
import type { UseProcessFileLoaderOptions } from './types'
import {
  collectMxuZipVolumes,
  findMxuZipVolumes,
} from '../../../../utils/mxuZipVolumes'
import {
  chargeBrowserInputFile,
  createBrowserInputBudget,
  registerBrowserInputFile,
  type BrowserInputBudget,
} from '../../../../utils/browserInputBudget'
import { revokeBlobUrlMap } from '../../../../utils/blobUrlMap'
import type { FileLoadOperationGate } from './operationGate'

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

const getMxuZipUpload = (files: File[], anchor: File): File | File[] => {
  const volumes = collectMxuZipVolumes(files, anchor)
  return volumes.length > 1 ? volumes : anchor
}

const withUnmeteredBrowserInput = async <T>(
  load: (budget: BrowserInputBudget) => Promise<T>,
): Promise<T> => load(createBrowserInputBudget(null))

const resolveSelectedLogContent = async (
  files: Iterable<File>,
  selectPrimaryLogs: UseProcessFileLoaderOptions['selectPrimaryLogs'],
  budget: BrowserInputBudget,
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
      primaryLogFiles: [] as FilePrimaryLogFile[],
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
      primaryLogFiles: [] as FilePrimaryLogFile[],
      cancelled: true,
    }
  }
  if (selectedOptions.length === 0) {
    return {
      content: '',
      scopedFiles: [] as File[],
      primaryLogFiles: [] as FilePrimaryLogFile[],
      cancelled: false,
    }
  }
  const selectedPaths = new Set(selectedOptions.map(option => option.path))

  const selectedOrder = new Map(selectedOptions.map((option, index) => [option.path, index]))
  const selectedLogItems = selectedLogs
    .filter(({ item }) => selectedPaths.has(item.path))
    .sort((a, b) => (selectedOrder.get(a.item.path) ?? 0) - (selectedOrder.get(b.item.path) ?? 0))
  for (const { item } of selectedLogItems) {
    registerBrowserInputFile(budget, item.file, item.path)
    chargeBrowserInputFile(budget, item.file)
  }
  const primaryLogFiles: FilePrimaryLogFile[] = selectedLogItems.map(({ item }) => ({
    name: item.name,
    path: item.path,
    file: item.file,
    loadContent: async () => decodeFileContent(new Uint8Array(await item.file.arrayBuffer())),
  }))

  return {
    content: '',
    scopedFiles: filterFilesBySelectedDir(fileList, selectedLogs[0].candidate.dirPath),
    primaryLogFiles,
    cancelled: false,
  }
}

export const useWebFileInputs = (
  options: UseProcessFileLoaderOptions,
  operationGate: FileLoadOperationGate,
) => {
  const folderInputRef = ref<HTMLInputElement | null>(null)
  const fileInputRef = ref<HTMLInputElement | null>(null)

  const revokeDebugAssets = (assets: Awaited<ReturnType<typeof collectDebugAssetsFromFiles>>) => {
    revokeBlobUrlMap(assets.errorImages)
    revokeBlobUrlMap(assets.visionImages)
    revokeBlobUrlMap(assets.waitFreezesImages)
  }

  const handleDirectoryEntry = async (dirEntry: FileSystemDirectoryEntry) => {
    const generation = operationGate.begin()
    try {
      if (!operationGate.startLoading(generation)) return

      await withUnmeteredBrowserInput(async (budget) => {
        const files = await readDirectoryFiles(dirEntry, '')
        if (!operationGate.isCurrent(generation)) return
        const { scopedFiles, primaryLogFiles, cancelled } = await resolveSelectedLogContent(
          files,
          options.selectPrimaryLogs,
          budget,
        )
        if (!operationGate.isCurrent(generation)) return
        if (cancelled) return
        if (primaryLogFiles.length === 0) {
          const volumes = findMxuZipVolumes(files)
          if (volumes.length > 0) {
            operationGate.finish(generation)
            options.onUploadFile(
              volumes.length > 1 ? volumes : volumes[0],
              options.selectPrimaryLogs,
            )
            return
          }
          toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
          return
        }

        const textFiles = await collectTextFilesFromFiles(scopedFiles, budget)
        if (!operationGate.isCurrent(generation)) return
        const debugAssets = await collectDebugAssetsFromFiles(scopedFiles, budget)
        if (!operationGate.isCurrent(generation)) {
          revokeDebugAssets(debugAssets)
          return
        }
        options.onUploadContent(
          '',
          debugAssets.errorImages,
          debugAssets.visionImages,
          debugAssets.waitFreezesImages,
          textFiles,
          primaryLogFiles,
        )
      })
    } catch (error) {
      if (operationGate.isCurrent(generation)) toastError('读取文件夹失败: ' + error)
    } finally {
      operationGate.finish(generation)
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

    const files = Array.from(items)
      .map(item => item.getAsFile())
      .filter((file): file is File => file != null)
    const file = files[0]
    if (file) {
      operationGate.begin()
      options.onUploadFile(getMxuZipUpload(files, file), options.selectPrimaryLogs)
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

    const generation = operationGate.begin()
    try {
      if (!operationGate.startLoading(generation)) return

      await withUnmeteredBrowserInput(async (budget) => {
        const { scopedFiles, primaryLogFiles, cancelled } = await resolveSelectedLogContent(
          files,
          options.selectPrimaryLogs,
          budget,
        )
        if (!operationGate.isCurrent(generation)) return
        if (cancelled) return
        if (primaryLogFiles.length === 0) {
          const volumes = findMxuZipVolumes(Array.from(files))
          if (volumes.length > 0) {
            operationGate.finish(generation)
            options.onUploadFile(
              volumes.length > 1 ? volumes : volumes[0],
              options.selectPrimaryLogs,
            )
            return
          }
          toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
          return
        }

        const textFiles = await collectTextFilesFromFiles(scopedFiles, budget)
        if (!operationGate.isCurrent(generation)) return
        const debugAssets = await collectDebugAssetsFromFiles(scopedFiles, budget)
        if (!operationGate.isCurrent(generation)) {
          revokeDebugAssets(debugAssets)
          return
        }
        options.onUploadContent(
          '',
          debugAssets.errorImages,
          debugAssets.visionImages,
          debugAssets.waitFreezesImages,
          textFiles,
          primaryLogFiles,
        )
      })
    } catch (error) {
      if (operationGate.isCurrent(generation)) toastError('读取文件失败: ' + error)
    } finally {
      operationGate.finish(generation)
      input.value = ''
    }
  }

  const triggerFolderSelect = () => {
    operationGate.begin()
    folderInputRef.value?.click()
  }

  const triggerFileSelect = () => {
    operationGate.begin()
    fileInputRef.value?.click()
  }

  const handleFileInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    const file = files[0]
    if (file) {
      operationGate.begin()
      options.onUploadFile(getMxuZipUpload(files, file), options.selectPrimaryLogs)
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
