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

export interface ParseInWorkerParams {
  inputs: LogParserWorkerInput[]
  sortInputsByTimestamp?: boolean
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  onProgress?: (percentage: number) => void
  /** 每解析完一个分卷回传一次当前任务瘦摘要（用于边解析边上屏）。 */
  onTaskSummaries?: (
    summaries: TaskSummary[],
    progress: { parsedInputs: number; totalInputs: number },
  ) => void
}

export const isLogParserWorkerSupported = (): boolean => typeof Worker !== 'undefined'

/**
 * 在 Worker 中解析日志。
 *
 * 解析是整个应用里内存占用最高的一步，放进 Worker 后即便耗尽内存也只会终止该
 * Worker，主线程仍可提示用户，而不是整个标签页被浏览器回收。每次解析使用独立
 * Worker，结束即终止，确保解析期间的中间状态不会跨次累积。
 */
export const parseLogsInWorker = ({
  inputs,
  sortInputsByTimestamp,
  errorImages,
  visionImages,
  waitFreezesImages,
  onProgress,
  onTaskSummaries,
}: ParseInWorkerParams): Promise<TaskInfo[]> => {
  if (!isLogParserWorkerSupported()) {
    return Promise.reject(new LogParserWorkerUnavailableError('当前环境不支持 Web Worker'))
  }

  let worker: Worker
  try {
    worker = new LogParserWorker()
  } catch (error) {
    return Promise.reject(
      new LogParserWorkerUnavailableError(error instanceof Error ? error.message : String(error)),
    )
  }

  return new Promise<TaskInfo[]>((resolve, reject) => {
    let settled = false
    const finish = (run: () => void) => {
      if (settled) return
      settled = true
      worker.terminate()
      run()
    }

    worker.onmessage = (event: MessageEvent<LogParserWorkerResponse>) => {
      const message = event.data
      if (message.type === 'progress') {
        onProgress?.(message.percentage)
        return
      }
      if (message.type === 'task-summaries') {
        onTaskSummaries?.(message.summaries, {
          parsedInputs: message.parsedInputs,
          totalInputs: message.totalInputs,
        })
        return
      }
      if (message.type === 'result') {
        finish(() => resolve(message.tasks))
        return
      }
      finish(() => reject(new Error(message.message)))
    }

    // A worker killed by the browser for exceeding memory reports an error
    // event without a message, so surface the out-of-memory hint here.
    worker.onerror = (event: ErrorEvent) => {
      finish(() => reject(new Error(event.message || LOG_PARSER_WORKER_OOM_MESSAGE)))
    }
    worker.onmessageerror = () => {
      finish(() => reject(new Error('解析结果无法在线程间传递')))
    }

    worker.postMessage(
      {
        type: 'parse' as const,
        requestId: 1,
        inputs,
        sortInputsByTimestamp,
        errorImages,
        visionImages,
        waitFreezesImages,
      },
      collectWorkerInputTransfers(inputs),
    )
  })
}
