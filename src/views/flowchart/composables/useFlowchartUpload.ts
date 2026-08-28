import { onUnmounted, ref } from 'vue'
import { toastWarning } from '../../../utils/toast'
import { isTauri } from '../../../utils/platform'
import { decodeFileContent } from '../../../utils/textEncoding'
import { replaceBlobUrl, revokeBlobUrlMap } from '../../../utils/blobUrlMap'
import { chargeTauriRegularFile, normalizeTauriDialogPaths } from '../../../utils/fileDialog'
import {
  collectTextFilesFromFiles,
  type LoadedTextFile,
} from '../../process/utils/fileLoadingHelpers'
import {
  type LoadedPrimaryLogFile,
  type FilePrimaryLogFile,
  type PrimaryLogFile,
  PRIMARY_LOG_FILE_HINT,
  selectPrimaryLogGroup,
  sortLoadedPrimaryLogSegments,
} from '../../../utils/logFileDiscovery'
import {
  collectMxuZipVolumes,
  findMxuZipVolumes,
} from '../../../utils/mxuZipVolumes'
import {
  createTauriArchiveResourceOwner,
  releaseTauriArchiveResource,
} from '../../../utils/tauriArchiveResources'
import {
  chargeBrowserInputFile,
  createBrowserInputBudget,
  createInputResourceBudget,
  registerBrowserInputFile,
  registerInputResourceEntry,
  type BrowserInputBudget,
} from '../../../utils/browserInputBudget'

interface UseFlowchartUploadOptions {
  onUploadFile: (file: File | File[]) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: PrimaryLogFile[],
  ) => void
}

export const useFlowchartUpload = ({
  onUploadFile,
  onUploadContent,
}: UseFlowchartUploadOptions) => {
  const fileInputRef = ref<HTMLInputElement | null>(null)
  const folderInputRef = ref<HTMLInputElement | null>(null)
  const archiveResourceOwner = createTauriArchiveResourceOwner()
  let uploadGeneration = 0

  const beginUpload = () => {
    uploadGeneration += 1
    return uploadGeneration
  }

  const isCurrentUpload = (generation: number) => generation === uploadGeneration

  const withUnmeteredBrowserInput = async <T>(
    load: (budget: BrowserInputBudget) => Promise<T>,
  ): Promise<T> => load(createBrowserInputBudget(null))

  const revokeUploadImages = (...maps: Array<Map<string, string>>) => {
    for (const map of maps) revokeBlobUrlMap(map)
  }

  const uploadOptions = [
    { label: '选择文件', key: 'file' },
    { label: '选择文件夹', key: 'folder' },
  ]

  const toImageMap = (entries: Record<string, string>) => new Map(Object.entries(entries ?? {}))

  const getMxuZipUpload = (files: File[], anchor: File): File | File[] => {
    const volumes = collectMxuZipVolumes(files, anchor)
    return volumes.length > 1 ? volumes : anchor
  }

  async function emitUploadContent(
    content: string,
    errorImages: Map<string, string>,
    visionImages: Map<string, string>,
    waitFreezesImages: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: PrimaryLogFile[],
    resourceToken?: string | null,
    generation = uploadGeneration,
  ) {
    if (!isCurrentUpload(generation)) {
      revokeUploadImages(errorImages, visionImages, waitFreezesImages)
      await releaseTauriArchiveResource(resourceToken)
      return
    }
    let adoptedResource = false
    const releasePrevious = archiveResourceOwner.release()
    try {
      onUploadContent(
        content,
        errorImages.size > 0 ? errorImages : undefined,
        visionImages.size > 0 ? visionImages : undefined,
        waitFreezesImages.size > 0 ? waitFreezesImages : undefined,
        textFiles,
        primaryLogFiles,
      )
      await releasePrevious
      await archiveResourceOwner.replace(resourceToken)
      adoptedResource = true
    } finally {
      if (resourceToken && !adoptedResource) {
        await releaseTauriArchiveResource(resourceToken)
      }
    }
  }

  const emitUploadFile = (file: File | File[], generation: number) => {
    if (!isCurrentUpload(generation)) return
    void archiveResourceOwner.release()
    onUploadFile(file)
  }

  function handleUploadSelect(key: string) {
    const generation = beginUpload()
    if (isTauri()) {
      void handleTauriOpen(key, generation)
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

  const resolveSelectedLogContentFromFiles = async (
    files: Iterable<File>,
    budget: BrowserInputBudget,
  ) => {
    const fileList = Array.from(files)
    for (const file of fileList) {
      registerBrowserInputFile(budget, file, getFileRelativePath(file))
    }
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
        primaryLogFiles: [] as FilePrimaryLogFile[],
      }
    }

    for (const { item } of selectedLogs) {
      chargeBrowserInputFile(budget, item.file)
    }
    const primaryLogFiles: FilePrimaryLogFile[] = selectedLogs.map(({ item }) => ({
      name: item.name,
      path: item.path,
      file: item.file,
      loadContent: async () => decodeFileContent(new Uint8Array(await item.file.arrayBuffer())),
    }))

    return {
      content: '',
      scopedFiles: filterFilesBySelectedDir(fileList, selectedLogs[0].candidate.dirPath),
      primaryLogFiles,
    }
  }

  async function handleTauriOpen(key: string, generation: number) {
    try {
      if (key === 'file') {
        const { open } = await import('@tauri-apps/plugin-dialog')
        const selected = await open({
          multiple: true,
          filters: [{ name: 'Log Files', extensions: ['log', 'jsonl', 'txt', 'zip'] }],
          directory: false,
          title: '选择日志文件',
        })
        if (!isCurrentUpload(generation)) return
        const selectedPaths = normalizeTauriDialogPaths(selected)
        const path = selectedPaths[0]
        if (!path) return
        if (path.toLowerCase().endsWith('.zip')) {
          const { invoke } = await import('@tauri-apps/api/core')
          type ArchiveResult = {
            content: string
            primary_log_files: LoadedPrimaryLogFile[]
            error_images: Record<string, string>
            vision_images: Record<string, string>
            wait_freezes_images: Record<string, string>
            resource_token?: string | null
          }
          const result = await invoke<ArchiveResult>('extract_zip_log', {
            path,
            paths: selectedPaths,
          })
          await emitUploadContent(
            result.content,
            toImageMap(result.error_images),
            toImageMap(result.vision_images),
            toImageMap(result.wait_freezes_images),
            undefined,
            sortLoadedPrimaryLogSegments(result.primary_log_files ?? []),
            result.resource_token,
            generation,
          )
        } else {
          const { readFile } = await import('@tauri-apps/plugin-fs')
          const budget = createInputResourceBudget(null)
          registerInputResourceEntry(budget, path, 0)
          await chargeTauriRegularFile(path, budget)
          const fileName = path.split(/[/\\]/).pop() || 'loaded.log'
          await emitUploadContent(
            '',
            new Map(),
            new Map(),
            new Map(),
            undefined,
            [{
              path,
              name: fileName,
              loadBytes: async () => await readFile(path),
              loadContent: async () => decodeFileContent(await readFile(path)),
            }],
            undefined,
            generation,
          )
        }
      } else {
        const { openFolderDialog } = await import('../../../utils/fileDialog')
        const result = await openFolderDialog()
        if (!result) return
        await emitUploadContent(
          result.content,
          result.errorImages,
          result.visionImages,
          result.waitFreezesImages,
          result.textFiles,
          result.primaryLogFiles,
          undefined,
          generation,
        )
      }
    } catch (error) {
      if (isCurrentUpload(generation)) console.error('Tauri open failed:', error)
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = Array.from(input.files ?? [])
    const file = files[0]
    const generation = beginUpload()
    if (file) emitUploadFile(getMxuZipUpload(files, file), generation)
    input.value = ''
  }

  async function handleFolderInputChange(event: Event) {
    const input = event.target as HTMLInputElement
    const files = input.files
    if (!files || files.length === 0) return
    const generation = beginUpload()

    try {
      await withUnmeteredBrowserInput(async (budget) => {
        const { scopedFiles, primaryLogFiles } = await resolveSelectedLogContentFromFiles(
          files,
          budget,
        )
        if (!isCurrentUpload(generation)) return
        if (primaryLogFiles.length === 0) {
          const volumes = findMxuZipVolumes(files)
          if (volumes.length > 0) {
            emitUploadFile(volumes.length > 1 ? volumes : volumes[0], generation)
            return
          }
          toastWarning(`文件夹中未找到日志文件（${PRIMARY_LOG_FILE_HINT}）`)
          return
        }

        const errorImages = new Map<string, string>()
        const visionImages = new Map<string, string>()
        const waitFreezesImages = new Map<string, string>()

        for (const file of scopedFiles) {
          const name = file.name.toLowerCase()
          if (name.endsWith('.png') || name.endsWith('.jpg')) {
            chargeBrowserInputFile(budget, file, { image: true })
          }
        }

        try {
          for (const file of scopedFiles) {
            const name = file.name.toLowerCase()
            if (name.endsWith('.png') || name.endsWith('.jpg')) {
              const baseName = file.name.replace(/\.(png|jpg)$/i, '')
              if (baseName.endsWith('_wait_freezes')) {
                replaceBlobUrl(waitFreezesImages, baseName, file)
              } else if (baseName.includes('_vision_')) {
                replaceBlobUrl(visionImages, baseName, file)
              } else {
                replaceBlobUrl(errorImages, baseName, file)
              }
            }
          }

          const textFiles = await collectTextFilesFromFiles(scopedFiles, budget)
          await emitUploadContent(
            '',
            errorImages,
            visionImages,
            waitFreezesImages,
            textFiles,
            primaryLogFiles,
            undefined,
            generation,
          )
        } catch (error) {
          revokeUploadImages(errorImages, visionImages, waitFreezesImages)
          throw error
        }
      })
    } finally {
      input.value = ''
    }
  }

  onUnmounted(() => {
    beginUpload()
    void archiveResourceOwner.dispose()
  })

  return {
    fileInputRef,
    folderInputRef,
    uploadOptions,
    handleUploadSelect,
    handleFileInputChange,
    handleFolderInputChange,
  }
}
