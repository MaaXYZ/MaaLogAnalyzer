import { getErrorMessage } from '../../../../utils/errorHandler'
import type { LoadedTextFile } from '../../../../utils/fileDialog'
import type { LogLoadingPipelineOptions } from './types'
import type { ProcessLogContentParams } from './types'
import type { TextSearchLoadedTarget } from '../useTextSearchTargets'

interface CreateUploadHandlersOptions {
  pipeline: LogLoadingPipelineOptions
  processLogContent: (params: ProcessLogContentParams) => Promise<void>
}

const createLoadedTargetsFromZip = (
  textFiles: Array<{ path: string; name: string; content: string }>,
): TextSearchLoadedTarget[] => {
  return textFiles.map((textFile, index) => ({
    id: `zip:${index}:${textFile.path}`,
    label: textFile.path,
    fileName: textFile.name,
    content: textFile.content,
  }))
}

const createLoadedTargetsFromTextFiles = (
  content: string,
  textFiles?: LoadedTextFile[],
): TextSearchLoadedTarget[] => {
  const explicitTargets: TextSearchLoadedTarget[] = (textFiles ?? []).map((file, index) => ({
    id: `loaded:text:${index}:${file.path}`,
    label: file.path || file.name,
    fileName: file.name,
    content: file.content,
  }))
  if (explicitTargets.length > 0) return explicitTargets
  return [{ id: 'loaded:content', label: 'loaded.log', fileName: 'loaded.log', content }]
}

export const createLogLoadingUploadHandlers = (options: CreateUploadHandlersOptions) => {
  const { pipeline, processLogContent } = options

  const handleFileUpload = async (file: File) => {
    pipeline.loading.value = true
    try {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const { extractZipContent } = await import('../../../../utils/zipExtractor')
        const result = await extractZipContent(file)
        if (!result) {
          pipeline.onWarning('ZIP 文件中未找到有效的日志文件')
          return
        }

        const loadedTargets = createLoadedTargetsFromZip(result.textFiles)
        const defaultTargetId = pipeline.pickPreferredLogTargetId(loadedTargets)
        await processLogContent({
          content: result.content,
          errorImages: result.errorImages,
          visionImages: result.visionImages,
          waitFreezesImages: result.waitFreezesImages,
          loadedTargets,
          loadedDefaultTargetId: defaultTargetId,
        })
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
  ) => {
    pipeline.loading.value = true
    try {
      const loadedTargets = createLoadedTargetsFromTextFiles(content, textFiles)
      const defaultTargetId = pipeline.pickPreferredLogTargetId(loadedTargets)
      await processLogContent({
        content,
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
