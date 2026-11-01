export interface EventNotification {
  timestamp: string
  level: string
  message: string
  details: Record<string, unknown>
  _lineNumber?: number
  /** 该事件的来源文件与行号；多份输入（轮转片段 / 客户端与 agent）时用来回溯 */
  source?: EventSourceRef
  /** 写这条事件的进程（与 TaskInfo.process_id 同源） */
  process_id?: string
}

/** 一条事件/节点来自哪份输入文件（与 @windsland52/maa-log-parser 的 EventSourceRef 同形） */
export interface EventSourceRef {
  path?: string
  line?: number
  inputIndex?: number
  sourceKey?: string
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

  /**
   * 所属进程（形如 `Px1228`）。MaaFramework 的 task_id 只在进程内唯一，
   * 跨 session 复用同一个 id 时必须靠 `(process_id, task_id)` 才能精确定位任务。
   */
  process_id?: string
  /** 一次任务执行的稳定标识（作用域 id），比 (process_id, task_id) 更细 */
  task_execution_id?: string
  /** `entry` 的来源：只有 `field` 是日志原值，`node` / `scope` 是兜底推断 */
  entry_source?: 'field' | 'node' | 'scope'
  /** 是否真的收到过 `Tasker.Task.Starting`（false = 隐式补建的任务） */
  has_starting_event?: boolean
  /** 这批输入从这里开始就不完整：任务作用域由中间事件补建（日志轮转截断） */
  rotation_gap?: boolean
  /** 直到解析结束仍未等到 `Tasker.Task.Starting`：任务开头的证据确实缺失 */
  truncated_start?: boolean
}
