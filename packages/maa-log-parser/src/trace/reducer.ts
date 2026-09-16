import type {
  ActionEvent,
  ActionNodeEvent,
  ControllerActionEvent,
  NextListEvent,
  PipelineNodeEvent,
  ProtocolEvent,
  RecognitionEvent,
  RecognitionNodeEvent,
  ResourceLoadingEvent,
  TaskEvent,
  WaitFreezesEvent,
} from '../protocol/types'
import { createScopeId } from './scopeId'
import type { ScopeKind, ScopeNode, ScopeStatus } from './scopeTypes'

export interface TraceScopePayload extends Record<string, unknown> {
  startEvent: ProtocolEvent
  latestEvent: ProtocolEvent
  endEvent?: ProtocolEvent
}

type TraceScopeNode = ScopeNode<TraceScopePayload>
type TraceRootNode = ScopeNode<Record<string, never>>

interface ReducerState {
  root: TraceRootNode
  openScopes: TraceScopeNode[]
  openScopeStacksByKey: Map<string, TraceScopeNode[]>
  openTaskScopesByTaskId: Map<string, TraceScopeNode[]>
  openPipelineScopesByTaskId: Map<string, TraceScopeNode[]>
  openNextListScopesByTaskId: Map<string, TraceScopeNode[]>
}

const BUSINESS_SCOPE_KINDS = new Set<ScopeKind>([
  'task',
  'pipeline_node',
  'recognition_node',
  'action_node',
  'next_list',
  'recognition',
  'action',
  'wait_freezes',
])

const isBusinessScope = (kind: ScopeKind): boolean => BUSINESS_SCOPE_KINDS.has(kind)

const matchesScopeSource = (scope: TraceScopeNode, event: ProtocolEvent): boolean => {
  const payload = scope.payload as Record<string, unknown>
  return payload.processId === event.processId && payload.threadId === event.threadId
}

const matchesScopeProcess = (scope: TraceScopeNode, processId: string): boolean => {
  const payload = scope.payload as Record<string, unknown>
  return payload.processId === processId
}

/**
 * 按 taskId 索引的三个作用域栈（task / pipeline / next_list）的键，形如 `Px1|200000001`。
 *
 * 不能直接用裸 `taskId`：MaaFramework 的 task_id 是进程级计数器（见 buildScopeKey 的说明），
 * 两个实例同时写同一份日志时会拿到同一个 task_id。用裸 taskId 会导致两个会话共用一条栈，
 * 「后开的任务」和「先开的任务的终止事件」互相顶掉，最终两个任务的节点互相错挂。
 *
 * 注意与 `buildTaskScopeKey` 区分：那个是作用域自身的键（`Px1|task:200000001`），
 * 用于 `openScopeStacksByKey`。
 */
const buildTaskIndexKey = (processId: string, taskId: number): string => `${processId}|${taskId}`

const pushMapStack = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const current = map.get(key)
  if (current) {
    current.push(value)
    return
  }
  map.set(key, [value])
}

const peekMapStack = <K, V>(map: Map<K, V[]>, key: K): V | null => {
  const current = map.get(key)
  if (!current || current.length === 0) return null
  return current[current.length - 1] ?? null
}

const removeMapStackValue = <K, V>(map: Map<K, V[]>, key: K, value: V): void => {
  const current = map.get(key)
  if (!current || current.length === 0) return
  const index = current.lastIndexOf(value)
  if (index < 0) return
  current.splice(index, 1)
  if (current.length === 0) {
    map.delete(key)
  }
}

const removeOpenScope = (state: ReducerState, scope: TraceScopeNode): void => {
  const index = state.openScopes.lastIndexOf(scope)
  if (index >= 0) {
    state.openScopes.splice(index, 1)
  }
}

const toScopeStatus = (phase: ProtocolEvent['phase']): ScopeStatus => {
  switch (phase) {
    case 'starting':
      return 'running'
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
  }
}

const readTaskId = (
  event:
    | TaskEvent
    | PipelineNodeEvent
    | RecognitionNodeEvent
    | ActionNodeEvent
    | NextListEvent
    | RecognitionEvent
    | ActionEvent
    | WaitFreezesEvent
    | ControllerActionEvent
    | ResourceLoadingEvent,
): number | undefined => ('taskId' in event ? event.taskId : undefined)

const mergeDefinedFields = (
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> => {
  const merged = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) {
      merged[key] = value
    }
  }
  return merged
}

const buildScopePayload = (
  event: ProtocolEvent,
  existing?: TraceScopePayload,
  endEvent?: ProtocolEvent,
): TraceScopePayload => {
  const merged = mergeDefinedFields(
    (existing ?? {}) as Record<string, unknown>,
    event as unknown as Record<string, unknown>,
  )

  return {
    ...merged,
    startEvent: existing?.startEvent ?? event,
    latestEvent: event,
    endEvent: endEvent ?? existing?.endEvent,
  } as TraceScopePayload
}

/** 任务作用域自身的键（`openScopeStacksByKey` 用），与 `buildScopeKey` 的 'task' 分支一致。 */
const buildTaskScopeKey = (processId: string, taskId: number): string =>
  `${processId}|task:${taskId}`

const buildScopeKey = (event: ProtocolEvent): string | null => {
  // MaaFramework 的 id 分配器都是**进程级**静态计数器
  // （MaaFramework/source/MaaFramework/Task/TaskBase.h 的 `s_global_task_id`、
  // source/include/Common/Conf.h 的 kTaskIdBase / kNodeIdBase / kRecoIdBase …），
  // 只在单个进程内唯一：进程重启后从基数重新开始，多个实例同时写同一份日志时还会并发撞号。
  // 所以作用域身份必须带上 processId —— 与 MaaFramework 自身的任务身份「(进程, task_id)」对齐。
  const source = event.processId
  switch (event.kind) {
    case 'resource_loading':
      return event.resId != null ? `${source}|resource:${event.resId}` : null
    case 'controller_action':
      return event.ctrlId != null ? `${source}|controller:${event.ctrlId}` : null
    case 'task':
      return event.taskId != null ? buildTaskScopeKey(source, event.taskId) : null
    case 'pipeline_node':
      return event.taskId != null && event.nodeId != null
        ? `${source}|task:${event.taskId}:pipeline:${event.nodeId}`
        : null
    case 'recognition_node':
      return event.taskId != null && event.nodeId != null
        ? `${source}|task:${event.taskId}:recognition-node:${event.nodeId}`
        : null
    case 'action_node':
      return event.taskId != null && event.nodeId != null
        ? `${source}|task:${event.taskId}:action-node:${event.nodeId}`
        : null
    case 'recognition':
      return event.taskId != null && event.recoId != null
        ? `${source}|task:${event.taskId}:recognition:${event.recoId}`
        : null
    case 'action':
      return event.taskId != null && event.actionId != null
        ? `${source}|task:${event.taskId}:action:${event.actionId}`
        : null
    case 'wait_freezes':
      return event.taskId != null && event.wfId != null
        ? `${source}|task:${event.taskId}:wait_freezes:${event.wfId}`
        : null
    case 'next_list':
      return null
  }
}

const attachChild = (parent: TraceRootNode | TraceScopeNode, child: TraceScopeNode): void => {
  parent.children.push(child)
}

const createRootNode = (events: ProtocolEvent[]): TraceRootNode => ({
  id: createScopeId('trace_root', {}, 0),
  kind: 'trace_root',
  status: 'running',
  ts: events[0]?.ts ?? '',
  endTs: events.length > 0 ? events[events.length - 1]?.ts : undefined,
  seq: 0,
  endSeq: events.length > 0 ? events[events.length - 1]?.seq : undefined,
  payload: {},
  children: [],
})

const findNearestOpenBusinessScope = (
  state: ReducerState,
  options: {
    taskId?: number
    processId?: string
    event?: ProtocolEvent
  } = {},
): TraceScopeNode | null => {
  for (let index = state.openScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.openScopes[index]
    if (!isBusinessScope(scope.kind)) continue
    if (options.taskId != null && scope.taskId !== options.taskId) continue
    if (options.processId != null && !matchesScopeProcess(scope, options.processId)) continue
    if (options.event && !matchesScopeSource(scope, options.event)) continue
    return scope
  }
  return null
}

const findNearestOpenNonNextListBusinessScopeBySource = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceScopeNode | null => {
  for (let index = state.openScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.openScopes[index]
    if (!isBusinessScope(scope.kind) || scope.kind === 'next_list') continue
    if (!matchesScopeSource(scope, event)) continue
    return scope
  }
  return null
}

const resolveWaitFreezesParentScope = (
  state: ReducerState,
  event: WaitFreezesEvent,
): TraceRootNode | TraceScopeNode => {
  const taskId = event.taskId
  const sameSourceScope = findNearestOpenBusinessScope(state, { event })
  if (
    sameSourceScope &&
    taskId != null &&
    sameSourceScope.taskId != null &&
    sameSourceScope.taskId !== taskId
  ) {
    if (sameSourceScope.kind !== 'next_list') {
      return sameSourceScope
    }

    const sameSourceForeignScope = findNearestOpenNonNextListBusinessScopeBySource(state, event)
    if (
      sameSourceForeignScope &&
      sameSourceForeignScope.taskId != null &&
      sameSourceForeignScope.taskId !== taskId
    ) {
      return sameSourceForeignScope
    }
  }

  if (taskId != null) {
    return (
      findNearestOpenBusinessScope(state, { taskId, processId: event.processId }) ??
      peekMapStack(state.openTaskScopesByTaskId, buildTaskIndexKey(event.processId, taskId)) ??
      state.root
    )
  }

  return state.root
}

const resolveParentScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceRootNode | TraceScopeNode => {
  const taskId = readTaskId(event)
  const taskScopeKey = taskId != null ? buildTaskIndexKey(event.processId, taskId) : null

  switch (event.kind) {
    case 'resource_loading':
      return findNearestOpenBusinessScope(state, { event }) ?? state.root
    case 'controller_action':
      return findNearestOpenBusinessScope(state, { event }) ?? state.root
    case 'task':
      return findNearestOpenBusinessScope(state, { event }) ?? state.root
    case 'pipeline_node':
      return taskScopeKey != null
        ? (peekMapStack(state.openTaskScopesByTaskId, taskScopeKey) ??
            findNearestOpenBusinessScope(state, { event }) ??
            state.root)
        : state.root
    case 'next_list':
      return taskScopeKey != null
        ? (peekMapStack(state.openPipelineScopesByTaskId, taskScopeKey) ??
            peekMapStack(state.openTaskScopesByTaskId, taskScopeKey) ??
            findNearestOpenBusinessScope(state, { event }) ??
            state.root)
        : state.root
    case 'recognition':
      return taskScopeKey != null
        ? (peekMapStack(state.openNextListScopesByTaskId, taskScopeKey) ??
            findNearestOpenBusinessScope(state, { taskId, processId: event.processId }) ??
            peekMapStack(state.openTaskScopesByTaskId, taskScopeKey) ??
            state.root)
        : state.root
    case 'action':
    case 'recognition_node':
    case 'action_node':
      return taskScopeKey != null
        ? (findNearestOpenBusinessScope(state, { taskId, processId: event.processId }) ??
            peekMapStack(state.openTaskScopesByTaskId, taskScopeKey) ??
            findNearestOpenBusinessScope(state, { event }) ??
            state.root)
        : state.root
    case 'wait_freezes':
      return resolveWaitFreezesParentScope(state, event)
  }
}

const createScopeNode = (event: ProtocolEvent): TraceScopeNode => ({
  id: createScopeId(event.kind, event, event.seq, readTaskId(event)),
  kind: event.kind,
  status: toScopeStatus(event.phase),
  ts: event.ts,
  endTs: event.phase === 'starting' ? undefined : event.ts,
  seq: event.seq,
  endSeq: event.phase === 'starting' ? undefined : event.seq,
  taskId: readTaskId(event),
  payload: buildScopePayload(event, undefined, event.phase === 'starting' ? undefined : event),
  children: [],
})

/**
 * 为「没有 `Tasker.Task.Starting` 的任务」补建任务作用域。
 *
 * MaaFramework 在**跑任务途中**日志超过 16MiB 就会轮转（`Logger::flush()` → `rotate()` → 截断重开），
 * 所以 `maa.log` 天然可能从任务中间开始：里面有节点事件和 `Tasker.Task.Succeeded`，
 * 却没有对应的 `Tasker.Task.Starting`（它在 `maa.bak.<时间>.log` 里）。用户只打开主日志、
 * 或在浏览器端打开单个文件时，这些节点原本会全部掉到 trace 根节点上，界面上只剩一个 0 节点的空任务。
 *
 * 这里按事件的 `task_id` 补建任务作用域，节点就仍归到任务下；之后真正的终止事件会正常关闭它
 * （键与 `Tasker.Task.Starting` 建立的作用域完全一致），因此日志完整时不会有任何行为变化。
 */
const createImplicitTaskScope = (
  state: ReducerState,
  event: ProtocolEvent,
  taskId: number,
): TraceScopeNode => {
  const scope: TraceScopeNode = {
    id: createScopeId('task', event, event.seq, taskId),
    kind: 'task',
    status: 'running',
    ts: event.ts,
    seq: event.seq,
    taskId,
    // 只放身份字段。**不能**把触发它的 pipeline_node 事件整个铺进来：那样任务上会带上
    // `name` / `nodeId` / `kind: 'pipeline_node'`，而 `readScopeName` 优先读 `payload.name`，
    // 任务名会变成节点名（`TaskInfo.entry` 不受影响，但 evidence / query 会用错）。
    payload: {
      processId: event.processId,
      threadId: event.threadId,
      taskId,
      startEvent: event,
      latestEvent: event,
      implicitTask: true,
    },
    children: [],
  }
  attachChild(state.root, scope)
  state.openScopes.push(scope)
  pushMapStack(state.openScopeStacksByKey, buildTaskScopeKey(event.processId, taskId), scope)
  pushMapStack(state.openTaskScopesByTaskId, buildTaskIndexKey(event.processId, taskId), scope)
  return scope
}

/** 挂到某个任务下面的那些 kind —— 它们的事件都带 `task_id`。 */
const TASK_CHILD_KINDS = new Set<ScopeKind>([
  'pipeline_node',
  'recognition_node',
  'action_node',
  'next_list',
  'recognition',
  'action',
  'wait_freezes',
])

/** 找一个仍打开、且 `taskId` 相同的任务作用域（不限进程）。 */
const findOpenTaskScopeByTaskId = (state: ReducerState, taskId: number): TraceScopeNode | null => {
  for (let index = state.openScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.openScopes[index]
    if (scope.kind === 'task' && scope.taskId === taskId) return scope
  }
  return null
}

/**
 * 与 `resolveParentScope` 相同，但补上两道兜底，避免节点与任务脱钩（会掉到 trace 根节点上）：
 *
 * 1. **认领同 `taskId` 的已打开任务。** 客户端 + agent 两份来源镜像写出时，去重是"谁先出现谁留下"，
 *    于是可能出现「一侧的 `Tasker.Task.Starting` 留下、另一侧的节点事件留下」的混搭，
 *    后者按 `(processId, taskId)` 找不到自己的作用域。此时认领同 taskId 的任务 ——
 *    并发两个实例时各自的 scope 都在，正常路径已命中，不会走到这里。
 * 2. **补建任务作用域。** MaaFramework 在**跑任务途中**日志超过 16MiB 就轮转
 *    （`Logger::flush()` → `rotate()` → 截断重开），所以 `maa.log` 天然可能从任务中间开始：
 *    有节点事件和 `Tasker.Task.Succeeded`，却没有 `Tasker.Task.Starting`（在 `maa.bak.*.log` 里）。
 *    补建的作用域键与 `Tasker.Task.Starting` 建立的完全一致，真正的 Starting 到了会就地转正
 *    （见 `openScope`），因此日志完整时行为不变；payload 上打 `implicitTask: true` 供上层区分。
 *    只有 `pipeline_node` 能确定「这个事件属于这个任务」，其余 kind 在完整日志里都挂在某个
 *    pipeline_node 之下，片段开头先出现它们时无从判断，宁可保持挂到根上。
 */
const resolveOrCreateParent = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceRootNode | TraceScopeNode => {
  const parent = resolveParentScope(state, event)
  if (parent !== state.root) return parent
  const taskId = readTaskId(event)
  if (taskId == null || !TASK_CHILD_KINDS.has(event.kind)) return parent

  const adopted = findOpenTaskScopeByTaskId(state, taskId)
  if (adopted) return adopted

  return event.kind === 'pipeline_node' ? createImplicitTaskScope(state, event, taskId) : parent
}

const openScope = (state: ReducerState, event: ProtocolEvent): TraceScopeNode => {
  // 规则三（docs/LOG_PARSER_ARCHITECTURE.md §5.4）：相同 key 的二次 Starting 属于业务语义重复，
  // 不能在作用域层按 key 复用来抹掉。
  //
  // 跨源镜像（§5.3）是写入层现象，延迟在毫秒级，已由输入层的 CROSS_SOURCE_DUPLICATE_WINDOW_MS
  // 去重处理；这里再按 key 复用等于把去重窗口放大到「无限大」，一旦上一轮进程被杀掉、作用域没有
  // 收到终止事件（作用域一直 open），后续会话里同 key 的 Starting 就会被悄悄焊进上一轮的作用域，
  // 把同一份日志里多次运行的节点拼成一个任务。
  const scopeKey = buildScopeKey(event)
  if (scopeKey) {
    const provisional = peekMapStack(state.openScopeStacksByKey, scopeKey)
    // 隐式任务作用域是「补建」的。真正的 Tasker.Task.Starting 到了就地转正，不要再叠一层 ——
    // 否则同一个 task_id 会出现两个任务，而且隐式那个永远收不到终止事件（一直是 running）。
    // 起始时间保留更早的那个（隐式作用域先看到节点），节点时间线才不会倒挂。
    if (provisional && provisional.payload.implicitTask === true) {
      // 用真身 Starting 的字段**重建** payload，而不是 merge 进旧 payload ——
      // 旧 payload 里的 `name` / `nodeId` 是补建时借来的，merge 不会把它们清掉。
      // `implicitTask` 就此消失：该标记的含义就是「还没见过真正的 Tasker.Task.Starting」。
      // 起始时间保留更早的那个（补建的作用域先看到节点），节点时间线才不会倒挂。
      provisional.payload = {
        ...buildScopePayload(event),
        startEvent: provisional.payload.startEvent,
      } as TraceScopePayload
      return provisional
    }
  }

  const scope = createScopeNode(event)
  const parent = resolveOrCreateParent(state, event)
  attachChild(parent, scope)
  state.openScopes.push(scope)

  if (scopeKey) {
    pushMapStack(state.openScopeStacksByKey, scopeKey, scope)
  }

  const taskId = scope.taskId
  const taskScopeKey = taskId != null ? buildTaskIndexKey(event.processId, taskId) : null
  switch (scope.kind) {
    case 'task':
      if (taskScopeKey != null) {
        pushMapStack(state.openTaskScopesByTaskId, taskScopeKey, scope)
      }
      break
    case 'pipeline_node':
      if (taskScopeKey != null) {
        pushMapStack(state.openPipelineScopesByTaskId, taskScopeKey, scope)
      }
      break
    case 'next_list':
      if (taskScopeKey != null) {
        pushMapStack(state.openNextListScopesByTaskId, taskScopeKey, scope)
      }
      break
    default:
      break
  }

  return scope
}

const finalizeScope = (
  state: ReducerState,
  scope: TraceScopeNode,
  event: ProtocolEvent,
): TraceScopeNode => {
  scope.status = toScopeStatus(event.phase)
  scope.endTs = event.ts
  scope.endSeq = event.seq
  scope.payload = buildScopePayload(event, scope.payload, event)

  removeOpenScope(state, scope)

  const scopeKey = buildScopeKey(event)
  if (scopeKey) {
    removeMapStackValue(state.openScopeStacksByKey, scopeKey, scope)
  }

  const taskId = scope.taskId
  const taskScopeKey = taskId != null ? buildTaskIndexKey(event.processId, taskId) : null
  switch (scope.kind) {
    case 'task':
      if (taskScopeKey != null) {
        removeMapStackValue(state.openTaskScopesByTaskId, taskScopeKey, scope)
      }
      break
    case 'pipeline_node':
      if (taskScopeKey != null) {
        removeMapStackValue(state.openPipelineScopesByTaskId, taskScopeKey, scope)
      }
      break
    case 'next_list':
      if (taskScopeKey != null) {
        removeMapStackValue(state.openNextListScopesByTaskId, taskScopeKey, scope)
      }
      break
    default:
      break
  }

  return scope
}

/** 把 scope 从所有索引里摘掉，不依赖事件推导出的 key。 */
const detachScopeFromIndexes = (state: ReducerState, scope: TraceScopeNode): void => {
  const stacks = [
    state.openScopeStacksByKey,
    state.openTaskScopesByTaskId,
    state.openPipelineScopesByTaskId,
    state.openNextListScopesByTaskId,
  ]
  for (const stackMap of stacks) {
    for (const [key, stack] of stackMap) {
      const index = stack.lastIndexOf(scope)
      if (index < 0) continue
      stack.splice(index, 1)
      if (stack.length === 0) stackMap.delete(key)
    }
  }
}

/**
 * 客户端 + agent 两份日志一起加载时，先到的那份文件的 `Tasker.Task.Starting` 会被当成镜像去重掉，
 * 于是这一侧的终止事件就找不到自己的 scope。此时认领同 `taskId` 的那个**仍在打开**的任务作用域：
 * task_id 在单个进程内唯一，跨进程同号只可能是同一次运行的镜像，或两个实例并发 ——
 * 并发时自己的 scope 一定还开着，会先命中正常路径，不会走到这里。
 */
const adoptOpenTaskScope = (state: ReducerState, taskId: number): TraceScopeNode | null => {
  for (let index = state.openScopes.length - 1; index >= 0; index -= 1) {
    const scope = state.openScopes[index]
    if (scope.kind !== 'task' || scope.taskId !== taskId) continue
    // 它是按自己的 key 注册的，先摘掉，避免 finalizeScope 用事件的 key 找不到而留下悬挂索引
    detachScopeFromIndexes(state, scope)
    return scope
  }
  return null
}

const closeScope = (state: ReducerState, event: ProtocolEvent): TraceScopeNode => {
  const scopeKey = buildScopeKey(event)
  const scope =
    (scopeKey
      ? peekMapStack(state.openScopeStacksByKey, scopeKey)
      : event.kind === 'next_list' && event.taskId != null
        ? peekMapStack(
            state.openNextListScopesByTaskId,
            buildTaskIndexKey(event.processId, event.taskId),
          )
        : null) ??
    (event.kind === 'task' && event.taskId != null ? adoptOpenTaskScope(state, event.taskId) : null)

  if (!scope) {
    return createSyntheticTerminalScope(state, event)
  }

  return finalizeScope(state, scope, event)
}

const createSyntheticTerminalScope = (
  state: ReducerState,
  event: ProtocolEvent,
): TraceScopeNode => {
  const scope = createScopeNode(event)
  const parent = resolveParentScope(state, event)
  attachChild(parent, scope)
  return scope
}

const createReducerState = (events: ProtocolEvent[]): ReducerState => ({
  root: createRootNode(events),
  openScopes: [],
  openScopeStacksByKey: new Map(),
  openTaskScopesByTaskId: new Map(),
  openPipelineScopesByTaskId: new Map(),
  openNextListScopesByTaskId: new Map(),
})

const appendEventToReducerState = (state: ReducerState, event: ProtocolEvent): void => {
  if (!state.root.ts) state.root.ts = event.ts

  if (event.phase === 'starting') {
    openScope(state, event)
  } else {
    closeScope(state, event)
  }

  state.root.endTs = event.ts
  state.root.endSeq = event.seq
}

export interface IncrementalTraceReducer {
  append: (event: ProtocolEvent) => void
  getTrace: () => TraceRootNode
  reset: () => void
}

/** Keep reducer state between realtime batches and only reduce new events. */
export const createIncrementalTraceReducer = (): IncrementalTraceReducer => {
  let state = createReducerState([])

  return {
    append(event) {
      appendEventToReducerState(state, event)
    },
    getTrace() {
      return state.root
    },
    reset() {
      state = createReducerState([])
    },
  }
}

export const buildTraceTree = (events: ProtocolEvent[]): TraceRootNode => {
  const state = createReducerState(events)

  for (const event of events) {
    appendEventToReducerState(state, event)
  }
  return state.root
}
