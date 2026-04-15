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

// Event notification type
export interface EventNotification {
	timestamp: string
	level: string
	message: string
	details: Record<string, any>
	_lineNumber?: number
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
