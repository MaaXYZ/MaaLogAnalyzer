import type { Ref } from 'vue'
import type { LoadedTextFile } from '../../../../utils/fileDialog'
import type { TaskInfo } from '../../../../types'
import type { LogParser } from '../../../../utils/logParser'
import type {
  DeferredTextSearchTarget,
  TextSearchLoadedTarget,
} from '../useTextSearchTargets'

export interface LogLoadingPipelineOptions {
  parser: LogParser
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
  clearRuntimeFilters: () => void
  onWarning: (message: string) => void
  onError: (message: string) => void
}

export interface ProcessLogContentParams {
  content: string
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
}
