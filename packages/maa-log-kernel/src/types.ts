export interface EventNotification {
  timestamp: string
  level: string
  message: string
  details: Record<string, unknown>
  _lineNumber?: number
}

export interface NextListItem {
  name: string
  anchor: boolean
  jump_back: boolean
}

export type RuntimeStatus = 'success' | 'failed' | 'running'

export interface RecognitionDetail {
  reco_id: number
  algorithm: string
  box: [number, number, number, number] | null
  detail: unknown
  name: string
}

export interface ActionDetail {
  action_id: number
  action: string
  box: [number, number, number, number]
  detail: unknown
  name: string
  success: boolean
  ts?: string
  end_ts?: string
}

export interface ResourceLoadingDetail {
  res_id: number
  path?: string
  resource_type?: string
  hash?: string
}

export interface WaitFreezesDetail {
  wf_id: number
  phase?: string
  elapsed?: number
  reco_ids?: number[]
  roi?: [number, number, number, number]
  param?: {
    method?: number
    rate_limit?: number
    threshold?: number
    time?: number
    timeout?: number
  }
  focus?: unknown
  images?: string[]
}

export type UnifiedFlowType =
  | 'task'
  | 'pipeline_node'
  | 'resource_loading'
  | 'recognition'
  | 'recognition_node'
  | 'wait_freezes'
  | 'action'
  | 'action_node'

export interface UnifiedFlowItem {
  id: string
  type: UnifiedFlowType
  name: string
  status: RuntimeStatus
  ts: string
  end_ts?: string
  anchor_name?: string
  task_id?: number
  node_id?: number
  reco_id?: number
  action_id?: number
  focus?: unknown
  task_details?: {
    task_id: number
    entry?: string
    hash?: string
    uuid?: string
    status: 'running' | 'succeeded' | 'failed'
    ts?: string
    end_ts?: string
    start_message?: string
    end_message?: string
    start_details?: Record<string, unknown>
    end_details?: Record<string, unknown>
  }
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  resource_loading_details?: ResourceLoadingDetail
  wait_freezes_details?: WaitFreezesDetail
  error_image?: string
  vision_image?: string
  children?: UnifiedFlowItem[]
}

export interface RecognitionAttempt {
  reco_id: number
  name: string
  ts: string
  end_ts?: string
  status: RuntimeStatus
  anchor_name?: string
  reco_details?: RecognitionDetail
  nested_nodes?: RecognitionAttempt[]
  error_image?: string
  vision_image?: string
}

export interface NodeInfo {
  node_id: number
  name: string
  ts: string
  end_ts?: string
  status: RuntimeStatus
  task_id: number
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  focus?: unknown
  next_list: NextListItem[]
  node_flow?: UnifiedFlowItem[]
  recognitions?: RecognitionAttempt[]
  error_image?: string
}

export interface TaskInfo {
  task_id: number
  entry: string
  hash: string
  uuid: string
  start_time: string
  end_time?: string
  status: 'running' | 'succeeded' | 'failed'
  nodes: NodeInfo[]
  events: EventNotification[]
  duration?: number
}
