// 原始日志行类型
export interface LogLine {
  timestamp: string
  level: 'DBG' | 'INF' | 'TRC' | 'WRN' | 'ERR'
  processId: string
  threadId: string
  sourceFile?: string
  lineNumber?: string
  functionName?: string
  message: string
  params: Record<string, any>
  _lineNumber?: number  // 文件中的行号
}

// 事件通知类型
export interface EventNotification {
  timestamp: string
  level: string
  message: string  // 如 Tasker.Task.Starting, Node.PipelineNode.Succeeded
  details: Record<string, any>
  _lineNumber?: number
}

// Next 列表项
export interface NextListItem {
  name: string
  anchor: boolean
  jump_back: boolean
}

// 任务信息
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
  _startEventIndex?: number  // 任务开始事件的索引（内部使用）
  _endEventIndex?: number    // 任务结束事件的索引（内部使用）
}

// 识别尝试记录
export interface RecognitionAttempt {
  reco_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  reco_details?: RecognitionDetail
  nested_nodes?: RecognitionAttempt[]
  error_image?: string
  vision_image?: string
}

// 嵌套动作节点组（custom action 产生的子任务）
export interface NestedActionGroup {
  task_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  nested_actions: NestedActionNode[]
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
    start_details?: Record<string, any>
    end_details?: Record<string, any>
  }
}

// 嵌套动作节点（子任务中的节点）
export interface NestedActionNode {
  node_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  recognitions?: RecognitionAttempt[]
}

// 节点信息
export interface NodeInfo {
  node_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  task_id: number
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  focus?: any
  next_list: NextListItem[]  // Next 列表
  node_flow?: UnifiedFlowItem[]  // 统一节点流（recognition 在前，action 在后）
  node_details?: {
    action_id: number
    completed: boolean
    name: string
    node_id: number
    reco_id: number
  }
  error_image?: string  // 节点截图路径
  wait_freezes_images?: string[]  // action wait_freezes 调试截图
}

// 识别详情
export interface RecognitionDetail {
  reco_id: number
  algorithm: string
  box: [number, number, number, number] | null
  detail: any
  name: string
}

// 合并后的识别项（供 NodeCard 子组件共用）
export interface MergedRecognitionItem {
  name: string
  status: 'success' | 'failed' | 'running' | 'not-recognized'
  isRoundSeparator?: boolean
  roundIndex?: number
  attemptIndex?: number  // 在 recognition flow 中的索引
  attempt?: RecognitionAttempt  // 原始 attempt 对象
  hasNestedNodes?: boolean
}

// 动作详情
export interface ActionDetail {
  action_id: number
  action: string
  box: [number, number, number, number]
  detail: any
  name: string
  success: boolean
  ts?: string
  end_ts?: string
}

export type UnifiedFlowType =
  | 'task'
  | 'pipeline_node'
  | 'recognition'
  | 'recognition_node'
  | 'action'
  | 'action_node'

export interface UnifiedFlowItem {
  id: string
  type: UnifiedFlowType
  name: string
  status: 'success' | 'failed' | 'running'
  ts: string
  end_ts?: string
  task_id?: number
  node_id?: number
  reco_id?: number
  action_id?: number
  task_details?: NestedActionGroup['task_details']
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  error_image?: string
  vision_image?: string
  children?: UnifiedFlowItem[]
}

export interface UnifiedFlowGroup {
  type: UnifiedFlowType
  title: string
  items: UnifiedFlowItem[]
}
