import { resolveDeferredTargets } from './deferredTargets'
import type { LogLoadingPipelineOptions, ProcessLogContentParams } from './types'
import { LogParser } from '@windsland52/maa-log-parser'
import type { TaskInfo } from '../../../../types'
import {
  isLogParserWorkerSupported,
  LogParserWorkerUnavailableError,
  parseLogsInWorker,
} from '../../../../utils/parserWorkerClient'
import { reviveParsedTaskList } from '../../../../utils/parsedTaskRevival'
import {
  materializeInlineParseInput,
  materializeWorkerParseInput,
} from '../../../../utils/logInputSource'
import { sortPrimaryLogParseInputs } from '../../../../utils/logFileDiscovery'

// 解析很快时（内置示例日志只要几十毫秒）不要闪一个 0% 的进度弹窗：
// 超过这个时间还没结束，才认为值得给用户进度反馈。
const PARSING_MODAL_DELAY_MS = 300

export const createProcessLogContent = (options: LogLoadingPipelineOptions) => {
  let latestRequestId = 0
  let parsingModalTimer: ReturnType<typeof setTimeout> | null = null

  const clearParsingModalTimer = () => {
    if (parsingModalTimer === null) return
    clearTimeout(parsingModalTimer)
    parsingModalTimer = null
  }

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

    clearParsingModalTimer()
    options.parseProgress.value = 0
    parsingModalTimer = setTimeout(() => {
      parsingModalTimer = null
      if (requestId !== latestRequestId) return
      options.showParsingModal.value = true
    }, PARSING_MODAL_DELAY_MS)

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

      const parseInline = async (): Promise<TaskInfo[]> => {
        if (params.parseInputs && params.parseInputs.length > 0) {
          const decodedInputs = await Promise.all(
            params.parseInputs.map(materializeInlineParseInput),
          )
          const parseInputs = params.sortParseInputs
            ? sortPrimaryLogParseInputs(decodedInputs)
            : decodedInputs
          await parser.parseInputs(parseInputs, onProgress)
        } else {
          await parser.parseFile(params.content, onProgress)
        }
        return parser.consumeTasks()
      }

      // 解析是内存峰值最高的一步。放进 Worker 后即使耗尽内存，被浏览器终止的也
      // 只是该 Worker，主线程仍能提示用户；退回主线程解析仅用于不支持 Worker 的
      // 环境（以及注入了 createParser 的测试）。
      let parsedTasks: TaskInfo[]
      if (options.createParser || !isLogParserWorkerSupported()) {
        parsedTasks = await parseInline()
      } else {
        try {
          const inputs =
            params.parseInputs && params.parseInputs.length > 0
              ? await Promise.all(params.parseInputs.map(materializeWorkerParseInput))
              : [{ content: params.content }]
          parsedTasks = reviveParsedTaskList(
            await parseLogsInWorker({
              inputs,
              sortInputsByTimestamp: params.sortParseInputs,
              errorImages: params.errorImages,
              visionImages: params.visionImages,
              waitFreezesImages: params.waitFreezesImages,
              onProgress: (percentage) => onProgress({ percentage }),
            }),
          )
        } catch (error) {
          if (!(error instanceof LogParserWorkerUnavailableError)) throw error
          parsedTasks = await parseInline()
        }
      }
      if (requestId !== latestRequestId) return
      options.applyParsedTasks(parsedTasks, false)

      if (parsedTasks.length === 0) {
        options.onWarning('未能解析出有效的任务数据，请检查日志文件格式是否正确')
      }
    } finally {
      clearParsingModalTimer()
      if (requestId === latestRequestId) {
        options.showParsingModal.value = false
        options.parseProgress.value = 0
      }
    }
  }
}
