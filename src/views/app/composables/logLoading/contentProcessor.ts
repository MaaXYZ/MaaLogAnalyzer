import { resolveDeferredTargets } from './deferredTargets'
import type { LogLoadingPipelineOptions, ProcessLogContentParams } from './types'
import {
  describeNoTaskResult,
  describeParseFailure,
  rememberLoadedTaskCount,
  withPreservedLogNotice,
} from './loadErrorMessages'
import { isGzipLog, readGzipLogHead } from '../../../../utils/gzipLog'
import { decodeFileContent } from '../../../../utils/textEncoding'
import { LogParser } from '@windsland52/maa-log-parser'
import type { TaskInfo } from '../../../../types'
import {
  isLogParserWorkerSupported,
  LogParserWorkerUnavailableError,
  openParseWorkerSession,
  type ParseWorkerSession,
} from '../../../../utils/parserWorkerClient'
import { reviveParsedTaskList } from '../../../../utils/parsedTaskRevival'
import {
  materializeWorkerParseInput,
} from '../../../../utils/logInputSource'
import { prepareParserInputs } from '../../../../utils/prepareParserInputs'

// 解析很快时（内置示例日志只要几十毫秒）不要闪一个 0% 的进度弹窗：
// 超过这个时间还没结束，才认为值得给用户进度反馈。
const PARSING_MODAL_DELAY_MS = 300

/** 失败诊断只用文件开头这么多字符，用于判断「这是不是 MaaFramework 日志」。 */
const LOG_SAMPLE_CHARS = 64 * 1024

/**
 * 只在解析结果为空时读取一小段日志样本。
 *
 * 真正判断「用户选错了文件」还是「日志被截断」需要看到内容，而 Worker 路径只回传任务数组，
 * 所以这里按 LogParseSourceInput 的四种形态各取一次开头；成功路径完全不走这段。
 */
const readLogSampleText = async (params: ProcessLogContentParams): Promise<string> => {
  if (params.content) return params.content.slice(0, LOG_SAMPLE_CHARS)
  const input = params.parseInputs?.[0]
  if (!input) return ''
  if ('content' in input && typeof input.content === 'string') {
    return input.content.slice(0, LOG_SAMPLE_CHARS)
  }
  if ('bytes' in input && input.bytes) {
    return decodeFileContent(input.bytes.subarray(0, LOG_SAMPLE_CHARS))
  }
  if ('file' in input && input.file) {
    if (isGzipLog(input.file.name))
      return decodeFileContent(await readGzipLogHead(input.file, LOG_SAMPLE_CHARS))
    const head = await input.file.slice(0, LOG_SAMPLE_CHARS).arrayBuffer()
    return decodeFileContent(new Uint8Array(head))
  }
  if ('loadBytes' in input && input.loadBytes) {
    return decodeFileContent((await input.loadBytes()).subarray(0, LOG_SAMPLE_CHARS))
  }
  return ''
}

export const createProcessLogContent = (options: LogLoadingPipelineOptions) => {
  let latestRequestId = 0
  let parsingModalTimer: ReturnType<typeof setTimeout> | null = null

  const clearParsingModalTimer = () => {
    if (parsingModalTimer === null) return
    clearTimeout(parsingModalTimer)
    parsingModalTimer = null
  }

  // 每个加载流程共用一个解析会话；换日志时要先释放上一次的（Worker 里留着它的 trace 与骨架）。
  let session: ParseWorkerSession | null = null
  const disposeSession = () => {
    session?.dispose()
    session = null
    options.setTaskDetailLoader?.(null)
  }

  return async (params: ProcessLogContentParams) => {
    const requestId = ++latestRequestId
    const parser = options.createParser?.() ?? new LogParser()

    options.stopRealtimeSession()
    options.parser.resetParsedEvents()
    // 刻意不在这里 resetAnalysisState()：解析可能失败（选错文件、空文件、编码不对、坏压缩包），
    // 而失败不该把用户正在看的日志清成 0 个任务。应用层状态（任务列表、选中项、搜索目标、
    // 错误截图）统一挪到「确实解析出任务之后」再重置，失败时旧数据原样保留。

    disposeSession()
    clearParsingModalTimer()
    options.parseProgress.value = 0
    // 新一次解析：上一次的任务瘦摘要已失效，先清空，避免弹窗里残留旧日志的任务名。
    options.onTaskSummaries?.([], { parsedInputs: 0, totalInputs: 0 })
    parsingModalTimer = setTimeout(() => {
      parsingModalTimer = null
      if (requestId !== latestRequestId) return
      options.showParsingModal.value = true
    }, PARSING_MODAL_DELAY_MS)

    try {
      // 解析器是本次请求新建的实例，先把图片挂上去是安全的；应用层那份错误截图
      // （resetParserDebugAssets）等解析成功再替换，失败时保留上一份日志的截图。
      parser.setErrorImages(params.errorImages ?? new Map())
      parser.setVisionImages(params.visionImages ?? new Map())
      parser.setWaitFreezesImages(params.waitFreezesImages ?? new Map())

      const onProgress = (progress: { percentage: number }) => {
        if (requestId === latestRequestId) {
          options.parseProgress.value = progress.percentage
        }
      }

      const emitTaskSummaries = (
        currentParser: LogParser,
        parsedInputs: number,
        totalInputs: number,
      ) => {
        if (requestId !== latestRequestId || !options.onTaskSummaries) return
        options.onTaskSummaries(currentParser.getTaskSummaries(), {
          parsedInputs,
          totalInputs,
        })
      }

      const parseInline = async (): Promise<TaskInfo[]> => {
        if (params.parseInputs && params.parseInputs.length > 0) {
          const sources = await Promise.all(params.parseInputs.map(materializeWorkerParseInput))
          const parseInputs = await prepareParserInputs(sources, params.sortParseInputs)
          await parser.parseInputs(parseInputs, onProgress, {
            onInputParsed: ({ index, total }) => emitTaskSummaries(parser, index + 1, total),
          })
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
          // 会话在解析完成后仍然活着：主线程拿到的只是骨架，点开任务时才向它取详情。
          const opened = await openParseWorkerSession({
            inputs,
            sortInputsByTimestamp: params.sortParseInputs,
            errorImages: params.errorImages,
            visionImages: params.visionImages,
            waitFreezesImages: params.waitFreezesImages,
            onProgress: (percentage) => onProgress({ percentage }),
            onTaskSummaries: (summaries, progress) => {
              if (requestId !== latestRequestId || !options.onTaskSummaries) return
              options.onTaskSummaries(summaries, progress)
            },
            onDispose: () => {
              if (session === opened) {
                session = null
                options.setTaskDetailLoader?.(null)
              }
            },
          })
          session = opened
          // 骨架在 Worker 里已冻结，但结构化克隆会丢掉 markRaw/冻结状态，主线程要补回来。
          parsedTasks = reviveParsedTaskList(opened.tasks)
          options.setTaskDetailLoader?.(async (task) => {
            const executionId = task.task_execution_id
            if (!executionId) return null
            const detail = await opened.projectTaskDetail(executionId, task.process_ids)
            if (!detail) return null
            return reviveParsedTaskList([detail])[0] ?? null
          })
        } catch (error) {
          if (!(error instanceof LogParserWorkerUnavailableError)) throw error
          disposeSession()
          parsedTasks = await parseInline()
        }
      }
      if (requestId !== latestRequestId) return
      if (parsedTasks.length === 0) {
        // 解析跑完但一个任务都没有：不动页面上的旧日志，只按「是不是 MaaFramework 日志」
        // 给出分类提示。之前这里共用一句「请检查日志文件格式是否正确」，用户无法据此行动。
        const sampleText = await readLogSampleText(params)
        const sourceLabel = params.parseInputs?.[0]?.sourcePath ?? ''
        options.onWarning(withPreservedLogNotice(describeNoTaskResult(sampleText, sourceLabel)))
        return
      }

      // 到这里才确认本次加载有效，可以安全替换旧数据。
      options.resetParserDebugAssets(
        params.errorImages,
        params.visionImages,
        params.waitFreezesImages,
      )
      options.setDeferredTextSearchTargets(
        resolveDeferredTargets(params.content, params.loadedTargets, params.deferredTargets),
        params.loadedDefaultTargetId,
      )
      options.resetAnalysisState()
      options.applyParsedTasks(parsedTasks, false)
      // 骨架已上屏，解析中的瘦摘要完成使命。
      options.onTaskSummaries?.([], { parsedInputs: 0, totalInputs: 0 })
      rememberLoadedTaskCount(parsedTasks.length)
    } catch (error) {
      // 迟到的失败不应该覆盖新请求的结果。
      if (requestId !== latestRequestId) return
      disposeSession()
      // 底层异常（Worker 内存不足、解码失败）含英文细节，留在 console 供排障，界面只给结论。
      console.error('[log-loading] 解析日志失败', error)
      options.onError(withPreservedLogNotice(describeParseFailure(error)))
    } finally {
      clearParsingModalTimer()
      if (requestId === latestRequestId) {
        options.showParsingModal.value = false
        options.parseProgress.value = 0
      }
    }
  }
}
