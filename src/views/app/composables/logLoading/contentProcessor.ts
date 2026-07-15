import { resolveDeferredTargets } from './deferredTargets'
import type { LogLoadingPipelineOptions, ProcessLogContentParams } from './types'
import { LogParser } from '@windsland52/maa-log-parser'

export const createProcessLogContent = (
  options: LogLoadingPipelineOptions,
) => {
  let latestRequestId = 0

  return async (params: ProcessLogContentParams) => {
    const requestId = ++latestRequestId
    const parser = options.createParser?.() ?? new LogParser()

    options.stopRealtimeSession()
    options.parser.resetParsedEvents()
    options.resetAnalysisState()

    options.setDeferredTextSearchTargets(
      resolveDeferredTargets(params.content, params.loadedTargets, params.deferredTargets),
      params.loadedDefaultTargetId,
    )

    options.showParsingModal.value = true
    options.parseProgress.value = 0

    try {
      options.resetParserDebugAssets(
        params.errorImages,
        params.visionImages,
        params.waitFreezesImages,
      )
      parser.setErrorImages(params.errorImages ?? new Map())
      parser.setVisionImages(params.visionImages ?? new Map())
      parser.setWaitFreezesImages(params.waitFreezesImages ?? new Map())

      const onProgress = (progress: { percentage: number }) => {
        if (requestId === latestRequestId) {
          options.parseProgress.value = progress.percentage
        }
      }

      if (params.parseInputs && params.parseInputs.length > 0) {
        await parser.parseInputs(params.parseInputs, onProgress)
      } else {
        await parser.parseFile(params.content, onProgress)
      }
      const parsedTasks = parser.consumeTasks()
      if (requestId !== latestRequestId) return
      options.applyParsedTasks(parsedTasks, false)

      if (parsedTasks.length === 0) {
        options.onWarning('未能解析出有效的任务数据，请检查日志文件格式是否正确')
      }
    } finally {
      if (requestId === latestRequestId) {
        options.showParsingModal.value = false
        options.parseProgress.value = 0
      }
    }
  }
}
