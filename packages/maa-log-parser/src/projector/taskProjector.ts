import type {
  ActionDetail,
  EventNotification,
  EventSourceRef,
  NextListItem,
  NodeInfo,
  RecognitionDetail,
  ResourceLoadingDetail,
  TaskInfo,
  TaskSummary,
  UnifiedFlowItem,
  WaitFreezesDetail,
} from '../shared/types'
import { toTimestampMs } from '../shared/timestamp'
import { findImageByTimestampSuffix } from '../event/imageLookupHelpers'
import type { ProtocolEvent } from '../protocol/types'
import type { ScopeNode, ScopeStatus } from '../trace/scopeTypes'
import { buildWaitFreezesImageAssignments } from './waitFreezesImageProjector'

/**
 * Strict trace projector.
 *
 * Keep the projected task tree aligned with trace semantics and avoid legacy UI
 * compatibility shaping here.
 */
interface ProjectionContext {
  currentTaskId?: number
  currentNodeId?: number
  options: ProjectTasksFromTraceOptions
}

interface ProjectedTaskEntry {
  seq: number
  task: TaskInfo
}

export interface ProjectedTaskCacheEntry {
  endSeq: number
  task: TaskInfo
}

export interface SequencedTaskEvent {
  seq: number
  sourceKey?: string
  /** 产生该事件的进程。同一个 `task_id` 被多个进程复用时，靠它把事件归到正确的任务上。 */
  processId?: string
  event: EventNotification
}

export interface ProjectTasksFromTraceOptions {
  events?: EventNotification[]
  eventsByTaskId?: ReadonlyMap<number, EventNotification[]>
  sequencedEventsByTaskId?: ReadonlyMap<number, SequencedTaskEvent[]>
  completedTaskCache?: Map<string, ProjectedTaskCacheEntry>
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  /**
   * 已知互为镜像的进程对（`PxA|PxB`，字典序）。
   *
   * 提供时，投影会合并「永不闭合的 0 节点任务」与它在另一个进程里的孪生任务 ——
   * 这是客户端 + agent 双写同一份日志时，镜像的 `Tasker.Task.Starting` 超出
   * 跨源去重窗口而产生的重复任务。不提供则该行为关闭（第三方直接调 projector 时保持旧输出）。
   */
  mirrorProcessPairs?: ReadonlySet<string>
}

interface InternalProjectTasksFromTraceOptions extends ProjectTasksFromTraceOptions {
  waitFreezesImagesByScopeId: ReadonlyMap<string, readonly string[]>
  /**
   * scope → 该 scope 子树里出现过的进程集合（含自己）。懒加载：第一次真的要用时才全量算一遍。
   * 见 buildScopeProcessIdSets。
   */
  getScopeProcessIds: (scope: ScopeNode) => ReadonlySet<string>
}

const EMPTY_IMAGE_MAP = new Map<string, string>()

const toTaskStatus = (status: ScopeStatus): TaskInfo['status'] => {
  switch (status) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    default:
      return 'running'
  }
}

const toRuntimeStatus = (status: ScopeStatus): NodeInfo['status'] => {
  switch (status) {
    case 'succeeded':
      return 'success'
    case 'failed':
      return 'failed'
    default:
      return 'running'
  }
}

const sortScopesBySeq = (scopes: ScopeNode[]): ScopeNode[] => {
  for (let index = 1; index < scopes.length; index += 1) {
    if ((scopes[index - 1]?.seq ?? 0) > (scopes[index]?.seq ?? 0)) {
      return [...scopes].sort((left, right) => left.seq - right.seq)
    }
  }
  return scopes
}

const mergeProjectedTaskEntries = <T extends { seq: number }>(
  left: T[],
  right: T[],
): T[] => {
  if (left.length === 0) return right
  if (right.length === 0) return left

  const merged = new Array<T>(left.length + right.length)
  let leftIndex = 0
  let rightIndex = 0
  let outputIndex = 0
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftEntry = left[leftIndex]!
    const rightEntry = right[rightIndex]!
    if (leftEntry.seq <= rightEntry.seq) {
      merged[outputIndex++] = leftEntry
      leftIndex += 1
    } else {
      merged[outputIndex++] = rightEntry
      rightIndex += 1
    }
  }
  while (leftIndex < left.length) merged[outputIndex++] = left[leftIndex++]!
  while (rightIndex < right.length) merged[outputIndex++] = right[rightIndex++]!
  return merged
}

const readRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const readScopePayload = (scope: ScopeNode): Record<string, unknown> => {
  return readRecord(scope.payload) ?? {}
}

const readStringField = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): string | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'string') return camelValue
  if (snakeField) {
    const snakeValue = record[snakeField]
    if (typeof snakeValue === 'string') return snakeValue
  }
  return undefined
}

const readNumberField = (
  record: Record<string, unknown>,
  camelField: string,
  snakeField?: string,
): number | undefined => {
  const camelValue = record[camelField]
  if (typeof camelValue === 'number') return camelValue
  if (snakeField) {
    const snakeValue = record[snakeField]
    if (typeof snakeValue === 'number') return snakeValue
  }
  return undefined
}

const readScopeName = (scope: ScopeNode): string => {
  const payload = readScopePayload(scope)
  return readStringField(payload, 'name') ?? readStringField(payload, 'entry') ?? scope.kind
}

const readScopeTaskId = (scope: ScopeNode): number | undefined => {
  if (scope.taskId != null) return scope.taskId
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'taskId', 'task_id')
}

const readScopeNodeId = (scope: ScopeNode): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'nodeId', 'node_id')
}

const readScopeRecoId = (scope: ScopeNode): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'recoId', 'reco_id')
}

const readScopeActionId = (scope: ScopeNode): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'actionId', 'action_id')
}

const readScopeWaitFreezesId = (scope: ScopeNode): number | undefined => {
  const payload = readScopePayload(scope)
  return readNumberField(payload, 'wfId', 'wf_id')
}

const normalizeNextList = (value: unknown): NextListItem[] => {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const record = readRecord(item) ?? {}
    return {
      name: readStringField(record, 'name') ?? '',
      anchor: record.anchor === true,
      jump_back: record.jumpBack === true || record.jump_back === true,
    }
  })
}

const normalizeNodeDetails = (value: unknown): NodeInfo['node_details'] | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  return {
    action_id: readNumberField(record, 'actionId', 'action_id') ?? 0,
    completed: record.completed === true,
    name: readStringField(record, 'name') ?? '',
    node_id: readNumberField(record, 'nodeId', 'node_id') ?? 0,
    reco_id: readNumberField(record, 'recoId', 'reco_id') ?? 0,
  }
}

const normalizeRecognitionDetail = (value: unknown): RecognitionDetail | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  const box =
    Array.isArray(record.box) && record.box.length === 4
      ? (record.box as [number, number, number, number])
      : null

  return {
    reco_id: readNumberField(record, 'recoId', 'reco_id') ?? 0,
    algorithm: readStringField(record, 'algorithm') ?? '',
    box,
    detail: record.detail,
    name: readStringField(record, 'name') ?? '',
  }
}

const normalizeActionDetail = (value: unknown): ActionDetail | undefined => {
  const record = readRecord(value)
  if (!record) return undefined

  const box =
    Array.isArray(record.box) && record.box.length === 4
      ? (record.box as [number, number, number, number])
      : ([0, 0, 0, 0] as [number, number, number, number])

  return {
    action_id: readNumberField(record, 'actionId', 'action_id') ?? 0,
    action: readStringField(record, 'action') ?? '',
    box,
    detail: record.detail,
    name: readStringField(record, 'name') ?? '',
    success: record.success === true,
    ts: readStringField(record, 'ts'),
    end_ts: readStringField(record, 'endTs', 'end_ts'),
  }
}

const normalizeResourceLoadingDetail = (scope: ScopeNode): ResourceLoadingDetail | undefined => {
  const payload = readScopePayload(scope)
  const resId = readNumberField(payload, 'resId', 'res_id')
  const path = readStringField(payload, 'path')
  const resourceType = readStringField(payload, 'resourceType', 'resource_type')
  const hash = readStringField(payload, 'hash')

  if (resId == null && !path && !resourceType && !hash) return undefined

  return {
    res_id: resId ?? 0,
    path,
    resource_type: resourceType,
    hash,
  }
}

const readLastPathSegment = (path?: string): string | undefined => {
  if (!path) return undefined
  const normalized = path.replace(/[\\/]+$/, '')
  if (!normalized) return undefined
  const segments = normalized.split(/[\\/]/).filter(Boolean)
  return segments[segments.length - 1] ?? normalized
}

const resolveResourceLoadingName = (scope: ScopeNode): string => {
  const payload = readScopePayload(scope)
  const path = readStringField(payload, 'path')
  return (
    readLastPathSegment(path) ??
    readStringField(payload, 'resourceType', 'resource_type') ??
    readStringField(payload, 'hash') ??
    'Resource.Loading'
  )
}

const normalizeWaitFreezesDetail = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
): WaitFreezesDetail => {
  const payload = readScopePayload(scope)
  const roi =
    Array.isArray(payload.roi) && payload.roi.length === 4
      ? (payload.roi as [number, number, number, number])
      : undefined
  const recoIds = Array.isArray(payload.recoIds)
    ? payload.recoIds.filter((value): value is number => typeof value === 'number')
    : undefined

  const images = (
    options as Partial<InternalProjectTasksFromTraceOptions>
  ).waitFreezesImagesByScopeId?.get(scope.id)

  return {
    wf_id: readScopeWaitFreezesId(scope) ?? 0,
    phase: readStringField(payload, 'waitPhase', 'phase'),
    elapsed: readNumberField(payload, 'elapsed'),
    reco_ids: recoIds,
    roi,
    param: readRecord(payload.param) as WaitFreezesDetail['param'] | undefined,
    focus: payload.focus,
    images: images ? [...images] : undefined,
  }
}

const readNestedDetailName = (
  payload: Record<string, unknown>,
  field: string,
): string | undefined => {
  return readStringField(readRecord(payload[field]) ?? {}, 'name')
}

const findErrorImageByNames = (
  options: ProjectTasksFromTraceOptions,
  timestamp: string,
  candidateNames: Array<string | undefined>,
): string | undefined => {
  const source = options.errorImages ?? EMPTY_IMAGE_MAP
  if (source.size === 0) return undefined

  for (const candidate of candidateNames) {
    if (!candidate) continue
    const matched = findImageByTimestampSuffix(source, timestamp, `_${candidate}`)
    if (matched) return matched
  }

  return undefined
}

const resolveScopeErrorImage = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  candidateNames: Array<string | undefined>,
): string | undefined => {
  if (scope.status !== 'failed') return undefined
  return findErrorImageByNames(options, scope.endTs ?? scope.ts, candidateNames)
}

const resolveScopeVisionImage = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  name: string,
  recoId?: number,
): string | undefined => {
  if (recoId == null) return undefined
  return findImageByTimestampSuffix(
    options.visionImages ?? EMPTY_IMAGE_MAP,
    scope.endTs ?? scope.ts,
    `_${name}_${recoId}`,
  )
}

const summarizeFlowItemStatus = (items: UnifiedFlowItem[]): UnifiedFlowItem['status'] => {
  if (items.some((item) => item.status === 'failed')) return 'failed'
  if (items.some((item) => item.status === 'running')) return 'running'
  return 'success'
}

const runtimeStatusToTaskStatus = (status: UnifiedFlowItem['status']): TaskInfo['status'] => {
  if (status === 'failed') return 'failed'
  if (status === 'running') return 'running'
  return 'succeeded'
}

const buildDuration = (startTime: string, endTime?: string): number | undefined => {
  if (!endTime) return undefined
  const startMs = Date.parse(startTime)
  const endMs = Date.parse(endTime)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined
  return Math.max(0, endMs - startMs)
}

const shouldSynthesizeForeignTaskGroup = (
  parentScope: ScopeNode,
  childScope: ScopeNode,
): boolean => {
  if (childScope.kind !== 'pipeline_node') return false
  const parentTaskId = readScopeTaskId(parentScope)
  const childTaskId = readScopeTaskId(childScope)
  if (parentTaskId == null || childTaskId == null) return false
  return parentTaskId !== childTaskId
}

const projectSyntheticTaskFlowItem = (
  parentScope: ScopeNode,
  groupedScopes: ScopeNode[],
  context: ProjectionContext,
): UnifiedFlowItem => {
  const firstScope = groupedScopes[0]
  const lastScope = groupedScopes[groupedScopes.length - 1]
  const taskId = readScopeTaskId(firstScope) ?? 0
  const children = groupedScopes.flatMap((scope) => projectFlowScope(scope, context))
  const status = summarizeFlowItemStatus(children)
  const name = readScopeName(firstScope)

  return {
    id: `${parentScope.id}.synthetic-task.${taskId}.seq${firstScope.seq}`,
    type: 'task',
    name,
    status,
    ts: firstScope.ts,
    end_ts: lastScope?.endTs,
    task_id: taskId,
    task_details: {
      task_id: taskId,
      entry: name,
      status: toTaskStatus(
        status === 'running' ? 'running' : status === 'failed' ? 'failed' : 'succeeded',
      ),
      ts: firstScope.ts,
      end_ts: lastScope?.endTs,
    },
    children: children.length > 0 ? children : undefined,
  }
}

/**
 * 收集子树里的全部任务作用域（先序）。
 *
 * 用显式栈而不是递归：轮转片段丢失、`Tasker.Task.Failed/Succeeded` 成批缺失时，
 * 每个新任务都会挂在还开着的那一个下面，作用域树会退化成上万层的链
 * （实测 17,000 个连续未闭合任务 = 深度 17,000），递归版本直接 RangeError。
 * 解析器不应该因为输入退化而崩掉。
 */
const collectTaskScopes = (root: ScopeNode, output: ScopeNode[]): void => {
  const stack: ScopeNode[] = []
  for (let index = root.children.length - 1; index >= 0; index -= 1) {
    const child = root.children[index]
    if (child) stack.push(child)
  }

  while (stack.length > 0) {
    const scope = stack.pop() as ScopeNode
    if (scope.kind === 'task') {
      output.push(scope)
    }
    const children = scope.children
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child) stack.push(child)
    }
  }
}

const buildNextTaskOccurrenceSeq = (scopes: ScopeNode[]): Map<ScopeNode, number> => {
  const nextSeqByScope = new Map<ScopeNode, number>()
  // 键要带 processId：同一个 task_id 被两个并发进程复用时，它们是两个独立的任务，
  // 不能把先出现那个的"下一次出现"设成对方（那会让先出现那个的事件列表一直吃到对方的事件）。
  const nextSeqByTaskAndSource = new Map<string, number>()

  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index]
    if (!scope) continue
    const taskId = readScopeTaskId(scope)
    if (taskId == null) continue
    const key = `${taskId}\u0000${readScopeSourceKey(scope) ?? ''}\u0000${readScopeProcessId(scope) ?? ''}`
    const nextSeq = nextSeqByTaskAndSource.get(key)
    if (nextSeq != null) {
      nextSeqByScope.set(scope, nextSeq)
    }
    nextSeqByTaskAndSource.set(key, scope.seq)
  }

  return nextSeqByScope
}

const readTaskEventTaskId = (event: EventNotification): number | undefined => {
  const details = readRecord(event.details)
  if (!details) return undefined
  return readNumberField(details, 'taskId', 'task_id')
}

const eventTimestampMsCache = new WeakMap<EventNotification, number>()

const getEventTimestampMs = (event: EventNotification): number => {
  const cached = eventTimestampMsCache.get(event)
  if (cached !== undefined) return cached
  const parsed = toTimestampMs(event.timestamp)
  eventTimestampMsCache.set(event, parsed)
  return parsed
}

/** 该作用域「起始事件」的来源键。
 *
 * 不能读合并后的 payload.source：`buildScopePayload` 每来一条事件都会把 payload 覆盖一遍，
 * 于是跨文件的任务（轮转片段）payload.source 会变成最后一条事件所在的文件，
 * 用它做过滤会把任务开头的事件（包括 `Tasker.Task.Starting`）整段丢掉。
 * 起始事件的来源是稳定的，用它才对得上「这个任务是从哪份日志开始的」。
 */
const readScopeSourceKey = (scope: ScopeNode): string | undefined =>
  readScopeStartEvent(scope)?.source?.sourceKey

/** 作用域所属进程；同一 `task_id` 被多进程复用时用它区分任务。 */
const readScopeProcessId = (scope: ScopeNode): string | undefined =>
  readStringField(readScopePayload(scope), 'processId')

/** 打开该作用域的那条协议事件（任务/节点都可能由「中间事件」补建）。 */
const readScopeStartEvent = (scope: ScopeNode): ProtocolEvent | undefined => {
  const payload = readScopePayload(scope)
  const startEvent = payload.startEvent
  if (!startEvent || typeof startEvent !== 'object') return undefined
  return startEvent as ProtocolEvent
}

/** 该作用域第一次出现的位置（文件 + 行号），透传给下游做「这条信息出自哪里」。 */
const readScopeSourceRef = (scope: ScopeNode): EventSourceRef | undefined => {
  const source = readScopeStartEvent(scope)?.source
  if (!source) return undefined
  const ref: EventSourceRef = {
    path: source.sourcePath,
    line: source.line,
    inputIndex: source.inputIndex,
    sourceKey: source.sourceKey,
  }
  const hasAny =
    ref.path != null || ref.line != null || ref.inputIndex != null || ref.sourceKey != null
  return hasAny ? ref : undefined
}

/**
 * 这个任务作用域是不是被 `Tasker.Task.Starting` 打开的。
 *
 * 补建的任务（日志轮转截断、或只打开了轮转片段）由节点事件打开，
 * `kind` 是 `pipeline_node` 之类，据此可以区分「真任务」与「隐式任务」。
 */
const isOpenedByTaskStarting = (scope: ScopeNode): boolean => {
  const startEvent = readScopeStartEvent(scope)
  return startEvent?.kind === 'task' && startEvent.phase === 'starting'
}

const collectSubtreeProcessIds = (root: ScopeNode, output: Set<string>): void => {
  // 同 collectTaskScopes：深度不设上限的输入不允许把调用栈打爆。
  const stack: ScopeNode[] = [...root.children]
  while (stack.length > 0) {
    const scope = stack.pop() as ScopeNode
    const processId = readScopeProcessId(scope)
    if (processId) output.add(processId)
    for (const child of scope.children) stack.push(child)
  }
}

/**
 * 一个任务的事件归属哪些进程。
 *
 * **不能只看 `payload.processId`**：`finalizeScope` 会用关闭事件重写 payload 里的该字段，
 * 而关闭事件常常来自被认领的另一进程（`adoptOpenTaskScope`）—— 那时 payload 记的是"谁把它关掉的"，
 * 不是"谁拥有它的节点"。镜像混搭（客户端 + agent）下这会把创建者的事件全部滤掉，
 * 连带丢掉那些节点自己的 timestamp→行号 证据。
 *
 * 所以取**子树里出现过的全部进程**：并发两个实例各自的子树只含自己那个进程，仍然分得开。
 */
/**
 * 一次后序遍历算出每个 scope 的「子树进程集合」（含自己）。
 *
 * 原来每个任务各走一遍自己的子树：作用域退化成链时（成批缺失终止事件）第 i 个任务的子树
 * 含后面所有任务，Σ(n-i) 是 O(节点数²) —— 17,000 层的链实测 19s。这里一趟 O(节点数)，
 * 每个集合的大小只取决于日志里出现过的进程数（通常 1~2 个）。
 *
 * 索引只在单次投影内有效：作用域树是增量长出来的，跨调用缓存会漏掉后来挂上来的子节点。
 */
const buildScopeProcessIdSets = (
  root: ScopeNode,
  output: Map<ScopeNode, ReadonlySet<string>>,
): void => {
  const stack: Array<{ scope: ScopeNode; expanded: boolean }> = [{ scope: root, expanded: false }]

  while (stack.length > 0) {
    const entry = stack.pop() as { scope: ScopeNode; expanded: boolean }
    if (!entry.expanded) {
      stack.push({ scope: entry.scope, expanded: true })
      for (const child of entry.scope.children) {
        stack.push({ scope: child, expanded: false })
      }
      continue
    }

    const processIds = new Set<string>()
    const ownProcessId = readScopeProcessId(entry.scope)
    if (ownProcessId) processIds.add(ownProcessId)
    for (const child of entry.scope.children) {
      const childProcessIds = output.get(child)
      if (!childProcessIds) continue
      for (const processId of childProcessIds) processIds.add(processId)
    }
    output.set(entry.scope, processIds)
  }
}

const collectTaskOwnerProcessIds = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions = {},
): ReadonlySet<string> => {
  const indexed = (options as Partial<InternalProjectTasksFromTraceOptions>).getScopeProcessIds?.(
    scope,
  )
  if (indexed) return indexed

  // 兜底：调用方没带索引（第三方直接用 projector）时仍旧自己走一遍子树。
  const owners = new Set<string>()
  const ownProcessId = readScopeProcessId(scope)
  if (ownProcessId) owners.add(ownProcessId)
  collectSubtreeProcessIds(scope, owners)
  return owners
}

const copyTaskEvent = (event: EventNotification): EventNotification => ({
  timestamp: event.timestamp,
  level: event.level,
  message: event.message,
  details: event.details,
  _lineNumber: event._lineNumber,
  // 来源文件/行号随事件一起带走：下游要回答「这条识别事件出自哪份日志的哪一行」
  ...(event.source ? { source: event.source } : {}),
  // 事件级进程归属：下游做证据归属时不必再按时间区间反推
  ...(event.process_id ? { process_id: event.process_id } : {}),
})

const findFirstSequencedEventIndex = (events: SequencedTaskEvent[], targetSeq: number): number => {
  let low = 0
  let high = events.length
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2)
    const event = events[middle]
    if (event && event.seq < targetSeq) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

const projectTaskEvents = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  nextOccurrenceSeq?: number,
): EventNotification[] => {
  const taskId = readScopeTaskId(scope)
  const sequencedEvents = taskId == null ? undefined : options.sequencedEventsByTaskId?.get(taskId)

  if (taskId != null && sequencedEvents) {
    const sourceKey = readScopeSourceKey(scope)
    // 同一 task_id 被多进程复用时，两边的任务共用同一份事件序列 —— 必须按进程过滤，
    // 否则每个任务的事件列表都会吃到对方的（进而污染证据的 timestamp→行号 索引）。
    // 归属取子树进程集合，理由见 collectTaskOwnerProcessIds。
    const ownerProcessIds = collectTaskOwnerProcessIds(scope, options)
    const scopeEndSeq = scope.endSeq ?? Number.POSITIVE_INFINITY
    const occurrenceEndSeq =
      nextOccurrenceSeq == null ? scopeEndSeq : Math.min(scopeEndSeq, nextOccurrenceSeq - 1)

    const projectedEvents: EventNotification[] = []
    const firstEventIndex = findFirstSequencedEventIndex(sequencedEvents, scope.seq)
    // 这个任务自己有没有收到过 Starting：没有时（补建/轮转缺口）才允许把别的来源里
    // 同一 task_id 的 Starting 捞进来补齐证据；有的话镜像源的 Starting 必须继续被过滤掉。
    const scopeHasOwnStarting = isOpenedByTaskStarting(scope)
    for (let index = firstEventIndex; index < sequencedEvents.length; index += 1) {
      const item = sequencedEvents[index]
      if (!item || item.seq > occurrenceEndSeq) break
      // 跨源镜像去重只应该过滤「重复的镜像事件」。但一个任务可能横跨多份文件
      // （轮转片段：任务在 maa.bak.log 里开始、在 maa.log 里结束），按来源整段过滤会把
      // 任务的起始事件、特别是 Tasker.Task.Starting 丢掉，下游就无法证明「这个任务真的启动过」。
      // 所以这两类事件无条件保留，其余仍按来源过滤。
      const isScopeStartEvent = item.seq === scope.seq
      const isMissingTaskStart =
        !scopeHasOwnStarting && item.event.message === 'Tasker.Task.Starting'
      if (
        sourceKey != null &&
        item.sourceKey !== sourceKey &&
        !isScopeStartEvent &&
        !isMissingTaskStart
      )
        continue
      if (
        ownerProcessIds.size > 0 &&
        item.processId != null &&
        !ownerProcessIds.has(item.processId)
      ) {
        continue
      }
      projectedEvents.push(copyTaskEvent(item.event))
    }
    return projectedEvents
  }

  const events =
    taskId == null ? undefined : (options.eventsByTaskId?.get(taskId) ?? options.events)
  if (taskId == null || !events || events.length === 0) return []

  const startMs = toTimestampMs(scope.ts)
  const endMs = scope.endTs ? toTimestampMs(scope.endTs) : Number.POSITIVE_INFINITY

  return events
    .filter((event) => {
      if (readTaskEventTaskId(event) !== taskId) return false
      const eventMs = getEventTimestampMs(event)
      if (!Number.isFinite(startMs) || !Number.isFinite(eventMs)) return true
      return eventMs >= startMs && eventMs <= endMs + 1
    })
    .map(copyTaskEvent)
}

const projectFlowChildren = (scope: ScopeNode, context: ProjectionContext): UnifiedFlowItem[] => {
  const items: UnifiedFlowItem[] = []
  const children = sortScopesBySeq(scope.children)
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index]
    if (shouldSynthesizeForeignTaskGroup(scope, child)) {
      const groupedScopes = [child]
      const groupedTaskId = readScopeTaskId(child)
      while (index + 1 < children.length) {
        const next = children[index + 1]
        if (
          !shouldSynthesizeForeignTaskGroup(scope, next) ||
          readScopeTaskId(next) !== groupedTaskId
        ) {
          break
        }
        groupedScopes.push(next)
        index += 1
      }
      items.push(projectSyntheticTaskFlowItem(scope, groupedScopes, context))
      continue
    }

    items.push(...projectFlowScope(child, context))
  }
  return items
}

const projectTaskFlowItem = (scope: ScopeNode, context: ProjectionContext): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const children = projectFlowChildren(scope, {
    currentTaskId: readScopeTaskId(scope),
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'task',
    name: readStringField(payload, 'entry') ?? readScopeName(scope),
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    task_details: {
      task_id: readScopeTaskId(scope) ?? 0,
      entry: readStringField(payload, 'entry'),
      hash: readStringField(payload, 'hash'),
      uuid: readStringField(payload, 'uuid'),
      status: toTaskStatus(scope.status),
      ts: scope.ts,
      end_ts: scope.endTs,
    },
    children: children.length > 0 ? children : undefined,
  }
}

const projectPipelineNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const nodeName = readScopeName(scope)
  const children = projectFlowChildren(scope, {
    currentTaskId: readScopeTaskId(scope) ?? context.currentTaskId,
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'pipeline_node',
    name: nodeName,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    focus: payload.focus,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      nodeName,
      readNestedDetailName(payload, 'actionDetails'),
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectResourceLoadingFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'resource_loading',
    name: resolveResourceLoadingName(scope),
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope) ?? context.currentTaskId,
    node_id: context.currentNodeId,
    resource_loading_details: normalizeResourceLoadingDetail(scope),
    children: children.length > 0 ? children : undefined,
  }
}

const projectRecognitionFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const name = readScopeName(scope)
  const recoId = readScopeRecoId(scope)
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'recognition',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    reco_id: recoId,
    focus: payload.focus,
    anchor_name: readStringField(payload, 'anchor'),
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    vision_image: resolveScopeVisionImage(scope, context.options, name, recoId),
    children: children.length > 0 ? children : undefined,
  }
}

const projectRecognitionNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const name = readScopeName(scope)
  const recoId = readScopeRecoId(scope)
  const children = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'recognition_node',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    reco_id: recoId,
    focus: payload.focus,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    vision_image: resolveScopeVisionImage(scope, context.options, name, recoId),
    children: children.length > 0 ? children : undefined,
  }
}

const projectActionFlowItem = (scope: ScopeNode, context: ProjectionContext): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const name = readScopeName(scope)
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'action',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    action_id: readScopeActionId(scope),
    focus: payload.focus,
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'actionDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectActionNodeFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? context.currentNodeId
  const name = readScopeName(scope)
  const children = projectFlowChildren(scope, {
    currentNodeId: nodeId,
    options: context.options,
  })

  return {
    id: scope.id,
    type: 'action_node',
    name,
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: nodeId,
    action_id: readScopeActionId(scope),
    focus: payload.focus,
    action_details: normalizeActionDetail(payload.actionDetails),
    error_image: resolveScopeErrorImage(scope, context.options, [
      name,
      readNestedDetailName(payload, 'actionDetails'),
    ]),
    children: children.length > 0 ? children : undefined,
  }
}

const projectWaitFreezesFlowItem = (
  scope: ScopeNode,
  context: ProjectionContext,
): UnifiedFlowItem => {
  const payload = readScopePayload(scope)
  const children = projectFlowChildren(scope, context)

  return {
    id: scope.id,
    type: 'wait_freezes',
    name: readScopeName(scope),
    status: toRuntimeStatus(scope.status),
    ts: scope.ts,
    end_ts: scope.endTs,
    task_id: readScopeTaskId(scope),
    node_id: context.currentNodeId,
    focus: payload.focus,
    wait_freezes_details: normalizeWaitFreezesDetail(scope, context.options),
    children: children.length > 0 ? children : undefined,
  }
}

const projectFlowScope = (scope: ScopeNode, context: ProjectionContext): UnifiedFlowItem[] => {
  switch (scope.kind) {
    case 'task':
      return [projectTaskFlowItem(scope, context)]
    case 'pipeline_node':
      return [projectPipelineNodeFlowItem(scope, context)]
    case 'resource_loading':
      return [projectResourceLoadingFlowItem(scope, context)]
    case 'recognition':
      return [projectRecognitionFlowItem(scope, context)]
    case 'recognition_node':
      return [projectRecognitionNodeFlowItem(scope, context)]
    case 'action':
      return [projectActionFlowItem(scope, context)]
    case 'action_node':
      return [projectActionNodeFlowItem(scope, context)]
    case 'wait_freezes':
      return [projectWaitFreezesFlowItem(scope, context)]
    case 'next_list':
      return sortScopesBySeq(scope.children).flatMap((child) => projectFlowScope(child, context))
    case 'controller_action':
    case 'trace_root':
      return []
  }
}

const resolveNodeNextList = (scope: ScopeNode): NextListItem[] => {
  let nextList: NextListItem[] = []
  for (const child of sortScopesBySeq(scope.children)) {
    if (child.kind !== 'next_list') continue
    const payload = readScopePayload(child)
    nextList = normalizeNextList(payload.list)
  }
  return nextList
}

const projectPipelineNodeScope = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
): NodeInfo => {
  const payload = readScopePayload(scope)
  const nodeId = readScopeNodeId(scope) ?? 0
  const taskId = readScopeTaskId(scope) ?? 0
  const nodeName = readScopeName(scope)
  const nodeFlow = projectFlowChildren(scope, {
    currentTaskId: taskId,
    currentNodeId: nodeId,
    options,
  })

  return {
    node_id: nodeId,
    name: nodeName,
    ts: scope.ts,
    end_ts: scope.endTs,
    status: toRuntimeStatus(scope.status),
    task_id: taskId,
    reco_details: normalizeRecognitionDetail(payload.recoDetails),
    action_details: normalizeActionDetail(payload.actionDetails),
    focus: payload.focus,
    next_list: resolveNodeNextList(scope),
    node_flow: nodeFlow,
    node_details: normalizeNodeDetails(payload.nodeDetails),
    error_image: resolveScopeErrorImage(scope, options, [
      nodeName,
      readNestedDetailName(payload, 'actionDetails'),
      readNestedDetailName(payload, 'recoDetails'),
    ]),
    source: readScopeSourceRef(scope),
  }
}

const projectTaskScope = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  nextOccurrenceSeq?: number,
): TaskInfo => {
  const payload = readScopePayload(scope)
  const pipelineScopes = sortScopesBySeq(scope.children).filter(
    (child) => child.kind === 'pipeline_node',
  )
  const nodes = pipelineScopes.map((pipelineScope) =>
    projectPipelineNodeScope(pipelineScope, options),
  )

  // entry 的三级兜底各自代表不同可信度，必须告诉下游用的是哪一级：
  // 只有日志里的 entry 字段（'field'）是事实，`nodes[0].name` 与作用域名都是推断。
  const fieldEntry = readStringField(payload, 'entry')
  const nodeEntry = nodes[0]?.name
  const entry = fieldEntry ?? nodeEntry ?? readScopeName(scope)
  const entrySource: TaskInfo['entry_source'] =
    fieldEntry != null ? 'field' : nodeEntry != null ? 'node' : 'scope'

  // 隐式补建的作用域说明这批输入从任务中间开始；转正之后 reducer 会在 payload 上留下
  // `truncatedStart`，所以「曾经缺过」与「至今仍缺」是两件事，分别给两个字段。
  // 两种情况都算「收到过 Starting」：作用域直接被 Starting 打开，
  // 或者先是补建的、后来真身 Starting 到了并转正（payload.taskStartingSeen）。
  const openedByTaskStarting = payload.taskStartingSeen === true || isOpenedByTaskStarting(scope)
  const everImplicit = payload.truncatedStart === true || payload.implicitTask === true
  // 子树进程集合只算一次：无索引时（第三方直接调 projector）它会走一遍子树
  const ownerProcessIds = collectTaskOwnerProcessIds(scope, options)

  return {
    task_id: readScopeTaskId(scope) ?? 0,
    entry,
    entry_source: entrySource,
    // task_id 只在进程内唯一，把内核早就在用的进程身份补出来供下游精确定位
    // 创建者进程 = 起始事件所在的进程。**不能**读合并后的 payload.processId：
    // finalizeScope 会用关闭事件重写它，而 closeScope 在找不到自己的作用域时会
    // adoptOpenTaskScope 认领另一进程的打开作用域（客户端 + agent 镜像、一侧 Starting 被去重），
    // 那时 payload 记的是「谁把它关掉的」，按它定位会落到错误的执行。
    // 起始事件没有 processId 时直接留空，**不要**回退到 payload 里的值 ——
    // 那正是上面说的「可能被关闭事件改写」的不可靠来源，宁可让下游拿到 undefined 显式处理。
    process_id: readScopeStartEvent(scope)?.processId,
    // 子树涉及的全部进程：镜像场景下可能不止一个（创建者的节点在 Px1、关闭事件在 Px2）
    process_ids: ownerProcessIds.size > 0 ? [...ownerProcessIds].sort() : undefined,
    task_execution_id: scope.id,
    has_starting_event: openedByTaskStarting,
    rotation_gap: everImplicit,
    truncated_start: everImplicit && !openedByTaskStarting,
    hash: readStringField(payload, 'hash') ?? '',
    uuid: readStringField(payload, 'uuid') ?? '',
    _startEventIndex: scope.seq,
    start_time: scope.ts,
    end_time: scope.endTs,
    status: toTaskStatus(scope.status),
    nodes,
    events: projectTaskEvents(scope, options, nextOccurrenceSeq),
    duration: buildDuration(scope.ts, scope.endTs),
  }
}

const projectTaskScopeWithCache = (
  scope: ScopeNode,
  options: ProjectTasksFromTraceOptions,
  nextOccurrenceSeq?: number,
): TaskInfo => {
  const endSeq = scope.endSeq
  const canCache = scope.status !== 'running' && endSeq != null
  if (!canCache || !options.completedTaskCache) {
    return projectTaskScope(scope, options, nextOccurrenceSeq)
  }

  const cached = options.completedTaskCache.get(scope.id)
  if (cached?.endSeq === endSeq) return cached.task

  const task = projectTaskScope(scope, options, nextOccurrenceSeq)
  options.completedTaskCache.set(scope.id, { endSeq, task })
  return task
}

const collectRootResourceScopeGroups = (root: ScopeNode): ScopeNode[][] => {
  const groups: ScopeNode[][] = []
  let currentGroup: ScopeNode[] = []

  for (const child of sortScopesBySeq(root.children)) {
    if (child.kind === 'resource_loading') {
      currentGroup.push(child)
      continue
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup)
      currentGroup = []
    }
  }

  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }

  return groups
}

const projectRootResourceTaskEntry = (
  groupedScopes: ScopeNode[],
  options: ProjectTasksFromTraceOptions,
  groupIndex: number,
): ProjectedTaskEntry | null => {
  const firstScope = groupedScopes[0]
  const lastScope = groupedScopes[groupedScopes.length - 1]
  if (!firstScope || !lastScope) return null

  const taskUuid = `synthetic:resource_loading:${groupIndex + 1}:seq${firstScope.seq}`
  const taskId = 0
  const nodeId = 0
  const nodeFlow = groupedScopes.flatMap((scope) =>
    projectFlowScope(scope, {
      currentTaskId: taskId,
      currentNodeId: nodeId,
      options,
    }),
  )
  const runtimeStatus = summarizeFlowItemStatus(nodeFlow)
  const endTime = lastScope.endTs
  const task: TaskInfo = {
    task_id: taskId,
    entry: '[Global] Resource.Loading',
    hash: '',
    uuid: taskUuid,
    _startEventIndex: firstScope.seq,
    start_time: firstScope.ts,
    end_time: endTime,
    status: runtimeStatusToTaskStatus(runtimeStatus),
    nodes: [
      {
        node_id: nodeId,
        name: 'Resource.Loading',
        ts: firstScope.ts,
        end_ts: endTime,
        status: runtimeStatus,
        task_id: taskId,
        next_list: [],
        node_flow: nodeFlow,
      },
    ],
    events: [],
    duration: buildDuration(firstScope.ts, endTime),
  }

  return {
    seq: firstScope.seq,
    task,
  }
}

/**
 * 镜像孤儿任务的合并窗口：同一次执行的两侧 Starting 相差 1016ms 是实测值，
 * 留足余量但远小于「两次真实执行」的间隔。
 */
const MIRROR_ORPHAN_MAX_START_GAP_MS = 5000

const mirrorProcessPairKey = (left: string, right: string): string =>
  left < right ? `${left}|${right}` : `${right}|${left}`

/** 两个投影器（完整任务树 / 瘦摘要）共用的判定输入。 */
interface MirrorOrphanTaskView {
  task_id: number
  entry: string
  uuid?: string
  hash?: string
  status: TaskInfo['status']
  start_time: string
  process_id?: string
  process_ids?: string[]
  node_count: number
}

interface MirroredOrphanMergePlan {
  /** 需要丢弃的索引（镜像副本）。 */
  drop: Set<number>
  /** 孪生任务索引 → 合并后的进程集合（副本的进程并入，保持「同一次执行两个进程都可见」）。 */
  processIdsByTwin: Map<number, string[]>
}

/**
 * 规划「镜像孤儿任务」的合并。
 *
 * 客户端 + agent 两侧各写一份事件流时，同一次任务的 `Tasker.Task.Starting` 可能相差超过
 * 跨源去重窗口（实测 1016ms > 1000ms），于是被当成两个任务：副本收不到终止事件
 * （两侧结束事件只差 1ms，被正常去重），永远是 `running`、0 节点。
 *
 * 判定条件刻意收紧，避免误伤「进程重启后复用 task_id 的真实执行」：
 * 1. 候选是 `running` 且 **0 个节点**（没有真实执行内容）；
 * 2. 存在已闭合的孪生任务（同 task_id/entry/uuid/hash），在**另一个进程**，启动相差 ≤5s；
 * 3. 两个进程**确实发生过跨源去重**（`mirrorProcessPairs` 命中）——进程重启产生的新执行
 *    其事件与上一轮不重叠，不会留下任何去重记录，因此不会被合并。
 */
const planMirroredOrphanMerge = (
  views: readonly MirrorOrphanTaskView[],
  pairs: ReadonlySet<string> | undefined,
): MirroredOrphanMergePlan => {
  const plan: MirroredOrphanMergePlan = { drop: new Set(), processIdsByTwin: new Map() }
  if (!pairs || pairs.size === 0) return plan

  const taskKey = (view: MirrorOrphanTaskView): string =>
    `${view.task_id}\u0000${view.entry}\u0000${view.uuid ?? ''}\u0000${view.hash ?? ''}`

  const closedByKey = new Map<string, number[]>()
  for (let index = 0; index < views.length; index += 1) {
    const view = views[index]
    if (!view || view.status === 'running') continue
    const key = taskKey(view)
    const bucket = closedByKey.get(key)
    if (bucket) bucket.push(index)
    else closedByKey.set(key, [index])
  }
  if (closedByKey.size === 0) return plan

  for (let index = 0; index < views.length; index += 1) {
    const candidate = views[index]
    if (!candidate || candidate.status !== 'running') continue
    if (candidate.node_count > 0) continue
    if (!candidate.process_id) continue

    const twinIndexes = closedByKey.get(taskKey(candidate))
    if (!twinIndexes) continue
    const candidateStart = Date.parse(candidate.start_time)
    if (!Number.isFinite(candidateStart)) continue

    let twinIndex = -1
    for (const possibleTwinIndex of twinIndexes) {
      const twin = views[possibleTwinIndex]
      if (!twin?.process_id || twin.process_id === candidate.process_id) continue
      if (!pairs.has(mirrorProcessPairKey(twin.process_id, candidate.process_id))) continue
      const twinStart = Date.parse(twin.start_time)
      if (!Number.isFinite(twinStart)) continue
      if (Math.abs(twinStart - candidateStart) > MIRROR_ORPHAN_MAX_START_GAP_MS) continue
      twinIndex = possibleTwinIndex
      break
    }
    if (twinIndex < 0) continue

    const twin = views[twinIndex]!
    const merged = new Set<string>()
    for (const processId of twin.process_ids ?? []) merged.add(processId)
    for (const processId of candidate.process_ids ?? []) merged.add(processId)
    if (twin.process_id) merged.add(twin.process_id)
    merged.add(candidate.process_id)
    plan.processIdsByTwin.set(twinIndex, [...merged].sort())
    plan.drop.add(index)
  }

  return plan
}

/** 把合并计划应用到完整任务树上。 */
const applyMirroredOrphanMerge = (
  tasks: TaskInfo[],
  pairs: ReadonlySet<string> | undefined,
): TaskInfo[] => {
  const plan = planMirroredOrphanMerge(
    tasks.map((task) => ({
      task_id: task.task_id,
      entry: task.entry,
      uuid: task.uuid,
      hash: task.hash,
      status: task.status,
      start_time: task.start_time,
      process_id: task.process_id,
      process_ids: task.process_ids,
      node_count: task.nodes.length,
    })),
    pairs,
  )
  if (plan.drop.size === 0) return tasks
  for (const [index, processIds] of plan.processIdsByTwin) {
    const twin = tasks[index]
    if (twin) twin.process_ids = processIds
  }
  return tasks.filter((_, index) => !plan.drop.has(index))
}

/** 把同一份合并计划应用到瘦摘要上，保证「摘要列表」与「完整任务树」任务集合一致。 */
const applyMirroredOrphanMergeToSummaries = (
  summaries: TaskSummary[],
  pairs: ReadonlySet<string> | undefined,
): TaskSummary[] => {
  const plan = planMirroredOrphanMerge(
    summaries.map((summary) => ({
      task_id: summary.task_id,
      entry: summary.entry,
      status: summary.status,
      start_time: summary.start_time,
      process_id: summary.process_id,
      process_ids: summary.process_ids,
      node_count: summary.node_count,
    })),
    pairs,
  )
  if (plan.drop.size === 0) return summaries
  for (const [index, processIds] of plan.processIdsByTwin) {
    const twin = summaries[index]
    if (twin) twin.process_ids = processIds
  }
  return summaries.filter((_, index) => !plan.drop.has(index))
}

export const projectTasksFromTrace = (
  root: ScopeNode,
  options: ProjectTasksFromTraceOptions = {},
): TaskInfo[] => {
  const scopeProcessIdsByScope = new Map<ScopeNode, ReadonlySet<string>>()
  let scopeProcessIdsBuilt = false
  const projectionOptions: InternalProjectTasksFromTraceOptions = {
    ...options,
    waitFreezesImagesByScopeId: buildWaitFreezesImageAssignments(
      root,
      options.waitFreezesImages ?? EMPTY_IMAGE_MAP,
    ),
    // 懒加载：全部命中 completedTaskCache 的增量投影不该为这个索引买单。
    getScopeProcessIds: (scope) => {
      if (!scopeProcessIdsBuilt) {
        buildScopeProcessIdSets(root, scopeProcessIdsByScope)
        scopeProcessIdsBuilt = true
      }
      return scopeProcessIdsByScope.get(scope) ?? new Set<string>()
    },
  }
  const taskScopes: ScopeNode[] = []
  collectTaskScopes(root, taskScopes)
  const sortedTaskScopes = sortScopesBySeq(taskScopes)
  const nextOccurrenceSeqByScope = buildNextTaskOccurrenceSeq(sortedTaskScopes)

  const projectedTaskEntries: ProjectedTaskEntry[] = sortedTaskScopes.map((scope) => ({
    seq: scope.seq,
    task: projectTaskScopeWithCache(scope, projectionOptions, nextOccurrenceSeqByScope.get(scope)),
  }))

  const rootResourceTaskEntries = collectRootResourceScopeGroups(root)
    .map((groupedScopes, groupIndex) =>
      projectRootResourceTaskEntry(groupedScopes, projectionOptions, groupIndex),
    )
    .filter((entry): entry is ProjectedTaskEntry => !!entry)

  const projected = mergeProjectedTaskEntries(projectedTaskEntries, rootResourceTaskEntries)
    .map(({ task }) => task)
    .filter((task) => task.entry !== 'MaaTaskerPostStop')

  return applyMirroredOrphanMerge(projected, options.mirrorProcessPairs)
}

/**
 * 从作用域树投影「任务级瘦摘要」。
 *
 * 与 `projectTasksFromTrace` 共用同一套作用域收集、排序、根资源伪任务合并与
 * `MaaTaskerPostStop` 过滤逻辑，因此**任务集合与顺序完全一致**；差别只在于不展开
 * `nodes` / `node_flow` / `events` / 识别与动作明细——那部分才是投影耗时的来源
 * （大日志上实测 `consumeTasks` 比 `parseInputs` 慢数倍）。
 *
 * 用途：解析进行中先把任务清单交给界面（P0 首屏），解析完成后用完整 `TaskInfo`
 * 整表替换；两者按稳定三元组（process_id + task_id + start_time）对得上。
 */
export const projectTaskSummariesFromTrace = (
  root: ScopeNode,
  options: ProjectTasksFromTraceOptions = {},
): TaskSummary[] => {
  const scopeProcessIdsByScope = new Map<ScopeNode, ReadonlySet<string>>()
  let scopeProcessIdsBuilt = false
  const summaryOptions: InternalProjectTasksFromTraceOptions = {
    ...options,
    // 伪任务只需要状态与时间，不渲染图片；用空表避免为它构建整棵树的图片索引。
    waitFreezesImagesByScopeId: new Map<string, readonly string[]>(),
    getScopeProcessIds: (scope: ScopeNode): ReadonlySet<string> => {
      if (!scopeProcessIdsBuilt) {
        buildScopeProcessIdSets(root, scopeProcessIdsByScope)
        scopeProcessIdsBuilt = true
      }
      return scopeProcessIdsByScope.get(scope) ?? new Set<string>()
    },
  }

  const taskScopes: ScopeNode[] = []
  collectTaskScopes(root, taskScopes)
  const summaryEntries = sortScopesBySeq(taskScopes).map((scope) => ({
    seq: scope.seq,
    summary: summarizeTaskScope(scope, summaryOptions),
  }))

  // 根资源伪任务的 entry/status 由 flow 汇总得出，复用完整投影保证与 consumeTasks 一致；
  // 它只有「根级连续 resource_loading」分组，数量极小。
  const rootResourceEntries = collectRootResourceScopeGroups(root)
    .map((groupedScopes, groupIndex) =>
      projectRootResourceTaskEntry(groupedScopes, summaryOptions, groupIndex),
    )
    .filter((entry): entry is ProjectedTaskEntry => !!entry)
    .map((entry) => ({ seq: entry.seq, summary: toTaskSummaryFromTask(entry.task) }))

  const projected = mergeProjectedTaskEntries(summaryEntries, rootResourceEntries)
    .map(({ summary }) => summary)
    .filter((summary) => summary.entry !== 'MaaTaskerPostStop')

  return applyMirroredOrphanMergeToSummaries(projected, options.mirrorProcessPairs)
}

const summarizeTaskScope = (
  scope: ScopeNode,
  options: InternalProjectTasksFromTraceOptions,
): TaskSummary => {
  const payload = readScopePayload(scope)
  const pipelineScopes = sortScopesBySeq(scope.children).filter(
    (child) => child.kind === 'pipeline_node',
  )
  // 与 projectTaskScope 的三级兜底保持一致：field 是事实，节点名与作用域名是推断。
  const fieldEntry = readStringField(payload, 'entry')
  const nodeEntry = pipelineScopes[0] ? readScopeName(pipelineScopes[0]) : undefined
  const entry = fieldEntry ?? nodeEntry ?? readScopeName(scope)
  const entrySource: TaskSummary['entry_source'] =
    fieldEntry != null ? 'field' : nodeEntry != null ? 'node' : 'scope'

  const openedByTaskStarting = payload.taskStartingSeen === true || isOpenedByTaskStarting(scope)
  const everImplicit = payload.truncatedStart === true || payload.implicitTask === true
  const ownerProcessIds = collectTaskOwnerProcessIds(scope, options)

  return {
    task_id: readScopeTaskId(scope) ?? 0,
    entry,
    entry_source: entrySource,
    process_id: readScopeStartEvent(scope)?.processId,
    process_ids: ownerProcessIds.size > 0 ? [...ownerProcessIds].sort() : undefined,
    task_execution_id: scope.id,
    has_starting_event: openedByTaskStarting,
    rotation_gap: everImplicit,
    truncated_start: everImplicit && !openedByTaskStarting,
    start_time: scope.ts,
    end_time: scope.endTs,
    status: toTaskStatus(scope.status),
    duration: buildDuration(scope.ts, scope.endTs),
    node_count: pipelineScopes.length,
  }
}

const toTaskSummaryFromTask = (task: TaskInfo): TaskSummary => ({
  task_id: task.task_id,
  entry: task.entry,
  entry_source: task.entry_source,
  process_id: task.process_id,
  process_ids: task.process_ids,
  task_execution_id: task.task_execution_id ?? `task:${task.task_id}:seq${task._startEventIndex ?? 0}`,
  has_starting_event: task.has_starting_event,
  rotation_gap: task.rotation_gap,
  truncated_start: task.truncated_start,
  start_time: task.start_time,
  end_time: task.end_time,
  status: task.status,
  duration: task.duration,
  node_count: task.nodes.length,
})
