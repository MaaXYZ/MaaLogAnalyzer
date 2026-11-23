import type { TaskInfo, TaskSummary } from '../types'

/**
 * 传给 Worker 的单个日志来源。
 *
 * 优先使用 `bytes`：ArrayBuffer 可以 transfer，跨线程零拷贝，主线程随即失去该
 * 缓冲区的所有权，避免"字节 + 解码字符串"在主线程同时驻留。只有拿不到原始字节
 * 的调用方才退回 `content`（结构化克隆会复制一份字符串）。
 */
export interface LogParserWorkerInput {
  bytes?: ArrayBuffer
  gzip?: Blob
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

export interface LogParserWorkerProjectTaskRequest {
  type: 'project-task'
  requestId: number
  /** 任务在本轮加载内的唯一 id（`TaskSummary.task_execution_id`）。 */
  taskExecutionId: string
  /** 镜像合并后的进程集合（骨架里有、单任务投影本身看不到被合并的副本）。 */
  processIds?: readonly string[]
}

export type LogParserWorkerRequest =
  | LogParserWorkerParseRequest
  | LogParserWorkerProjectTaskRequest

export interface LogParserWorkerProgressResponse {
  type: 'progress'
  requestId: number
  percentage: number
}

export interface LogParserWorkerTaskSummariesResponse {
  type: 'task-summaries'
  requestId: number
  /** 截至该分卷解析完成时的任务瘦摘要（不含 nodes/明细）。 */
  summaries: TaskSummary[]
  parsedInputs: number
  totalInputs: number
}

export interface LogParserWorkerSkeletonsResponse {
  type: 'task-skeletons'
  requestId: number
  /** 全部任务的骨架（不含 node_flow / 识别 / 动作 / 事件），payload 只有几百 KB 量级。 */
  tasks: TaskInfo[]
}

export interface LogParserWorkerTaskDetailResponse {
  type: 'task-detail'
  requestId: number
  taskExecutionId: string
  task: TaskInfo | null
}

export interface LogParserWorkerResultResponse {
  type: 'result'
  requestId: number
}

export interface LogParserWorkerErrorResponse {
  type: 'error'
  requestId: number
  message: string
}

export type LogParserWorkerResponse =
  | LogParserWorkerProgressResponse
  | LogParserWorkerTaskSummariesResponse
  | LogParserWorkerSkeletonsResponse
  | LogParserWorkerTaskDetailResponse
  | LogParserWorkerResultResponse
  | LogParserWorkerErrorResponse

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
