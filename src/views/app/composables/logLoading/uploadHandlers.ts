import { getErrorMessage } from '../../../../utils/errorHandler'
import type { LoadedTextFile } from '../../../../utils/fileDialog'
import {
  createPrimaryLogParseInputs,
  type LoadedPrimaryLogFile,
} from '../../../../utils/logFileDiscovery'
import { isSupportedArchive, extractArchiveContent } from '../../../../utils/archiveExtractor'
import type { LogLoadingPipelineOptions } from './types'
import type { ProcessLogContentParams } from './types'
import type { TextSearchLoadedTarget } from '../useTextSearchTargets'

interface CreateUploadHandlersOptions {
  pipeline: LogLoadingPipelineOptions
  processLogContent: (params: ProcessLogContentParams) => Promise<void>
}

const createLoadedTargetsFromTextFiles = (
  content: string,
  textFiles?: LoadedTextFile[],
  primaryLogFiles?: LoadedPrimaryLogFile[],
): TextSearchLoadedTarget[] => {
  const primaryPaths = new Set((primaryLogFiles ?? []).map(file => file.path))
  const primaryTargets: TextSearchLoadedTarget[] = (primaryLogFiles ?? []).map((file, index) => ({
    id: `loaded:primary:${index}:${file.path}`,
    label: file.path || file.name,
    fileName: file.name,
    content: file.content,
  }))
  const explicitTargets: TextSearchLoadedTarget[] = (textFiles ?? [])
    .filter(file => !primaryPaths.has(file.path))
    .map((file, index) => ({
      id: `loaded:text:${index}:${file.path}`,
      label: file.path || file.name,
      fileName: file.name,
      content: file.content,
    }))
  if (primaryTargets.length > 0) return [...primaryTargets, ...explicitTargets]
  if (explicitTargets.length > 0) return explicitTargets
  return [{ id: 'loaded:content', label: 'loaded.log', fileName: 'loaded.log', content }]
}

export const createLogLoadingUploadHandlers = (options: CreateUploadHandlersOptions) => {
  const { pipeline, processLogContent } = options

  const handleFileUpload = async (
    file: File,
    selectPrimaryLogs = pipeline.selectPrimaryLogs,
  ) => {
    pipeline.loading.value = true
    try {
      if (isSupportedArchive(file.name)) {
        pipeline.onFileLoadingStart?.()
        try {
          const result = await extractArchiveContent(file, selectPrimaryLogs)
          if (!result) {
            pipeline.onWarning('压缩包中未找到有效的日志文件')
            return
          }

          const loadedTargets = createLoadedTargetsFromTextFiles(result.content, result.textFiles, result.primaryLogFiles)
          const defaultTargetId = pipeline.pickPreferredLogTargetId(loadedTargets)
          await processLogContent({
            content: result.content,
            parseInputs: result.primaryLogFiles.length > 0
              ? createPrimaryLogParseInputs(result.primaryLogFiles)
              : undefined,
            errorImages: result.errorImages,
            visionImages: result.visionImages,
            waitFreezesImages: result.waitFreezesImages,
            loadedTargets,
            loadedDefaultTargetId: defaultTargetId,
          })
        } finally {
          pipeline.onFileLoadingEnd?.()
        }
        return
      }

      const content = await file.text()
      await processLogContent({
        content,
        loadedDefaultTargetId: 'loaded:single',
        deferredTargets: [{
          id: 'loaded:single',
          label: file.name,
          fileName: file.name,
          loadContent: async () => await file.text(),
        }],
      })
    } catch (error) {
      pipeline.onError(getErrorMessage(error))
    } finally {
      pipeline.loading.value = false
    }
  }

  const handleContentUpload = async (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: LoadedPrimaryLogFile[],
  ) => {
    pipeline.loading.value = true
    try {
      const loadedTargets = createLoadedTargetsFromTextFiles(content, textFiles, primaryLogFiles)
      const defaultTargetId = pipeline.pickPreferredLogTargetId(loadedTargets)
      await processLogContent({
        content,
        parseInputs: primaryLogFiles && primaryLogFiles.length > 0
          ? createPrimaryLogParseInputs(primaryLogFiles)
          : undefined,
        errorImages,
        visionImages,
        waitFreezesImages,
        loadedTargets,
        loadedDefaultTargetId: defaultTargetId,
      })
    } catch (error) {
      pipeline.onError(getErrorMessage(error))
    } finally {
      pipeline.loading.value = false
    }
  }

  return {
    handleFileUpload,
    handleContentUpload,
  }
}
