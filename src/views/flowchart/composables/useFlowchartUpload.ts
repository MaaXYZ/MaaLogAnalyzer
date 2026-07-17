import { ref } from 'vue'
import { toastWarning } from '../../../utils/toast'
import { isTauri } from '../../../utils/platform'
import { decodeFileContent } from '../../../utils/fileDialog'
import {
  collectTextFilesFromFiles,
  type LoadedTextFile,
} from '../../process/utils/fileLoadingHelpers'
import {
  type LoadedPrimaryLogFile,
  PRIMARY_LOG_FILE_HINT,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
} from '../../../utils/logFileDiscovery'

interface UseFlowchartUploadOptions {
  onUploadFile: (file: File) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: LoadedPrimaryLogFile[],
  ) => void
}

export const useFlowchartUpload = ({
  onUploadFile,
  onUploadContent,
}: UseFlowchartUploadOptions) => {
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)

  const uploadOptions = [
    { label: '选择文件', key: 'file' },
    { label: '选择文件夹', key: 'folder' },
  ]

  function emitUploadContent(
    content: string,
    errorImages: Map<string, string>,
    visionImages: Map<string, string>,
    waitFreezesImages: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: LoadedPrimaryLogFile[],
  ) {
    onUploadContent(
      content,
      errorImages.size > 0 ? errorImages : undefined,
      visionImages.size > 0 ? visionImages : undefined,
      waitFreezesImages.size > 0 ? waitFreezesImages : undefined,
      textFiles,
      primaryLogFiles,
    )
  }

  function handleUploadSelect(key: string) {
    if (isTauri()) {
      void handleTauriOpen(key)
    } else if (key === 'file') {
      fileInputRef.value?.click()
    } else {
      folderInputRef.value?.click()
    }
  }

  const getFileRelativePath = (file: File) => {
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

  const resolveSelectedLogContentFromFiles = async (files: Iterable<File>) => {
    const fileList = Array.from(files)
    const selectedLogs = selectPrimaryLogGroup(
      fileList.map(file => ({
        name: file.name,
        path: getFileRelativePath(file),
        file,
      })),
    )
    if (selectedLogs.length === 0) {
      return {
        content: '',
        scopedFiles: [] as File[],
        primaryLogFiles: [] as LoadedPrimaryLogFile[],
      }
    }

    const loadedLogs = await Promise.all(selectedLogs.map(async ({ item }) => ({
      name: item.name,
      path: item.path,
      content: await item.file.text(),
    })))

    return {
      content: '',
      scopedFiles: filterFilesBySelectedDir(fileList, selectedLogs[0].candidate.dirPath),
      primaryLogFiles: sortLoadedPrimaryLogSegments(loadedLogs),
    }
  }

  async function handleTauriOpen(key: string) {
    try {
      if (key === 'file') {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({
          multiple: false,
          filters: [{ name: 'Log Files', extensions: ['log', 'jsonl', 'txt', 'zip'] }],
          directory: false,
          title: '选择日志文件',
        })
        if (!selected) return
        const path = typeof selected === 'string' ? selected : (selected as any).path
        if (path.toLowerCase().endsWith('.zip')) {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const bytes = await readFile(path)
          onUploadFile(new File([bytes], path.split(/[/\\]/).pop() || 'file.zip'))
        } else {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const content = decodeFileContent(await readFile(path))
          onUploadContent(content)
        }
      } else {
        const { openFolderDialog } = await import('../../../utils/fileDialog')
        const result = await openFolderDialog()
        if (!result) return
        emitUploadContent(
          result.content,
          result.errorImages,
          result.visionImages,
          result.waitFreezesImages,
          result.textFiles,
          result.primaryLogFiles,
        )
      }
    } catch (error) {
      console.error('Tauri open failed:', error)
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (file) onUploadFile(file)
    input.value = ''
  }

  async function handleFolderInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return

    const { scopedFiles, primaryLogFiles } = await resolveSelectedLogContentFromFiles(files)
    if (primaryLogFiles.length === 0) {
      toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
      input.value = ''
      return
    }

    const errorImages = new Map<string, string>()
    const visionImages = new Map<string, string>()
    const waitFreezesImages = new Map<string, string>()

    for (const file of scopedFiles) {
      const name = file.name.toLowerCase()
      if (name.endsWith('.png') || name.endsWith('.jpg')) {
        const baseName = file.name.replace(/\.(png|jpg)$/i, '')
        const url = URL.createObjectURL(file)
        if (baseName.endsWith('_wait_freezes')) {
          waitFreezesImages.set(baseName, url)
        } else if (baseName.includes('_vision_')) {
          visionImages.set(baseName, url)
        } else {
          errorImages.set(baseName, url)
        }
      }
    }

    if (primaryLogFiles.length > 0) {
      const textFiles = await collectTextFilesFromFiles(scopedFiles)
      emitUploadContent('', errorImages, visionImages, waitFreezesImages, textFiles, primaryLogFiles)
    }
    input.value = ''
  }

  return {
    fileInputRef,
    folderInputRef,
    uploadOptions,
    handleUploadSelect,
    handleFileInputChange,
    handleFolderInputChange,
  }
}
