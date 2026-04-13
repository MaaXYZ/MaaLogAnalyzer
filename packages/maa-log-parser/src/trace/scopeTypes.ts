export type ScopeKind =
  | 'trace_root'
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

export type ScopeStatus = 'running' | 'succeeded' | 'failed'

export interface ScopeNode<TPayload = unknown> {
  id: string
  kind: ScopeKind
  status: ScopeStatus
  ts: string
  endTs?: string
  seq: number
  endSeq?: number
  taskId?: number
  payload: TPayload
  children: ScopeNode[]
}
