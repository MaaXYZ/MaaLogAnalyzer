import type { TaskInfo, NodeInfo } from '../../../../types'
import type { LogParser } from '@windsland52/maa-log-parser'
import type { LoadedTextFile } from '../../utils/fileLoadingHelpers'
import type { LoadedPrimaryLogFile, PrimaryLogSelectionOption } from '../../../../utils/logFileDiscovery'

export type ProcessViewControllerProps = Readonly<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  isMobile?: boolean
  pendingScrollNodeId?: number | null
  isRealtimeStreaming?: boolean
  showRealtimeStatus?: boolean
  showReloadControls?: boolean
}>

export interface ProcessViewControllerEmitters {
  onSelectTask: (task: TaskInfo) => void
  onUploadFile: (
    file: File | File[],
    selectPrimaryLogs?: (options: PrimaryLogSelectionOption[]) => Promise<PrimaryLogSelectionOption[] | null>,
  ) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
    primaryLogFiles?: LoadedPrimaryLogFile[],
  ) => void
  onSelectNode: (node: NodeInfo) => void
  onSelectAction: (node: NodeInfo) => void
  onSelectRecognition: (node: NodeInfo, attemptIndex: number) => void
  onSelectFlowItem: (node: NodeInfo, flowItemId: string) => void
  onFileLoadingStart: () => void
  onFileLoadingEnd: () => void
  onScrollDone: () => void
}
