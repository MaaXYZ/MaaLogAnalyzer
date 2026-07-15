import type { Ref } from 'vue'
import type { LoadedTextFile } from '../../../../utils/fileDialog'
import type { LoadedPrimaryLogFile, PrimaryLogSelectionOption } from '../../../../utils/logFileDiscovery'
import type { TaskInfo } from '../../../../types'
import type { LogParser, ParseSourceInput } from '@windsland52/maa-log-parser'
import type {
  DeferredTextSearchTarget,
  TextSearchLoadedTarget,
} from '../useTextSearchTargets'

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
  onWarning: (message: string) => void
  onError: (message: string) => void
  onFileLoadingStart?: () => void
  onFileLoadingEnd?: () => void
  selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>
}

export interface ProcessLogContentParams {
  content: string
  parseInputs?: ParseSourceInput[]
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
  primaryLogFiles?: LoadedPrimaryLogFile[]
}
