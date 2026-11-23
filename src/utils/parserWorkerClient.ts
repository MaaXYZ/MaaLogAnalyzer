import LogParserWorker from '../workers/parser.worker?worker'
import type { TaskInfo, TaskSummary } from '../types'
import {
  collectWorkerInputTransfers,
  LOG_PARSER_WORKER_OOM_MESSAGE,
  type LogParserWorkerInput,
  type LogParserWorkerResponse,
} from './parserWorkerProtocol'

export class LogParserWorkerUnavailableError extends Error {
  readonly name = 'LogParserWorkerUnavailableError'
}

export interface ParseWorkerSessionOptions {
  inputs: LogParserWorkerInput[]
  sortInputsByTimestamp?: boolean
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  onProgress?: (percentage: number) => void
  /** 每解析完一个分卷回传一次当前任务瘦摘要（用于解析中实时展示任务清单）。 */
  onTaskSummaries?: (
    summaries: TaskSummary[],
    progress: { parsedInputs: number; totalInputs: number },
  ) => void
  /** 会话被释放时回调（例如换了一份日志），用于让界面停止使用旧会话。 */
  onDispose?: () => void
}

/**
 * 一次解析会话：解析在 Worker 里进行并常驻，主线程只拿**骨架**，详情按需取。
 *
 * - `tasks`：骨架任务（`_skeleton === true`，不含 node_flow / 识别 / 动作 / 事件）。
 * - `projectTaskDetail`：按需投影单个任务；大日志上单任务投影 50–300ms，
 *   跨线程回传取决于任务大小（最大任务 ~300MB，克隆 1–6s），所以只对用户点开的任务付这个成本。
 * - `dispose`：换日志/离开时调用，terminate Worker 归还内存（parser 的 trace 一直在它里面）。
 */
export interface ParseWorkerSession {
  tasks: TaskInfo[]
  projectTaskDetail(
    taskExecutionId: string,
    processIds?: readonly string[],
  ): Promise<TaskInfo | null>
  dispose(): void
}

export const isLogParserWorkerSupported = (): boolean => typeof Worker !== 'undefined'

const createWorker = (): Worker => {
  try {
    return new LogParserWorker()
  } catch (error) {
    throw new LogParserWorkerUnavailableError(
      error instanceof Error ? error.message : String(error),
    )
  }
}

/**
 * 打开一次解析会话。
 *
 * 解析是内存占用最高的一步，放进 Worker 后即便耗尽内存也只终止该 Worker；解析完成后
 * Worker **不终止**，因为主线程还要按需向它索取任务详情。会话由调用方负责 dispose。
 */
export const openParseWorkerSession = (
  options: ParseWorkerSessionOptions,
): Promise<ParseWorkerSession> => {
  if (typeof Worker === 'undefined') {
    return Promise.reject(
      new LogParserWorkerUnavailableError('当前环境不支持 Web Worker'),
    )
  }

  let worker: Worker
  try {
    worker = createWorker()
  } catch (error) {
    return Promise.reject(error)
  }

  const pendingDetails = new Map<
    number,
    { resolve: (task: TaskInfo | null) => void; reject: (error: Error) => void }
  >()
  let nextDetailRequestId = 1
  let disposed = false
  let sessionResolved = false

  const dispose = (reason?: Error) => {
    if (disposed) return
    disposed = true
    for (const pending of pendingDetails.values()) {
      pending.reject(reason ?? new Error('解析会话已关闭'))
    }
    pendingDetails.clear()
    worker.terminate()
    options.onDispose?.()
  }

  return new Promise<ParseWorkerSession>((resolve, reject) => {
    const fail = (error: Error) => {
      if (disposed) return
      if (!sessionResolved) {
        sessionResolved = true
        dispose(error)
        reject(error)
        return
      }
      dispose(error)
    }

    worker.onmessage = (event: MessageEvent<LogParserWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        options.onProgress?.(message.percentage)
        return
      }
      if (message.type === 'task-summaries') {
        options.onTaskSummaries?.(message.summaries, {
          parsedInputs: message.parsedInputs,
          totalInputs: message.totalInputs,
        })
        return
      }
      if (message.type === 'task-skeletons') {
        if (sessionResolved) return
        sessionResolved = true
        resolve({
          tasks: message.tasks,
          projectTaskDetail: (taskExecutionId, processIds) => {
            if (disposed) return Promise.resolve(null)
            const requestId = nextDetailRequestId++
            return new Promise<TaskInfo | null>((resolveDetail, rejectDetail) => {
              pendingDetails.set(requestId, {
                resolve: resolveDetail,
                reject: rejectDetail,
              })
              worker.postMessage({
                type: 'project-task' as const,
                requestId,
                taskExecutionId,
                processIds: processIds ? [...processIds] : undefined,
              })
            })
          },
          dispose: () => dispose(),
        })
        return
      }
      if (message.type === 'task-detail') {
        const pending = pendingDetails.get(message.requestId)
        if (!pending) return
        pendingDetails.delete(message.requestId)
        pending.resolve(message.task)
        return
      }
      if (message.type === 'error') {
        const pending = pendingDetails.get(message.requestId)
        if (pending) {
          pendingDetails.delete(message.requestId)
          pending.reject(new Error(message.message))
          return
        }
        fail(new Error(message.message))
      }
    }

    // Worker 因超内存被浏览器杀掉时只有 error 事件、没有消息体，这里给出 OOM 提示。
    worker.onerror = (event: ErrorEvent) => {
      fail(new Error(event.message || LOG_PARSER_WORKER_OOM_MESSAGE))
    }
    worker.onmessageerror = () => {
      fail(new Error('解析结果无法在线程间传递'))
    }

    worker.postMessage(
      {
        type: 'parse' as const,
        requestId: 1,
        inputs: options.inputs,
        sortInputsByTimestamp: options.sortInputsByTimestamp,
        errorImages: options.errorImages,
        visionImages: options.visionImages,
        waitFreezesImages: options.waitFreezesImages,
      },
      collectWorkerInputTransfers(options.inputs),
    )
  })
}
