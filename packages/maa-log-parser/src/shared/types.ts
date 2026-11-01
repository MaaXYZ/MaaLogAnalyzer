// Original log line type
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
  _lineNumber?: number
}

/**
 * 一条事件/节点来自哪份输入文件。
 *
 * 为什么要带出去：一次加载可以是多份日志（`maa.log` + `maa.bak.<时间>.log` 轮转片段，
 * 或客户端与 agent 两份来源），解析阶段每份输入都是独立的一条流，来源信息在
 * `ProtocolEvent.source` 上是齐的；但投影成 `EventNotification` / `NodeInfo` 时过去只留了
 * `_lineNumber`，下游（证据导出、界面的「这条信息在哪个文件」）无法回溯。
 * 纯加性字段：单文件解析时 `path` 通常为空，`line` 仍然可用。
 */
export interface EventSourceRef {
  /** 来源文件路径（VS Code/桌面端为真实路径；网页端选择多文件时为相对路径或文件名） */
  path?: string
  /** 来源文件内的行号（1 起） */
  line?: number
  /** 该文件在本次解析输入中的序号 */
  inputIndex?: number
  /** 解析输入的去重键；跨源镜像去重用，一般不要用于展示 */
  sourceKey?: string
}

// Event notification type
export interface EventNotification {
  timestamp: string
  level: string
  message: string
  details: Record<string, any>
  _lineNumber?: number
  /** 该事件的来源文件与行号（见 `EventSourceRef`） */
  source?: EventSourceRef
  /** 写这条事件的进程（与 `TaskInfo.process_id` 同源），事件级归属需要时不必再按时间区间推断 */
  process_id?: string
}

// Next list item
export interface NextListItem {
  name: string
  anchor: boolean
  jump_back: boolean
}

// Task info
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
  _startEventIndex?: number
  _endEventIndex?: number

  /**
   * 创建该任务的进程（形如 `Px1228`），取**起始事件**所在的进程。
   *
   * MaaFramework 的 id 分配器是进程级静态计数器，`task_id` 只在进程内唯一；解析内核内部
   * 早就按 `(processId, task_id)` 建索引（`trace/reducer.ts` 的 `buildTaskIndexKey`），
   * 但投影时把进程丢了，于是同一份日志里两个 session 复用 `task_id` 时，下游只能靠时间区间
   * 猜归属，区间重叠就无从判断。
   *
   * 注意取值来源：不能读合并后的 `payload.processId`。`finalizeScope` 会用关闭事件重写它，
   * 而 `closeScope` 在找不到自己的作用域时会 `adoptOpenTaskScope` 认领**另一进程**的打开
   * 作用域（客户端 + agent 镜像、一侧 Starting 被去重）。那种情况下 payload 记的是
   * 「谁把它关掉的」，按它定位会落到错误的执行。所以这里固定取起始事件所在进程。
   */
  process_id?: string

  /**
   * 该任务子树涉及的全部进程（升序）。镜像混搭场景下可能有多个：
   * 创建者的节点在 Px1、关闭事件来自 Px2。
   */
  process_ids?: string[]

  /**
   * 一次任务执行在**本次加载内**的唯一标识（同一次执行的节点都落在同一个作用域上）。
   *
   * 形状是作用域 id（`task:<taskId>:<localId>:seq<起始事件序号>`），其中 `seq` 是
   * **合并后事件流的全局序号**，因此它依赖两件外部事实：调用方给的输入顺序
   * （`inputIndex` 默认取数组下标）和这次到底加载了哪些文件。
   *
   * 结论：**只在单次加载内稳定**。同一份事故材料只要多带一个轮转片段，后面所有
   * `task_execution_id` 都会变 —— 不要把它当跨运行的证据主键或去重键。
   * 跨运行恒定请用 `process_id` + `task_id` + `start_time`（必要时叠加 `hash` / `uuid`）。
   */
  task_execution_id?: string

  /**
   * `entry` 是从哪来的：
   * - `field`：日志里 `Tasker.Task.Starting` 的 `entry` 字段原值（真任务名）
   * - `node`：没有 entry 字段时借用了第一个节点的名字
   * - `scope`：连节点都没有，最后退回作用域名（通常是 `task`）
   *
   * 消费者据此决定「能不能把它当任务名导出」：只有 `field` 是事实，其余是推断。
   */
  entry_source?: 'field' | 'node' | 'scope'

  /**
   * 是否真的收到过 `Tasker.Task.Starting`。
   *
   * 过去下游靠 `events.some(e => e.message === 'Tasker.Task.Starting')` 判断，是隐式契约；
   * 这里显式给出，并且 `events` 仍会保留该事件（见 docs/LOG_PARSER_ARCHITECTURE.md）。
   * 为 false 时通常是隐式补建的任务（日志从任务中间开始，或被截断）。
   */
  has_starting_event?: boolean

  /**
   * 这份日志是从任务中间开始的（轮转缺口）：任务作用域由中间事件补建而成，
   * 说明它之前还有一段日志不在这批输入里。
   *
   * 注意即使后来真正的 `Tasker.Task.Starting` 到了（例如加载了 `maa.bak.*.log` 片段），
   * 该标记仍然保留 —— 它记录的是「这批输入里任务开头不完整」这个事实。
   */
  rotation_gap?: boolean

  /**
   * 直到解析结束都没等到 `Tasker.Task.Starting`：任务开头的证据确实缺失。
   *
   * 与 `rotation_gap` 的关系：`truncated_start` 是「至今仍然缺」，
   * `rotation_gap` 是「曾经缺过（后来补上了）」。两者都为 false 表示开头完整。
   */
  truncated_start?: boolean
}

// Recognition attempt record
export interface RecognitionAttempt {
  reco_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  anchor_name?: string
  reco_details?: RecognitionDetail
  nested_nodes?: RecognitionAttempt[]
  error_image?: string
  vision_image?: string
}

// Nested action group (child tasks produced by custom action)
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

// Nested action node (nodes inside child tasks)
export interface NestedActionNode {
  node_id: number
  name: string
  ts: string
  end_ts?: string
  status: 'success' | 'failed' | 'running'
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  next_list?: NextListItem[]
  node_flow?: UnifiedFlowItem[]
  recognitions?: RecognitionAttempt[]
  child_tasks?: NestedActionGroup[]
}

// Node info
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
  next_list: NextListItem[]
  node_flow?: UnifiedFlowItem[]
  node_details?: {
    action_id: number
    completed: boolean
    name: string
    node_id: number
    reco_id: number
  }
  error_image?: string
  /** 该节点（首次出现那条事件）来自哪份输入文件；见 `EventSourceRef` */
  source?: EventSourceRef
}

// Recognition detail
export interface RecognitionDetail {
  reco_id: number
  algorithm: string
  box: [number, number, number, number] | null
  detail: any
  name: string
}

// Merged recognition item shared by NodeCard subcomponents
export interface MergedRecognitionItem {
  name: string
  status: 'success' | 'failed' | 'running' | 'not-recognized'
  isRoundSeparator?: boolean
  roundIndex?: number
  attemptIndex?: number
  attempt?: RecognitionAttempt
}

// Action detail
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
  focus?: any
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
  status: 'success' | 'failed' | 'running'
  ts: string
  end_ts?: string
  anchor_name?: string
  task_id?: number
  node_id?: number
  reco_id?: number
  action_id?: number
  focus?: any
  task_details?: NestedActionGroup['task_details']
  reco_details?: RecognitionDetail
  action_details?: ActionDetail
  resource_loading_details?: ResourceLoadingDetail
  wait_freezes_details?: WaitFreezesDetail
  error_image?: string
  vision_image?: string
  children?: UnifiedFlowItem[]
}

export interface UnifiedFlowGroup {
  type: UnifiedFlowType
  title: string
  items: UnifiedFlowItem[]
}
