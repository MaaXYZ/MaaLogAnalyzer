import { createProcessLogContent } from './logLoading/contentProcessor'
import { createLogLoadingUploadHandlers } from './logLoading/uploadHandlers'
import type {
  LogLoadingPipelineOptions,
  ProcessLogContentParams,
} from './logLoading/types'
import type {
  DeferredTextSearchTarget,
  TextSearchLoadedTarget,
} from './useTextSearchTargets'

export const useLogLoadingPipeline = (options: LogLoadingPipelineOptions) => {
  const processLogContentCore = createProcessLogContent(options)
  const processLogContent = async (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    loadedTargets?: TextSearchLoadedTarget[],
    loadedDefaultTargetId?: string,
    deferredTargets?: DeferredTextSearchTarget[],
  ) => {
    const params: ProcessLogContentParams = {
      content,
      errorImages,
      visionImages,
      waitFreezesImages,
      loadedTargets,
      loadedDefaultTargetId,
      deferredTargets,
    }
    await processLogContentCore(params)
  }
  const { handleFileUpload, handleContentUpload } = createLogLoadingUploadHandlers({
    pipeline: options,
    processLogContent: processLogContentCore,
  })

  return {
    processLogContent,
    handleFileUpload,
    handleContentUpload,
  }
}
