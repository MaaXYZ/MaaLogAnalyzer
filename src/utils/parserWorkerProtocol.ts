import type { TaskInfo } from '../types'

/**
 * 传给 Worker 的单个日志来源。
 *
 * 优先使用 `bytes`：ArrayBuffer 可以 transfer，跨线程零拷贝，主线程随即失去该
 * 缓冲区的所有权，避免"字节 + 解码字符串"在主线程同时驻留。只有拿不到原始字节
 * 的调用方才退回 `content`（结构化克隆会复制一份字符串）。
 */
export interface LogParserWorkerInput {
  bytes?: ArrayBuffer
  content?: string
  sourceKey?: string
  sourcePath?: string
  inputIndex?: number
}

export interface LogParserWorkerParseRequest {
  type: 'parse'
  requestId: number
  inputs: LogParserWorkerInput[]
  sortInputsByTimestamp?: boolean
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
}

export type LogParserWorkerRequest = LogParserWorkerParseRequest

export interface LogParserWorkerProgressResponse {
  type: 'progress'
  requestId: number
  percentage: number
}

export interface LogParserWorkerResultResponse {
  type: 'result'
  requestId: number
  tasks: TaskInfo[]
}

export interface LogParserWorkerErrorResponse {
  type: 'error'
  requestId: number
  message: string
}

export type LogParserWorkerResponse =
  LogParserWorkerProgressResponse | LogParserWorkerResultResponse | LogParserWorkerErrorResponse

export const LOG_PARSER_WORKER_OOM_MESSAGE =
  '日志解析占用的内存超出了当前设备的可用上限，解析已中止。请尝试减少一次载入的日志量。'

export const collectWorkerInputTransfers = (
  inputs: readonly LogParserWorkerInput[],
): ArrayBuffer[] => {
  const transfers: ArrayBuffer[] = []
  const seen = new Set<ArrayBuffer>()
  for (const input of inputs) {
    if (input.bytes && !seen.has(input.bytes)) {
      seen.add(input.bytes)
      transfers.push(input.bytes)
    }
  }
  return transfers
}
