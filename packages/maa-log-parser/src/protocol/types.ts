import type { WaitFreezesDetail } from '../shared/types'
import type { EventDetails } from '../shared/logEventDecoders'

export interface SourceRef {
  sourceKey: string
  sourcePath?: string
  inputIndex: number
  line: number
}

export type ProtocolPhase = 'starting' | 'succeeded' | 'failed'

export type ProtocolEventKind =
  | 'resource_loading'
  | 'controller_action'
  | 'task'
  | 'pipeline_node'
  | 'recognition_node'
  | 'action_node'
  | 'next_list'
  | 'recognition'
  | 'action'
  | 'wait_freezes'

export interface ProtocolNextListItem {
  name?: string
  anchor?: boolean
  jumpBack?: boolean
}

export interface ProtocolEventBase<TKind extends ProtocolEventKind> {
  kind: TKind
  seq: number
  ts: string
  tsMs: number
  processId: string
  threadId: string
  source: SourceRef
  rawMessage: string
  phase: ProtocolPhase
  rawDetails: EventDetails
}

export interface ResourceLoadingEvent extends ProtocolEventBase<'resource_loading'> {
  resId?: number
  path?: string
  resourceType?: string
  hash?: string
}

export interface ControllerActionEvent extends ProtocolEventBase<'controller_action'> {
  ctrlId?: number
  uuid?: string
  action?: string
  param?: EventDetails
  info?: EventDetails
}

export interface TaskEvent extends ProtocolEventBase<'task'> {
  taskId?: number
  entry?: string
  uuid?: string
  hash?: string
}

export interface PipelineNodeEvent extends ProtocolEventBase<'pipeline_node'> {
  taskId?: number
  nodeId?: number
  name?: string
  focus?: unknown
  nodeDetails?: EventDetails
  recoDetails?: EventDetails
  actionDetails?: EventDetails
}

export interface RecognitionNodeEvent extends ProtocolEventBase<'recognition_node'> {
  taskId?: number
  nodeId?: number
  recoId?: number
  name?: string
  focus?: unknown
  nodeDetails?: EventDetails
  recoDetails?: EventDetails
}

export interface ActionNodeEvent extends ProtocolEventBase<'action_node'> {
  taskId?: number
  nodeId?: number
  actionId?: number
  name?: string
  focus?: unknown
  nodeDetails?: EventDetails
  actionDetails?: EventDetails
}

export interface NextListEvent extends ProtocolEventBase<'next_list'> {
  taskId?: number
  name?: string
  list?: ProtocolNextListItem[]
  focus?: unknown
}

export interface RecognitionEvent extends ProtocolEventBase<'recognition'> {
  taskId?: number
  recoId?: number
  name?: string
  focus?: unknown
  anchor?: string
  recoDetails?: EventDetails
}

export interface ActionEvent extends ProtocolEventBase<'action'> {
  taskId?: number
  actionId?: number
  name?: string
  focus?: unknown
  actionDetails?: EventDetails
}

export interface WaitFreezesEvent extends ProtocolEventBase<'wait_freezes'> {
  taskId?: number
  wfId?: number
  name?: string
  waitPhase?: string
  roi?: [number, number, number, number]
  param?: WaitFreezesDetail['param']
  recoIds?: number[]
  elapsed?: number
  focus?: unknown
}

export type ProtocolEvent =
  | ResourceLoadingEvent
  | ControllerActionEvent
  | TaskEvent
  | PipelineNodeEvent
  | RecognitionNodeEvent
  | ActionNodeEvent
  | NextListEvent
  | RecognitionEvent
  | ActionEvent
  | WaitFreezesEvent
