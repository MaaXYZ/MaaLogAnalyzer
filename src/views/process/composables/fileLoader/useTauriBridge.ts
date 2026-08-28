import type { UseProcessFileLoaderOptions } from './types'
import { toastError } from '../../../../utils/toast'
import { invoke } from '@tauri-apps/api/core'
import { decodeFileContent } from '../../../../utils/textEncoding'
import { chargeTauriRegularFile, normalizeTauriDialogPaths } from '../../../../utils/fileDialog'
import {
  createPrimaryLogSelectionOptions,
  sortLoadedPrimaryLogSegments,
  type LoadedPrimaryLogFile,
} from '../../../../utils/logFileDiscovery'
import {
  releaseTauriArchiveResource,
  type TauriArchiveResourceOwner,
} from '../../../../utils/tauriArchiveResources'
import {
  createInputResourceBudget,
  registerInputResourceEntry,
} from '../../../../utils/browserInputBudget'
import type { FileLoadOperationGate } from './operationGate'

interface TauriArchiveLoadResult {
  content: string
  primary_log_files: LoadedPrimaryLogFile[]
  error_images: Record<string, string>
  vision_images: Record<string, string>
  wait_freezes_images: Record<string, string>
  resource_token?: string | null
}

const createTauriImageMap = (entries: Record<string, string>) => {
  const result = new Map<string, string>()
  for (const [key, value] of Object.entries(entries ?? {})) {
    result.set(key, value)
  }
  return result
}

export const useTauriBridge = (
  options: UseProcessFileLoaderOptions,
  operationGate: FileLoadOperationGate,
  archiveResourceOwner: TauriArchiveResourceOwner,
) => {
  const handleTauriOpen = async () => {
    const generation = operationGate.begin()
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({
        multiple: true,
        filters: [{
          name: 'Log Files',
          extensions: ['log', 'jsonl', 'txt', 'zip'],
        }],
        directory: false,
        title: '选择日志文件',
      })

      const selectedPaths = normalizeTauriDialogPaths(selected)
      const anchor = selectedPaths[0]
      if (anchor) {
        try {
          if (!operationGate.startLoading(generation)) return

          if (anchor.toLowerCase().endsWith('.zip')) {
            let resourceToken: string | null = null
            let adoptedResource = false
            try {
              const result = await invoke<TauriArchiveLoadResult>('extract_zip_log', {
                path: anchor,
                paths: selectedPaths,
              })
              resourceToken = result.resource_token ?? null
              if (!operationGate.isCurrent(generation)) return

              const errorImages = createTauriImageMap(result.error_images)
              const visionImages = createTauriImageMap(result.vision_images)
              const waitFreezesImages = createTauriImageMap(result.wait_freezes_images)
              const primaryLogFiles = sortLoadedPrimaryLogSegments(result.primary_log_files ?? [])
              const selectedOptions = options.selectPrimaryLogs
                ? await options.selectPrimaryLogs(createPrimaryLogSelectionOptions(primaryLogFiles))
                : createPrimaryLogSelectionOptions(primaryLogFiles)
              if (!operationGate.isCurrent(generation)) return
              if (!selectedOptions) return

              const selectedLogPaths = new Set(selectedOptions.map(option => option.path))
              const selectedPrimaryLogFiles = primaryLogFiles.filter(file => selectedLogPaths.has(file.path))
              if (selectedPrimaryLogFiles.length === 0) return

              options.onUploadContent(
                result.content,
                errorImages,
                visionImages,
                waitFreezesImages,
                undefined,
                selectedPrimaryLogFiles,
              )
              await archiveResourceOwner.replace(resourceToken)
              adoptedResource = true
            } finally {
              if (resourceToken && !adoptedResource) {
                await releaseTauriArchiveResource(resourceToken)
              }
            }
          } else {
            const { readFile } = await import('@tauri-apps/plugin-fs')
            const budget = createInputResourceBudget(null)
            registerInputResourceEntry(budget, anchor, 0)
            await chargeTauriRegularFile(anchor, budget)
            if (!operationGate.isCurrent(generation)) return

            const fileName = anchor.split(/[/\\]/).pop() || 'loaded.log'
            options.onUploadContent(
              '',
              undefined,
              undefined,
              undefined,
              undefined,
              [{
                path: anchor,
                name: fileName,
                loadBytes: async () => await readFile(anchor),
                loadContent: async () => decodeFileContent(await readFile(anchor)),
              }],
            )
          }
        } finally {
          operationGate.finish(generation)
        }
      }
    } catch (error) {
      if (operationGate.isCurrent(generation)) toastError('打开文件失败: ' + error)
    } finally {
      operationGate.finish(generation)
    }
  }

  const handleTauriOpenFolder = async () => {
    const generation = operationGate.begin()
    try {
      const { openFolderDialog } = await import('../../../../utils/fileDialog')

      if (!operationGate.startLoading(generation)) return

      const result = await openFolderDialog({
        selectPrimaryLogs: options.selectPrimaryLogs,
      })
      if (!operationGate.isCurrent(generation)) return
      if (result) {
        options.onUploadContent(
          result.content,
          result.errorImages,
          result.visionImages,
          result.waitFreezesImages,
          result.textFiles,
          result.primaryLogFiles,
        )
      }
    } catch (error) {
      if (operationGate.isCurrent(generation)) toastError('打开文件夹失败: ' + error)
    } finally {
      operationGate.finish(generation)
    }
  }

  return {
    handleTauriOpen,
    handleTauriOpenFolder,
  }
}
