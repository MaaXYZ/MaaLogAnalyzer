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

self.onmessage = async (event: MessageEvent<LogParserWorkerRequest>) => {
  const request = event.data
  if (request?.type !== 'parse') return

  const { requestId } = request
  try {
    const parser = new LogParser()
    parser.setErrorImages(request.errorImages ?? new Map())
    parser.setVisionImages(request.visionImages ?? new Map())
    parser.setWaitFreezesImages(request.waitFreezesImages ?? new Map())

    const parseInputs = await prepareParserInputs(request.inputs, request.sortInputsByTimestamp)
    request.inputs.length = 0

    await parser.parseInputs(parseInputs, (progress) => {
      post({ type: 'progress', requestId, percentage: progress.percentage })
    })

    // 解析已产出事件，输入来源（gzip Blob / 大字符串）不再需要；紧随其后的
    // consumeTasks 投影是内存峰值，先释放输入引用可让这部分缓冲被回收。
    parseInputs.length = 0

    post({
      type: 'result',
      requestId,
      tasks: parser.consumeTasks({ slimRecognitionDetails: true }),
    })
  } catch (error) {
    post({ type: 'error', requestId, message: getErrorMessage(error) })
  }
}
