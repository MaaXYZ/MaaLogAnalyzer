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
  status?: 'enter' | 'leave'
  duration?: number
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
}

// 识别尝试记录
export interface RecognitionAttempt {
  reco_id: number
  name: string
  timestamp: string
  status: 'success' | 'failed'
  reco_details?: RecognitionDetail
  nested_nodes?: RecognitionAttempt[]  // 嵌套的 RecognitionNode 事件
}

// 节点信息
export interface NodeInfo {
  node_id: number
  name: string
  timestamp: string
  status: 'success' | 'failed'
  task_id: number
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  focus?: any
  next_list: NextListItem[]  // Next 列表
  recognition_attempts: RecognitionAttempt[]  // 识别尝试历史（包括失败的）
  node_details?: {
    action_id: number
    completed: boolean
    name: string
    node_id: number
    reco_id: number
  }
}

// 识别详情
export interface RecognitionDetail {
  reco_id: number
  algorithm: string
  box: [number, number, number, number] | null
  detail: any
  name: string
}

// 动作详情
export interface ActionDetail {
  action_id: number
  action: string
  box: [number, number, number, number]
  detail: any
  name: string
  success: boolean
}

// 合并后的操作信息（识别 + 动作）
export interface OperationInfo {
  index: number
  name: string
  status: 'success' | 'warning' | 'error'
  recognition?: RecognitionDetail | null
  action?: ActionDetail | null
}

// 统计信息
export interface Statistics {
  totalLines: number
  totalEvents: number
  logLevels: Record<string, number>
  eventTypes: Record<string, number>
  tasks: number
  nodes: number
  timeRange: {
    start: string
    end: string
  }
}