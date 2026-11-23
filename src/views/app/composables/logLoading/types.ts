import type { Ref } from 'vue'
import type { LoadedTextFile } from '../../../../utils/fileDialog'
import type { PrimaryLogFile, PrimaryLogSelectionOption } from '../../../../utils/logFileDiscovery'
import type { TaskInfo, TaskSummary } from '../../../../types'
import type { LogParser } from '@windsland52/maa-log-parser'
import type { LogParseSourceInput } from '../../../../utils/logInputSource'
import type { DeferredTextSearchTarget, TextSearchLoadedTarget } from '../useTextSearchTargets'

export interface LogLoadingPipelineOptions {
  parser: LogParser
  createParser?: () => LogParser
  loading: Ref<boolean>
  showParsingModal: Ref<boolean>
  parseProgress: Ref<number>
  stopRealtimeSession: () => void
  resetAnalysisState: () => void
  resetParserDebugAssets: (
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
  ) => void
  setDeferredTextSearchTargets: (targets: DeferredTextSearchTarget[], defaultId?: string) => void
  pickPreferredLogTargetId: (targets: TextSearchLoadedTarget[]) => string
  applyParsedTasks: (nextTasks: TaskInfo[], preserveSelection: boolean) => void
  /**
   * 解析进行中的任务瘦摘要（边解析边上屏）。只用于批量打开日志的路径；
   * 实时路径不经过这里。解析成功后会由 `applyParsedTasks` 用完整任务树整表替换。
   */
  onTaskSummaries?: (
    summaries: TaskSummary[],
    progress: { parsedInputs: number; totalInputs: number },
  ) => void
  /**
   * 注册「按需取任务详情」的加载器（Worker 会话提供）；换日志/解析失败时传 null。
   *
   * 界面拿到的是骨架任务，选中后调用该加载器换成完整任务（含 node_flow/识别/动作）。
   */
  setTaskDetailLoader?: (loader: ((task: TaskInfo) => Promise<TaskInfo | null>) | null) => void
  onWarning: (message: string) => void
  onError: (message: string) => void
  onFileLoadingStart?: () => void
  onFileLoadingEnd?: () => void
  selectPrimaryLogs?: (
    options: PrimaryLogSelectionOption[],
  ) => Promise<PrimaryLogSelectionOption[] | null>
}

export interface ProcessLogContentParams {
  content: string
  parseInputs?: LogParseSourceInput[]
  sortParseInputs?: boolean
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  loadedTargets?: TextSearchLoadedTarget[]
  loadedDefaultTargetId?: string
  deferredTargets?: DeferredTextSearchTarget[]
}

export interface HandleContentUploadParams {
  content: string
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  textFiles?: LoadedTextFile[]
  primaryLogFiles?: PrimaryLogFile[]
}
