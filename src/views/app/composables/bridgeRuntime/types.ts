import type { Ref } from 'vue'
import type { NodeInfo, TaskInfo, UnifiedFlowItem } from '../../../../types'
import type { LogParser } from '../../../../utils/logParser'
import type { RealtimeSessionState } from '../useRealtimeSession'

export interface UseBridgeRuntimeOptions {
  bridgeEnabled: boolean
  appEmbedMode: string
  isVscodeLaunchEmbed: boolean
  bridgeThemeUpdatedEvent: string
  shouldMaintainRealtimeTextTargets: boolean
  parseIntervalMs: number
  snapshotTimeoutMs: number
  snapshotMaxBatchSize: number
  parser: LogParser
  textSearchLoadedDefaultTargetId: Ref<string>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  asRecord: (value: unknown) => Record<string, unknown> | null
  toFiniteNumber: (value: unknown, fallback: number) => number
  toPositiveInteger: (value: unknown) => number | null
  toTrimmedNonEmptyString: (value: unknown) => string | null
  getErrorMessage: (error: unknown) => string
  buildNodeFlowItems: (node: NodeInfo) => UnifiedFlowItem[]
  flattenFlowItems: (items: UnifiedFlowItem[] | undefined, output?: UnifiedFlowItem[]) => UnifiedFlowItem[]
  applyParsedTasks: (tasks: TaskInfo[], preserveSelection: boolean) => void
  syncRealtimeLoadedTarget: (session: RealtimeSessionState) => void
  onSessionReset: () => void
  onRealtimeStartReset: () => void
}
