import type { LogParser } from '../../../utils/logParser'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { LoadedTextFile } from '../../process/utils/fileLoadingHelpers'
import type { BridgeOpenCropRequest } from '../composables/useBridgeTaskActions'

export interface LoadedSearchTarget {
  id: string
  label: string
  fileName: string
  content: string
}

export type UploadFileHandler = (file: File) => void | Promise<void>
export type UploadContentHandler = (
  content: string,
  errorImages?: Map<string, string>,
  visionImages?: Map<string, string>,
  waitFreezesImages?: Map<string, string>,
  textFiles?: LoadedTextFile[],
) => void | Promise<void>

export interface ProcessViewForwardProps {
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  onExpandDetailView?: () => void
  isMobile?: boolean
  pendingScrollNodeId?: number | null
  isRealtimeStreaming?: boolean
  showRealtimeStatus?: boolean
  showReloadControls?: boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
}

export interface ProcessViewEventHandlers {
  'select-task': (task: TaskInfo) => void
  'upload-file': UploadFileHandler
  'upload-content': UploadContentHandler
  'select-node': (node: NodeInfo) => void
  'select-action': (node: NodeInfo) => void
  'select-recognition': (node: NodeInfo, attemptIndex: number) => void
  'select-flow-item': (node: NodeInfo, flowItemId: string) => void
  'file-loading-start': () => void
  'file-loading-end': () => void
  'open-task-drawer': () => void
  'scroll-done': () => void
}

export interface DetailViewForwardProps {
  selectedNode: NodeInfo | null
  selectedFlowItemId: string | null
  bridgeRecognitionImages: {
    raw: string | null
    draws: string[]
  } | null
  bridgeRecognitionImageRefs: {
    raw: number | null
    draws: number[]
  } | null
  bridgeRecognitionLoading: boolean
  bridgeRecognitionError: string | null
  isVscodeLaunchEmbed: boolean
  bridgeNodeDefinition: string | null
  bridgeNodeDefinitionLoading: boolean
  bridgeNodeDefinitionError: string | null
  bridgeOpenCrop: ((request: BridgeOpenCropRequest) => Promise<void>) | null
}

export interface TextSearchViewForwardProps {
  isDark: boolean
  loadedTargets: LoadedSearchTarget[]
  loadedDefaultTargetId: string
  hasDeferredLoadedTargets: boolean
  ensureLoadedTargets: (() => Promise<void>) | undefined
}
