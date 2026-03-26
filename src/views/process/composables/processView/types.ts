import type { TaskInfo, NodeInfo } from '../../../../types'
import type { LogParser } from '../../../../utils/logParser'
import type { LoadedTextFile } from '../../utils/fileLoadingHelpers'

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
  onUploadFile: (file: File) => void
  onUploadContent: (
    content: string,
    errorImages?: Map<string, string>,
    visionImages?: Map<string, string>,
    waitFreezesImages?: Map<string, string>,
    textFiles?: LoadedTextFile[],
  ) => void
  onSelectNode: (node: NodeInfo) => void
  onSelectAction: (node: NodeInfo) => void
  onSelectRecognition: (node: NodeInfo, attemptIndex: number) => void
  onSelectFlowItem: (node: NodeInfo, flowItemId: string) => void
  onFileLoadingStart: () => void
  onFileLoadingEnd: () => void
  onScrollDone: () => void
}
