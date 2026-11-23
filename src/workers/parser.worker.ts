/// <reference lib="webworker" />

import { LogParser } from '@windsland52/maa-log-parser'
import { prepareParserInputs } from '../utils/prepareParserInputs'
import type {
  LogParserWorkerRequest,
  LogParserWorkerResponse,
} from '../utils/parserWorkerProtocol'

const post = (message: LogParserWorkerResponse): void => {
  self.postMessage(message)
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

/**
 * 解析完成后保留的 parser 实例。
 *
 * 主线程不再一次性拿走完整任务树（大日志上那是 1.8GB、克隆要几十秒），
 * 而是只拿骨架；用户点开某个任务时再发 `project-task`，这里按需投影该任务。
 */
let retainedParser: LogParser | null = null

self.onmessage = async (event: MessageEvent<LogParserWorkerRequest>) => {
  const request = event.data
  if (request?.type === 'project-task') {
    const parser = retainedParser
    if (!parser) {
      post({
        type: 'error',
        requestId: request.requestId,
        message: '解析器尚未就绪，无法投影任务详情',
      })
      return
    }
    try {
      const task = parser.projectTaskDetail(request.taskExecutionId, request.processIds)
      post({
        type: 'task-detail',
        requestId: request.requestId,
        taskExecutionId: request.taskExecutionId,
        task,
      })
    } catch (error) {
      post({ type: 'error', requestId: request.requestId, message: getErrorMessage(error) })
    }
    return
  }
  if (request?.type !== 'parse') return

  const { requestId } = request
  retainedParser = null
  try {
    const parser = new LogParser()
    parser.setErrorImages(request.errorImages ?? new Map())
    parser.setVisionImages(request.visionImages ?? new Map())
    parser.setWaitFreezesImages(request.waitFreezesImages ?? new Map())

    const parseInputs = await prepareParserInputs(request.inputs, request.sortInputsByTimestamp)
    request.inputs.length = 0

    await parser.parseInputs(
      parseInputs,
      (progress) => {
        post({ type: 'progress', requestId, percentage: progress.percentage })
      },
      {
        // 边解析边把「已归约出的任务清单」回传主线程：大日志上整树投影比解析还慢，
        // 先用瘦摘要让界面出列表，解析完成后再用完整任务树整表替换。
        onInputParsed: ({ index, total }) => {
          post({
            type: 'task-summaries',
            requestId,
            summaries: parser.getTaskSummaries(),
            parsedInputs: index + 1,
            totalInputs: total,
          })
        },
      },
    )

    // 解析已产出事件，输入来源（gzip Blob / 大字符串）不再需要。
    parseInputs.length = 0

    // 只回传骨架：几十 KB～几百 KB，主线程立即可用。完整任务在用户点开时按需投影。
    post({ type: 'task-skeletons', requestId, tasks: parser.getTaskSkeletons() })
    // Worker 保持存活以响应后续 `project-task`；主线程换下一份日志时 terminate 它。
    retainedParser = parser
  } catch (error) {
    post({ type: 'error', requestId, message: getErrorMessage(error) })
  }
}
