import { markRaw } from 'vue'
import type {
  EventNotification,
  TaskInfo,
  NodeInfo,
  NextListItem,
  RecognitionAttempt,
  NestedActionGroup,
  NestedActionNode,
  UnifiedFlowItem,
} from '../types'
import { StringPool } from './stringPool'
import { buildActionFlowItems, buildRecognitionFlowItems } from './nodeFlow'
import {
  decodeCompactActionDetails,
  decodeCompactNodeDetails,
  decodeEventIdentityIds,
  parseNumericArray,
  parseRoi,
  parseWaitFreezesParam,
  readNumberField,
  readStringField,
} from './logEventDecoders'
import {
  isTaskTerminalPhase,
  parseMaaMessageMeta,
  resolveTaskLifecyclePhase,
  resolveTaskTerminalStatus,
  resolveTerminalCompletionStatus,
  toKnownMaaPhase,
  type KnownMaaPhase,
  type MaaMessageMeta,
  type TaskTerminalPhase,
} from './logParserEventMeta'
import {
  handleTaskLifecycleMetaEvent,
  resolveEventTaskId,
  resolveTaskLifecycleEventDetails,
  type TaskLifecycleMetaEventContext,
} from './logParserTaskLifecycle'
import {
  SubTaskCollector,
  summarizeRuntimeStatus,
  type SubTaskActionSnapshot,
} from './logParserSubTaskCollector'
import { parseEventLine as parseMaaEventLine, type ParsedEventLine } from './logParserEventLine'
import {
  resolveActionDetailsActionId,
  resolveActionEventName,
  resolveActionNodeEventId,
  resolveRuntimeStatusFromPhase,
  resolveSubTaskActionKey,
} from './logParserActionHelpers'
import { createRecognitionAttemptHelpers } from './logParserRecognitionHelpers'
import {
  attachActionLevelRecognitionAcrossScopes,
  cloneNestedActionGroup,
  resolveFallbackRecoDetails,
  splitRecognitionAttemptsByActionWindow,
} from './logParserRecognitionScopeHelpers'
import { nestSubTaskActionGroups } from './logParserSubTaskNestingHelpers'
import {
  applySubTaskSnapshotStarting,
  applySubTaskSnapshotTerminal,
  getOrCreateSubTaskSnapshot,
  mergeSubTaskActionGroupWithSnapshot,
  type SubTaskSnapshot,
} from './logParserSubTaskSnapshotHelpers'
import {
  buildWaitFreezesFlowItems,
  upsertWaitFreezesState,
} from './logParserWaitFreezesHelpers'
import {
  partitionActionScopeWaitFreezes,
  sortFlowItemsByTimestamp,
  splitAndAttachWaitFreezesFlowItems,
} from './logParserFlowAssemblyHelpers'
import {
  clearTaskNodeAggregation,
  getOrCreateTaskNodeAggregation,
  getTaskNextList,
  resetTaskNodeAggregation,
  setTaskNextList,
  type TaskScopedNodeAggregation,
} from './logParserTaskScopedAggregationHelpers'

export interface ParseProgress {
  current: number
  total: number
  percentage: number
}

/**
 * 强制复制字符串，避免 V8 sliced string 长时间持有整段日志 backing store。
 * 说明：日志很大时，子串若不复制可能导致旧日志内容在多次重载后难以及时释放。
 */
const forceCopyString = (value: string): string => {
  if (!value) return ''
  let copied = ''
  for (let i = 0; i < value.length; i += 1) {
    copied += String.fromCharCode(value.charCodeAt(i))
  }
  return copied
}

export class LogParser {
  private events: EventNotification[] = []
  private messageMetaCache = new Map<string, MaaMessageMeta>()
  private stringPool = new StringPool()
  private eventTokenPool = new Map<string, string>()
  private taskProcessMap = new Map<number, string>()
  private taskThreadMap = new Map<number, string>()
  private lastEventBySignature = new Map<string, {
    timestampMs: number
    processId: string
    threadId: string
  }>()
  private dedupSignatureTimeline: Array<{ signature: string; timestampMs: number }> = []
  private dedupSignatureTimelineHead = 0
  private syntheticLineNumber = 1
  private errorImages = new Map<string, string>()
  private visionImages = new Map<string, string>()
  private waitFreezesImages = new Map<string, string>()

  /**
   * 设置错误截图映射
   */
  setErrorImages(images: Map<string, string>): void {
    this.errorImages = images
  }

  /**
   * 设置 vision 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
   */
  setVisionImages(images: Map<string, string>): void {
    this.visionImages = images
  }

  /**
   * 设置 wait_freezes 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
   */
  setWaitFreezesImages(images: Map<string, string>): void {
    this.waitFreezesImages = images
  }

  resetParsedEvents(): void {
    this.events = []
    this.messageMetaCache.clear()
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()
    this.lastEventBySignature.clear()
    this.dedupSignatureTimeline = []
    this.dedupSignatureTimelineHead = 0
    this.eventTokenPool.clear()
    this.syntheticLineNumber = 1
    this.stringPool.clear()
  }

  private getCachedMaaMessageMeta(message: string): MaaMessageMeta {
    const cached = this.messageMetaCache.get(message)
    if (cached) return cached
    const parsed = parseMaaMessageMeta(message)
    this.messageMetaCache.set(message, parsed)
    return parsed
  }

  private pruneDedupSignatures(currentTimestampMs: number): void {
    if (!Number.isFinite(currentTimestampMs)) return
    const pruneBefore = currentTimestampMs - 100
    while (this.dedupSignatureTimelineHead < this.dedupSignatureTimeline.length) {
      const item = this.dedupSignatureTimeline[this.dedupSignatureTimelineHead]
      if (!item || !Number.isFinite(item.timestampMs) || item.timestampMs >= pruneBefore) {
        break
      }
      const mapped = this.lastEventBySignature.get(item.signature)
      if (mapped && mapped.timestampMs === item.timestampMs) {
        this.lastEventBySignature.delete(item.signature)
      }
      this.dedupSignatureTimelineHead += 1
    }

    if (
      this.dedupSignatureTimelineHead > 4096 &&
      this.dedupSignatureTimelineHead * 2 >= this.dedupSignatureTimeline.length
    ) {
      this.dedupSignatureTimeline = this.dedupSignatureTimeline.slice(this.dedupSignatureTimelineHead)
      this.dedupSignatureTimelineHead = 0
    }
  }

  private internEventToken(raw: string): string {
    const copied = forceCopyString(raw)
    const pooled = this.eventTokenPool.get(copied)
    if (pooled) return pooled
    this.eventTokenPool.set(copied, copied)
    return copied
  }

  private appendEvent(event: EventNotification & { processId: string; threadId: string; _dedupSignature: string; _timestampMs: number }): void {
    this.pruneDedupSignatures(event._timestampMs)
    const previous = this.lastEventBySignature.get(event._dedupSignature)
    const eventMs = event._timestampMs
    const nearInTime = previous && Number.isFinite(previous.timestampMs) && Number.isFinite(eventMs)
      ? Math.abs(eventMs - previous.timestampMs) <= 10
      : false
    const fromDifferentSource = previous
      ? previous.processId !== event.processId || previous.threadId !== event.threadId
      : false
    if (previous && nearInTime && fromDifferentSource) {
      return
    }

    const storedEvent: EventNotification = {
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      details: event.details,
      _lineNumber: event._lineNumber,
    }
    this.events.push(storedEvent)
    this.lastEventBySignature.set(event._dedupSignature, {
      timestampMs: eventMs,
      processId: event.processId,
      threadId: event.threadId,
    })
    if (Number.isFinite(eventMs)) {
      this.dedupSignatureTimeline.push({
        signature: event._dedupSignature,
        timestampMs: eventMs,
      })
    }

    const eventMeta = this.getCachedMaaMessageMeta(event.message)
    const taskLifecyclePhase = resolveTaskLifecyclePhase(eventMeta)
    const lifecycleDetails = resolveTaskLifecycleEventDetails(event.details)
    if (taskLifecyclePhase === 'Starting' && lifecycleDetails.task_id != null) {
      if (!this.taskProcessMap.has(lifecycleDetails.task_id)) {
        this.taskProcessMap.set(lifecycleDetails.task_id, event.processId)
        this.taskThreadMap.set(lifecycleDetails.task_id, event.threadId)
      }
    }
  }

  appendRealtimeLines(lines: string[]): void {
    if (!Array.isArray(lines) || lines.length === 0) return

    for (const rawLine of lines) {
      const lineNum = this.syntheticLineNumber++
      if (!rawLine || !rawLine.includes('!!!OnEventNotify!!!')) continue
      try {
        const event = this.parseEventLine(rawLine.trim(), lineNum)
        if (!event) continue
        this.appendEvent(event)
      } catch (e) {
        console.warn(`解析实时事件行失败(line=${lineNum}):`, e)
      }
    }
  }

  /**
   * 解析日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<void> {
    this.resetParsedEvents()
    const totalChars = content.length
    const chunkLineCount = 1000
    let cursor = 0
    let lineNum = 0

    if (totalChars === 0) {
      if (onProgress) {
        onProgress({
          current: 0,
          total: 0,
          percentage: 100
        })
      }
      return
    }

    while (cursor <= totalChars) {
      await new Promise(resolve => setTimeout(resolve, 0))
      let parsedLines = 0

      while (parsedLines < chunkLineCount && cursor <= totalChars) {
        const lineStart = cursor
        let lineEnd = content.indexOf('\n', lineStart)
        if (lineEnd < 0) lineEnd = totalChars
        const rawLine = content.slice(lineStart, lineEnd)
        cursor = lineEnd < totalChars ? lineEnd + 1 : totalChars + 1
        parsedLines += 1
        lineNum += 1

        if (!rawLine || !rawLine.includes('!!!OnEventNotify!!!')) continue

        try {
          const event = this.parseEventLine(rawLine.trim(), lineNum)
          if (!event) continue
          this.appendEvent(event)
        } catch (e) {
          console.warn(`解析第 ${lineNum} 行失败:`, e)
        }
      }

      if (onProgress) {
        const current = Math.min(cursor, totalChars)
        onProgress({
          current,
          total: totalChars,
          percentage: Math.round((current / totalChars) * 100)
        })
      }
    }
  }

  /**
   * 直接从事件行提取所有需要的字段
   * 格式: [timestamp][level][Pxpid][Txthread][...] !!!OnEventNotify!!! [handle=xxx] [msg=EventName] [details={...json...}]
   */
  private parseEventLine(
    line: string,
    lineNum: number
  ): ParsedEventLine | null {
    return parseMaaEventLine(line, lineNum, {
      internEventToken: (raw) => this.internEventToken(raw),
      forceCopyString,
    })
  }

  private settleRunningFlowItems(
    items: UnifiedFlowItem[] | undefined,
    fallbackStatus: 'success' | 'failed'
  ): void {
    if (!items || items.length === 0) return
    for (const item of items) {
      if (item.status === 'running') {
        item.status = fallbackStatus
      }
      if (item.children && item.children.length > 0) {
        this.settleRunningFlowItems(item.children, fallbackStatus)
      }
    }
  }

  private settleCompletedTaskNodes(task: TaskInfo): void {
    if (task.status === 'running') return
    const fallbackStatus: 'success' | 'failed' = task.status === 'succeeded' ? 'success' : 'failed'
    const fallbackTimestamp = task.end_time || task.start_time
    for (const node of task.nodes) {
      if (node.status === 'running') {
        node.status = fallbackStatus
        node.end_ts = node.end_ts || fallbackTimestamp
        if (node.action_details) {
          node.action_details = markRaw({
            ...node.action_details,
            success: fallbackStatus === 'success',
            end_ts: node.action_details.end_ts || node.end_ts,
          })
        }
      }
      this.settleRunningFlowItems(node.node_flow, fallbackStatus)
    }
  }

  private normalizeTaskEventListItem(raw: unknown): { name: string; anchor: boolean; jump_back: boolean } | null {
    if (!raw || typeof raw !== 'object') return null
    const item = raw as Record<string, unknown>
    const name = typeof item.name === 'string' ? this.stringPool.intern(item.name) : ''
    if (!name) return null
    return {
      name,
      anchor: item.anchor === true,
      jump_back: item.jump_back === true,
    }
  }

  private compactTaskEventDetails(message: string, details: Record<string, any>): Record<string, any> {
    const compact: Record<string, any> = {}

    const ids = decodeEventIdentityIds(details)
    if (ids.task_id != null) compact.task_id = ids.task_id
    if (ids.node_id != null) compact.node_id = ids.node_id
    if (ids.reco_id != null) compact.reco_id = ids.reco_id
    if (ids.action_id != null) compact.action_id = ids.action_id

    const name = readStringField(details, 'name')
    if (name != null) compact.name = this.stringPool.intern(name)
    const entry = readStringField(details, 'entry')
    if (entry != null) compact.entry = this.stringPool.intern(entry)
    const status = readStringField(details, 'status')
    if (status != null) compact.status = this.stringPool.intern(status)
    const error = readStringField(details, 'error')
    if (error != null) compact.error = this.stringPool.intern(error)
    const reason = readStringField(details, 'reason')
    if (reason != null) compact.reason = this.stringPool.intern(reason)
    const uuid = readStringField(details, 'uuid')
    if (uuid != null) compact.uuid = this.stringPool.intern(uuid)
    const hash = readStringField(details, 'hash')
    if (hash != null) compact.hash = this.stringPool.intern(hash)
    const action = readStringField(details, 'action')
    if (action != null) compact.action = this.stringPool.intern(action)
    const anchor = readStringField(details, 'anchor')
    if (anchor != null) compact.anchor = this.stringPool.intern(anchor)

    if (message.startsWith('Node.WaitFreezes.')) {
      if (ids.wf_id != null) compact.wf_id = ids.wf_id
      const phase = readStringField(details, 'phase')
      if (phase != null) compact.phase = this.stringPool.intern(phase)
      const elapsed = readNumberField(details, 'elapsed')
      if (elapsed != null) compact.elapsed = elapsed
      if (Object.prototype.hasOwnProperty.call(details, 'focus')) {
        const rawFocus = details.focus
        compact.focus = (rawFocus != null && typeof rawFocus === 'object')
          ? markRaw(rawFocus)
          : rawFocus
      }

      const recoIds = parseNumericArray(details.reco_ids)
      if (recoIds) compact.reco_ids = markRaw(recoIds)

      const roi = parseRoi(details.roi)
      if (roi) compact.roi = markRaw(roi)

      const param = parseWaitFreezesParam(details.param)
      if (param) compact.param = markRaw(param)
    }

    if (Array.isArray(details.list)) {
      const list = details.list
        .map((item: unknown) => this.normalizeTaskEventListItem(item))
        .filter((item): item is { name: string; anchor: boolean; jump_back: boolean } => item != null)
      if (list.length > 0) {
        compact.list = markRaw(list)
      }
    }

    if (details.action_details && typeof details.action_details === 'object') {
      const parsed = decodeCompactActionDetails(details.action_details)
      if (parsed) {
        const actionDetails: Record<string, unknown> = {}
        if (parsed.action_id != null) actionDetails.action_id = parsed.action_id
        if (parsed.action != null) actionDetails.action = this.stringPool.intern(parsed.action)
        if (parsed.name != null) actionDetails.name = this.stringPool.intern(parsed.name)
        if (parsed.success != null) actionDetails.success = parsed.success
        compact.action_details = markRaw(actionDetails)
      }
    }

    if (details.node_details && typeof details.node_details === 'object') {
      const parsed = decodeCompactNodeDetails(details.node_details)
      if (parsed) {
        const nodeDetails: Record<string, unknown> = {}
        if (parsed.action_id != null) nodeDetails.action_id = parsed.action_id
        if (parsed.node_id != null) nodeDetails.node_id = parsed.node_id
        compact.node_details = markRaw(nodeDetails)
      }
    }

    return markRaw(compact)
  }

  /**
   * 获取所有任务
   */
  private buildTasks(consume: boolean): TaskInfo[] {
    const tasks: TaskInfo[] = []

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      const { message, details } = event
      const meta = this.getCachedMaaMessageMeta(message)
      const taskLifecyclePhase = resolveTaskLifecyclePhase(meta)
      const lifecycleDetails = resolveTaskLifecycleEventDetails(details)

      if (taskLifecyclePhase === 'Starting') {
        const taskId = lifecycleDetails.task_id
        const uuid = lifecycleDetails.uuid

        const isDuplicate = tasks.some(t =>
          t.uuid === uuid && t.task_id === taskId && !t.end_time
        )

        if (taskId && !isDuplicate) {
          tasks.push({
            task_id: taskId,
            entry: this.stringPool.intern(lifecycleDetails.entry),
            hash: this.stringPool.intern(lifecycleDetails.hash),
            uuid: this.stringPool.intern(uuid),
            start_time: this.stringPool.intern(event.timestamp),
            status: 'running',
            nodes: [],
            events: [],
            duration: undefined,
            _startEventIndex: i
          })
        }
      } else if (taskLifecyclePhase && isTaskTerminalPhase(taskLifecyclePhase)) {
        const taskId = lifecycleDetails.task_id
        const uuid = lifecycleDetails.uuid

        let matchedTask = null
        if (uuid && uuid.trim() !== '') {
          matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
        } else {
          matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
        }

        if (matchedTask) {
          matchedTask.status = resolveTaskTerminalStatus(taskLifecyclePhase)
          matchedTask.end_time = this.stringPool.intern(event.timestamp)
          matchedTask._endEventIndex = i

          if (matchedTask.start_time && matchedTask.end_time) {
            const start = new Date(matchedTask.start_time).getTime()
            const end = new Date(matchedTask.end_time).getTime()
            matchedTask.duration = end - start
          }
        }
      }
    }

    for (const task of tasks) {
      task.nodes = this.getTaskNodes(task)
      this.settleCompletedTaskNodes(task)
      const taskStartIndex = task._startEventIndex ?? -1
      const taskEndIndex = task._endEventIndex ?? this.events.length - 1
      if (taskStartIndex >= 0) {
        task.events = this.events
          .slice(taskStartIndex, taskEndIndex + 1)
          .filter(event => resolveEventTaskId(event.details) === task.task_id)
          .map((event) => ({
            timestamp: event.timestamp,
            level: event.level,
            message: event.message,
            details: this.compactTaskEventDetails(event.message, event.details ?? {}),
            _lineNumber: event._lineNumber,
          }))
      }

      if (task.status === 'running' && task.nodes.length > 0) {
        const lastNode = task.nodes[task.nodes.length - 1]
        const start = new Date(task.start_time).getTime()
        const end = new Date(lastNode.end_ts || lastNode.ts).getTime()
        task.duration = end - start
      }
    }

    if (consume) {
      this.events = []
      this.messageMetaCache.clear()
      this.lastEventBySignature.clear()
      this.dedupSignatureTimeline = []
      this.dedupSignatureTimelineHead = 0
      this.syntheticLineNumber = 1
      console.log(`字符串池统计: ${this.stringPool.size()} 个唯一字符串`)
      this.stringPool.clear()
    }

    return tasks.filter(task => task.entry !== 'MaaTaskerPostStop')
  }

  getTasksSnapshot(): TaskInfo[] {
    return this.buildTasks(false)
  }

  getTasks(): TaskInfo[] {
    return this.buildTasks(true)
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []
    const pipelineNodesById = new Map<number, NodeInfo>()
    let activePipelineNodeId: number | null = null

    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? this.events.length - 1
    if (taskStartIndex === -1) return []

    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    type ScopedSimpleNodeEventHandler = (
      taskId: number | null,
      messageMeta: MaaMessageMeta,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ) => boolean
    type ScopedActionEventHandler = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ) => void
    type ScopedActionNodeEventHandler = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ) => void
    type ScopedPipelineNodeStartingHandler = (
      taskId: number | null,
      details: Record<string, any>,
      timestamp: string
    ) => void
    type ScopedPipelineNodeFinalizeHandler = (
      taskId: number | null,
      details: Record<string, any>,
      phase: TaskTerminalPhase,
      timestamp: string
    ) => void
    type ScopedNodeDispatchConfig = {
      handleSimpleNodeEvent: ScopedSimpleNodeEventHandler
      dispatchPendingRecognition: (taskId: number, recognition: RecognitionAttempt) => void
      dispatchStandaloneRecognition: (taskId: number, recognition: RecognitionAttempt) => void
      handlePipelineNodeStarting: ScopedPipelineNodeStartingHandler
      handlePipelineNodeFinalize: ScopedPipelineNodeFinalizeHandler
      excludeTaskIdFromParentRecognitionLookup?: boolean
      dispatchDetachedRecognition?: (recognition: RecognitionAttempt) => void
    }

    // 当前节点的累积状态
    const taskScopedNodeAggregationByTaskId = new Map<number, TaskScopedNodeAggregation>()
    const currentTaskRecognitions: RecognitionAttempt[] = []
    const actionLevelRecognitionNodes: RecognitionAttempt[] = []
    const nestedActionNodes: NestedActionNode[] = []
    const pipelineNodeStartTimes = new Map<number, string>()
    const recognitionNodeStartTimes = new Map<number, string>()
    const activeRecognitionNodeAttempts = new Map<string, RecognitionAttempt>()
    const actionStartTimes = new Map<number, string>()
    const actionEndTimes = new Map<number, string>()
    const actionStartOrders = new Map<number, number>()
    const actionEndOrders = new Map<number, number>()
    const actionNodeStartTimes = new Map<number, string>()
    const actionRuntimeStates = new Map<number, {
      action_id: number
      name: string
      ts: string
      end_ts?: string
      status: 'running' | 'success' | 'failed'
      order: number
    }>()
    const activeSubTaskActionNodes = new Map<string, NestedActionNode>()
    const subTaskPipelineNodeStartTimes = new Map<string, string>()
    const subTaskRecognitionNodeStartTimes = new Map<string, string>()
    const subTaskActionStartTimes = new Map<string, string>()
    const subTaskActionEndTimes = new Map<string, string>()
    const subTaskActionStartOrders = new Map<string, number>()
    const subTaskActionEndOrders = new Map<string, number>()
    const subTaskActionNodeStartTimes = new Map<string, string>()
    const subTaskSnapshots = new Map<number, SubTaskSnapshot>()
    const subTaskParentByTaskId = new Map<number, number>()
    let syntheticSubTaskPipelineNodeId = -1
    const activeTaskStack: number[] = [task.task_id]
    const activeRecognitionAttempts = new Map<string, RecognitionAttempt>()
    const activeRecognitionStack: Array<{ taskId: number; recoId: number }> = []
    const finishedRecognitionKeys = new Set<string>()
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()
    const {
      attachNodeToAttempt,
      attachRecognitionNodesToAttempts,
      cloneRecognitionAttempt,
      dedupeRecognitionAttempts,
      pickBestAttemptIndex,
      sortByParseOrderThenRecoId,
    } = createRecognitionAttemptHelpers(recognitionOrderMeta)

    const scopedKey = (taskId: number, id: number): string => `${taskId}:${id}`
    const toTimestampMs = (value?: string): number => {
      if (!value) return Number.POSITIVE_INFINITY
      const normalized = value.includes(' ') ? value.replace(' ', 'T') : value
      const parsed = Date.parse(normalized)
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
    }
    const removeFromActiveTaskStack = (taskId: number) => {
      for (let i = activeTaskStack.length - 1; i >= 0; i--) {
        if (activeTaskStack[i] === taskId) {
          activeTaskStack.splice(i, 1)
          return
        }
      }
    }
    const pushActiveTask = (taskId: number) => {
      removeFromActiveTaskStack(taskId)
      activeTaskStack.push(taskId)
    }
    const peekActiveTask = (): number => {
      return activeTaskStack.length > 0
        ? activeTaskStack[activeTaskStack.length - 1]
        : task.task_id
    }
    const popActiveTask = (taskId: number) => {
      removeFromActiveTaskStack(taskId)
      if (activeTaskStack.length === 0) {
        activeTaskStack.push(task.task_id)
      }
    }
    const withActionTimestamps = (
      actionDetails: any,
      startTimestamp?: string,
      endTimestamp?: string,
      fallbackEndTimestamp?: string
    ) => {
      if (!actionDetails) return undefined
      const resolvedEnd = endTimestamp ?? actionDetails.end_ts ?? fallbackEndTimestamp
      const resolvedStart = startTimestamp ?? actionDetails.ts ?? resolvedEnd
      return markRaw({
        ...actionDetails,
        ...(resolvedStart ? { ts: this.stringPool.intern(resolvedStart) } : {}),
        ...(resolvedEnd ? { end_ts: this.stringPool.intern(resolvedEnd) } : {})
      })
    }
    const toNextListItems = (list: unknown[]): NextListItem[] => {
      return list.map((rawItem: unknown) => {
        const item = rawItem && typeof rawItem === 'object'
          ? rawItem as Partial<NextListItem>
          : {}
        return {
          name: this.stringPool.intern(item.name || ''),
          anchor: item.anchor || false,
          jump_back: item.jump_back || false
        }
      })
    }
    const parseRecognitionAnchorName = (details: Record<string, any>): string | undefined => {
      if (typeof details.anchor !== 'string') return undefined
      const trimmed = details.anchor.trim()
      if (!trimmed) return undefined
      return this.stringPool.intern(trimmed)
    }
    const resolveEventFocus = (details: Record<string, any>, fallback?: NodeInfo['focus']) => {
      if (!Object.prototype.hasOwnProperty.call(details, 'focus')) return fallback
      if (details.focus == null) return fallback
      return markRaw(details.focus)
    }
    const removeFromActiveRecognitionStack = (taskId: number, recoId: number) => {
      for (let i = activeRecognitionStack.length - 1; i >= 0; i--) {
        const frame = activeRecognitionStack[i]
        if (frame.taskId === taskId && frame.recoId === recoId) {
          activeRecognitionStack.splice(i, 1)
          return
        }
      }
    }
    const normalizeRecoId = (value: unknown): number | null => {
      const recoId = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(recoId) ? recoId : null
    }
    const resolveRecognitionNodeRecoId = (details: Record<string, any>): number | null => {
      return normalizeRecoId(
        details.reco_details?.reco_id ??
        details.reco_id ??
        details.node_details?.reco_id
      )
    }
    const startRecognitionAttempt = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ): RecognitionAttempt | undefined => {
      const recoId = normalizeRecoId(details.reco_id)
      if (recoId == null) return undefined
      const key = scopedKey(taskId, recoId)
      if (finishedRecognitionKeys.has(key)) return undefined
      const existing = activeRecognitionAttempts.get(key)
      if (existing) {
        const parsedAnchorName = parseRecognitionAnchorName(details)
        if (parsedAnchorName && !existing.anchor_name) {
          existing.anchor_name = parsedAnchorName
        }
        return existing
      }

      const startTimestamp = this.stringPool.intern(timestamp)
      const parsedAnchorName = parseRecognitionAnchorName(details)
      const attempt: RecognitionAttempt = {
        reco_id: recoId,
        name: this.stringPool.intern(details.name || ''),
        ts: startTimestamp,
        end_ts: startTimestamp,
        status: 'running',
        ...(parsedAnchorName ? { anchor_name: parsedAnchorName } : {}),
      }
      recognitionOrderMeta.set(attempt, { startSeq: eventOrder, endSeq: eventOrder })
      activeRecognitionAttempts.set(key, attempt)
      activeRecognitionStack.push({ taskId, recoId })
      return attempt
    }
    const finishRecognitionAttempt = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number
    ): RecognitionAttempt | undefined => {
      const recoId = normalizeRecoId(details.reco_id)
      if (recoId == null) return undefined
      const key = scopedKey(taskId, recoId)
      if (finishedRecognitionKeys.has(key)) return undefined

      const endTimestamp = this.stringPool.intern(timestamp)
      const existing = activeRecognitionAttempts.get(key)
      const attempt: RecognitionAttempt = existing ?? {
        reco_id: recoId,
        name: this.stringPool.intern(details.name || ''),
        ts: endTimestamp,
        end_ts: endTimestamp,
        status,
      }

      attempt.status = status
      attempt.name = attempt.name || this.stringPool.intern(details.name || '')
      attempt.ts = attempt.ts || endTimestamp
      attempt.end_ts = endTimestamp
      if (!attempt.anchor_name) {
        const parsedAnchorName = parseRecognitionAnchorName(details)
        if (parsedAnchorName) {
          attempt.anchor_name = parsedAnchorName
        }
      }
      if (details.reco_details) {
        attempt.reco_details = markRaw(details.reco_details)
      }
      attempt.error_image = this.findRecognitionImage(timestamp, details.name || '')
      attempt.vision_image = this.findVisionImage(timestamp, details.name || '', recoId)

      const existingMeta = recognitionOrderMeta.get(attempt)
      recognitionOrderMeta.set(attempt, {
        startSeq: existingMeta?.startSeq ?? eventOrder,
        endSeq: eventOrder
      })

      activeRecognitionAttempts.delete(key)
      removeFromActiveRecognitionStack(taskId, recoId)
      finishedRecognitionKeys.add(key)
      return attempt
    }
    const ensureRecognitionNodeAttempt = (
      taskId: number,
      recoId: number,
      details: Record<string, any>,
      startTimestamp: string,
      eventOrder: number
    ): RecognitionAttempt => {
      const nodeKey = scopedKey(taskId, recoId)
      let attempt = activeRecognitionNodeAttempts.get(nodeKey)
      if (attempt) return attempt

      attempt = {
        reco_id: recoId,
        name: this.stringPool.intern(details.name || ''),
        ts: startTimestamp,
        end_ts: startTimestamp,
        status: 'running',
        reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
      }
      activeRecognitionNodeAttempts.set(nodeKey, attempt)
      recognitionOrderMeta.set(attempt, { startSeq: eventOrder, endSeq: eventOrder })
      return attempt
    }
    const completeRecognitionNodeAttempt = (
      attempt: RecognitionAttempt,
      recoId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number,
      startTimestamp: string
    ) => {
      const endTimestamp = this.stringPool.intern(timestamp)
      attempt.name = this.stringPool.intern(details.name || attempt.name || '')
      attempt.ts = attempt.ts || startTimestamp
      attempt.end_ts = endTimestamp
      attempt.status = status
      attempt.reco_details = details.reco_details ? markRaw(details.reco_details) : attempt.reco_details
      attempt.error_image = this.findRecognitionImage(timestamp, details.name || '')
      attempt.vision_image = this.findVisionImage(timestamp, details.name || '', recoId)
      const existingMeta = recognitionOrderMeta.get(attempt)
      recognitionOrderMeta.set(attempt, {
        startSeq: existingMeta?.startSeq ?? eventOrder,
        endSeq: eventOrder,
      })
    }
    const pushCurrentTaskRecognitionAttempt = (attempt: RecognitionAttempt | undefined) => {
      if (attempt && !currentTaskRecognitions.includes(attempt)) {
        currentTaskRecognitions.push(attempt)
      }
    }
    const handleRecognitionStartEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
    ) => {
      const attempt = startRecognitionAttempt(taskId, details, timestamp, eventOrder)
      if (attempt && onAttempt) {
        onAttempt(taskId, attempt)
      }
    }
    const handleRecognitionFinishEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number,
      onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
    ) => {
      const attempt = finishRecognitionAttempt(taskId, details, timestamp, status, eventOrder)
      if (attempt && onAttempt) {
        onAttempt(taskId, attempt)
      }
    }
    const applyTaskNextList = (taskId: number, list: unknown[]) => {
      const nextList = setTaskNextList(
        taskScopedNodeAggregationByTaskId,
        taskId,
        toNextListItems(list)
      )
      if (taskId === task.task_id) {
        const activeNode = getActivePipelineNode()
        if (activeNode) {
          activeNode.next_list = nextList
        }
      }
    }
    const setRecognitionNodeStartTimestamp = (
      taskId: number,
      recoId: number,
      startTimestamp: string
    ) => {
      if (taskId === task.task_id) {
        recognitionNodeStartTimes.set(recoId, startTimestamp)
        return
      }
      subTaskRecognitionNodeStartTimes.set(scopedKey(taskId, recoId), startTimestamp)
    }
    const startRecognitionNodeEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      excludeParentTaskId?: number,
      dispatchDetachedRecognition?: (attempt: RecognitionAttempt) => void
    ) => {
      const recoId = resolveRecognitionNodeRecoId(details)
      if (recoId == null) return
      const startTimestamp = this.stringPool.intern(timestamp)
      setRecognitionNodeStartTimestamp(taskId, recoId, startTimestamp)
      const recoNodeAttempt = ensureRecognitionNodeAttempt(
        taskId,
        recoId,
        details,
        startTimestamp,
        eventOrder
      )
      const parentRecognition = findActiveParentRecognition(excludeParentTaskId)
      if (parentRecognition && parentRecognition.reco_id !== recoId) {
        attachNodeToAttempt(parentRecognition, recoNodeAttempt)
        return
      }
      if (dispatchDetachedRecognition) {
        dispatchDetachedRecognition(recoNodeAttempt)
      }
    }
    const getRecognitionNodeStartTimestamp = (
      taskId: number,
      recoId: number,
      fallbackTimestamp: string
    ): string => {
      if (taskId === task.task_id) {
        return recognitionNodeStartTimes.get(recoId) || fallbackTimestamp
      }
      return subTaskRecognitionNodeStartTimes.get(scopedKey(taskId, recoId)) || fallbackTimestamp
    }
    const clearRecognitionNodeStartTimestamp = (
      taskId: number,
      recoId: number
    ) => {
      if (taskId === task.task_id) {
        recognitionNodeStartTimes.delete(recoId)
        return
      }
      subTaskRecognitionNodeStartTimes.delete(scopedKey(taskId, recoId))
    }
    const finalizeRecognitionNodeEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number,
      pendingRecognitions: RecognitionAttempt[],
      dispatchPendingRecognition: (taskId: number, attempt: RecognitionAttempt) => void,
      dispatchStandaloneRecognition: (taskId: number, attempt: RecognitionAttempt) => void,
      excludeParentTaskId?: number
    ) => {
      const parentRecognition = findActiveParentRecognition(excludeParentTaskId)
      const normalizedPendingRecognitions = dedupeRecognitionAttempts(pendingRecognitions)

      if (normalizedPendingRecognitions.length > 0) {
        const pendingRecoId = resolveRecognitionNodeRecoId(details)
        const pendingNodeKey = pendingRecoId != null ? scopedKey(taskId, pendingRecoId) : null
        const pendingRecoNodeAttempt = pendingNodeKey
          ? activeRecognitionNodeAttempts.get(pendingNodeKey)
          : undefined
        if (pendingRecoNodeAttempt && pendingRecoId != null) {
          const fallbackStartTimestamp = this.stringPool.intern(timestamp)
          const startTimestamp = getRecognitionNodeStartTimestamp(taskId, pendingRecoId, fallbackStartTimestamp)
          completeRecognitionNodeAttempt(
            pendingRecoNodeAttempt,
            pendingRecoId,
            details,
            timestamp,
            status,
            eventOrder,
            startTimestamp
          )
        }
        for (const recognition of normalizedPendingRecognitions) {
          const resolvedRecognition = (
            pendingRecoId != null &&
            pendingRecoNodeAttempt &&
            recognition.reco_id === pendingRecoId
          ) ? pendingRecoNodeAttempt : recognition
          if (parentRecognition && parentRecognition.reco_id !== recognition.reco_id) {
            attachNodeToAttempt(parentRecognition, resolvedRecognition)
            continue
          }
          dispatchPendingRecognition(taskId, resolvedRecognition)
        }
        if (pendingRecoId != null) {
          activeRecognitionNodeAttempts.delete(scopedKey(taskId, pendingRecoId))
          clearRecognitionNodeStartTimestamp(taskId, pendingRecoId)
        }
        return
      }

      const recoId = resolveRecognitionNodeRecoId(details)
      if (recoId == null) return
      const fallbackStartTimestamp = this.stringPool.intern(timestamp)
      const startTimestamp = getRecognitionNodeStartTimestamp(taskId, recoId, fallbackStartTimestamp)
      const nodeKey = scopedKey(taskId, recoId)
      const recoNodeAttempt: RecognitionAttempt = activeRecognitionNodeAttempts.get(nodeKey) ?? {
        reco_id: recoId,
        name: this.stringPool.intern(details.name || ''),
        ts: startTimestamp,
        end_ts: startTimestamp,
        status: 'running',
      }
      completeRecognitionNodeAttempt(
        recoNodeAttempt,
        recoId,
        details,
        timestamp,
        status,
        eventOrder,
        startTimestamp
      )
      clearRecognitionNodeStartTimestamp(taskId, recoId)
      activeRecognitionNodeAttempts.delete(nodeKey)
      if (parentRecognition && parentRecognition.reco_id !== recoNodeAttempt.reco_id) {
        attachNodeToAttempt(parentRecognition, recoNodeAttempt)
        return
      }
      dispatchStandaloneRecognition(taskId, recoNodeAttempt)
    }
    const hasRecognitionByRecoId = (items: RecognitionAttempt[], recoId: number): boolean => {
      return items.some(item => item.reco_id === recoId)
    }
    const isKnownRecognitionRecoId = (recoId: number): boolean => {
      return hasRecognitionByRecoId(currentTaskRecognitions, recoId) || hasRecognitionByRecoId(actionLevelRecognitionNodes, recoId)
    }
    const pushActionLevelRecognition = (attempt: RecognitionAttempt) => {
      if (isKnownRecognitionRecoId(attempt.reco_id)) return
      actionLevelRecognitionNodes.push(attempt)
    }
    const findActiveParentRecognition = (excludeTaskId?: number): RecognitionAttempt | undefined => {
      for (let i = activeRecognitionStack.length - 1; i >= 0; i--) {
        const frame = activeRecognitionStack[i]
        if (excludeTaskId != null && frame.taskId === excludeTaskId) continue
        const attempt = activeRecognitionAttempts.get(scopedKey(frame.taskId, frame.recoId))
        if (attempt) return attempt
      }
      return undefined
    }
    const resolveFinalNestedActionGroups = (
      taskId: number,
      startTimestamp: string,
      endTimestamp: string,
      groups: NestedActionGroup[]
    ): NestedActionGroup[] => {
      const nestedSubTaskGroups = nestSubTaskActionGroups({
        groups,
        rootTaskId: task.task_id,
        subTaskParentByTaskId,
        toTimestampMs,
        cloneGroup: (group) => cloneNestedActionGroup(group, cloneRecognitionAttempt),
      })
      if (nestedSubTaskGroups.length > 0) {
        return nestedSubTaskGroups
      }
      const fallbackActionGroup = createActionNodeGroup({
        taskId,
        ts: startTimestamp,
        endTs: endTimestamp,
        nestedActions: nestedActionNodes.slice(),
      })
      return fallbackActionGroup ? [fallbackActionGroup] : []
    }
    const getLatestActionRuntimeState = () => {
      let latest: {
        action_id: number
        name: string
        ts: string
        end_ts?: string
        status: 'running' | 'success' | 'failed'
        order: number
      } | null = null
      for (const state of actionRuntimeStates.values()) {
        if (!latest || state.order > latest.order) {
          latest = state
        }
      }
      return latest
    }
    const dedupeNestedActionNodes = (items: NestedActionNode[]) => {
      const seen = new Set<string>()
      const result: NestedActionNode[] = []
      for (const item of items) {
        const key = `${item.node_id}|${item.name}|${item.ts}|${item.status}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(item)
      }
      return result
    }
    const createActionNodeGroup = (params: {
      taskId: number
      ts: string
      endTs?: string
      nestedActions: NestedActionNode[]
    }): NestedActionGroup | null => {
      if (params.nestedActions.length === 0) return null
      return {
        task_id: params.taskId,
        name: this.stringPool.intern('ActionNode'),
        ts: params.ts,
        end_ts: params.endTs,
        status: summarizeRuntimeStatus(params.nestedActions),
        nested_actions: params.nestedActions,
      }
    }
    const summarizeActionFlowStatus = (
      items: UnifiedFlowItem[]
    ): 'success' | 'failed' | 'running' | null => {
      if (items.length === 0) return null
      return summarizeRuntimeStatus(items)
    }
    const createActionRootFlowItem = (params: {
      actionId: number
      name: string
      status: UnifiedFlowItem['status']
      ts: string
      endTs?: string
      actionDetails?: NodeInfo['action_details']
      errorImage?: string
    }): UnifiedFlowItem => {
      return {
        id: `node.action.${params.actionId}`,
        type: 'action',
        name: params.name,
        status: params.status,
        ts: params.ts,
        end_ts: params.endTs,
        action_id: params.actionId,
        action_details: params.actionDetails,
        error_image: params.errorImage,
      }
    }
    const createFinalActionRootFactory = (params: {
      actionDetails?: NodeInfo['action_details']
      fallbackStatus: 'success' | 'failed'
      eventTimestamp: string
      errorImageCandidates: Array<string | null | undefined>
      fallbackActionId: number | null | undefined
      fallbackName: string
      fallbackTimestamp: string
    }) => {
      return (actionFlow: UnifiedFlowItem[]) => {
        const hasActionRoot = !!params.actionDetails || actionFlow.length > 0
        if (!hasActionRoot) return null

        const actionStatus: 'success' | 'failed' = params.actionDetails
          ? (params.actionDetails.success ? 'success' : 'failed')
          : params.fallbackStatus
        const resolvedActionErrorImage = actionStatus === 'failed'
          ? this.findErrorImageByNames(params.eventTimestamp, params.errorImageCandidates)
          : undefined
        const resolvedActionId = params.actionDetails?.action_id ?? params.fallbackActionId ?? -1
        return createActionRootFlowItem({
          actionId: resolvedActionId,
          name: params.actionDetails?.name || params.fallbackName,
          status: actionStatus,
          ts: params.actionDetails?.ts || params.actionDetails?.end_ts || params.fallbackTimestamp,
          endTs: params.actionDetails?.end_ts,
          actionDetails: params.actionDetails,
          errorImage: resolvedActionErrorImage,
        })
      }
    }
    const composeFinalPipelineNodeFlow = (params: {
      taskId: number
      topLevelRecognitions: RecognitionAttempt[]
      actionLevelRecognitions: RecognitionAttempt[]
      nestedActionGroups: NestedActionGroup[]
      actionDetails?: NodeInfo['action_details']
      fallbackStatus: 'success' | 'failed'
      eventTimestamp: string
      details: Record<string, any>
      nodeName: string
      actionId: number | null | undefined
      nodeId: number | null | undefined
      fallbackTimestamp: string
    }) => {
      return composePipelineNodeFlow({
        topLevelRecognitions: params.topLevelRecognitions,
        actionLevelRecognitions: params.actionLevelRecognitions,
        nestedActionGroups: params.nestedActionGroups,
        waitFreezesFlow: buildWaitFreezesFlowItems(
          taskScopedNodeAggregationByTaskId.get(params.taskId)?.waitFreezesRuntimeStates
        ),
        createActionRoot: createFinalActionRootFactory({
          actionDetails: params.actionDetails,
          fallbackStatus: params.fallbackStatus,
          eventTimestamp: params.eventTimestamp,
          errorImageCandidates: [
            params.actionDetails?.name,
            params.details.action_details?.name,
            params.details.node_details?.name,
            params.details.reco_details?.name,
            params.nodeName,
          ],
          fallbackActionId: params.actionId ?? params.nodeId,
          fallbackName: params.nodeName,
          fallbackTimestamp: params.fallbackTimestamp,
        }),
      })
    }
    const handleSubTaskActionNodeStartingEvent = (
      subTaskId: number,
      details: Record<string, any>,
      timestamp: string
    ) => {
      const actionId = resolveActionNodeEventId(details)
      if (actionId == null) return
      const actionKey = resolveSubTaskActionKey(subTaskId, actionId)!
      const startTimestamp = this.stringPool.intern(timestamp)
      subTaskActionNodeStartTimes.set(actionKey, startTimestamp)
      if (!activeSubTaskActionNodes.has(actionKey)) {
        activeSubTaskActionNodes.set(actionKey, {
          node_id: typeof actionId === 'number' ? actionId : -(nestedActionNodes.length + activeSubTaskActionNodes.size + 1),
          name: this.stringPool.intern(details.name || ''),
          ts: startTimestamp,
          end_ts: startTimestamp,
          status: 'running',
          action_details: withActionTimestamps(details.action_details, startTimestamp, undefined, startTimestamp),
        })
      }
    }
    const handleSubTaskActionNodeFinishedEvent = (
      subTaskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed'
    ) => {
      const actionId = resolveActionNodeEventId(details)
      const actionKey = resolveSubTaskActionKey(subTaskId, actionId)
      const actionNodeStartTimestamp = actionKey ? subTaskActionNodeStartTimes.get(actionKey) : undefined
      const actionStartTimestamp = actionKey ? subTaskActionStartTimes.get(actionKey) : undefined
      const actionEndTimestamp = actionKey ? subTaskActionEndTimes.get(actionKey) : undefined
      const nowTimestamp = this.stringPool.intern(timestamp)
      const runningActionNode = actionKey ? activeSubTaskActionNodes.get(actionKey) : undefined
      const resolvedActionNode: NestedActionNode = runningActionNode ?? {
        node_id: typeof actionId === 'number' ? actionId : -(nestedActionNodes.length + activeSubTaskActionNodes.size + 1),
        name: this.stringPool.intern(details.name || ''),
        ts: actionNodeStartTimestamp || nowTimestamp,
        end_ts: actionEndTimestamp || nowTimestamp,
        status: 'running',
        action_details: undefined,
      }
      resolvedActionNode.name = this.stringPool.intern(details.name || resolvedActionNode.name || '')
      resolvedActionNode.ts = resolvedActionNode.ts || actionNodeStartTimestamp || nowTimestamp
      resolvedActionNode.end_ts = actionEndTimestamp || nowTimestamp
      resolvedActionNode.status = status
      resolvedActionNode.action_details = withActionTimestamps(
        details.action_details,
        actionStartTimestamp || actionNodeStartTimestamp || resolvedActionNode.ts,
        actionEndTimestamp,
        timestamp
      )
      nestedActionNodes.push(resolvedActionNode)
      if (actionKey) {
        subTaskActionNodeStartTimes.delete(actionKey)
        activeSubTaskActionNodes.delete(actionKey)
      }
    }
    const composePipelineNodeFlow = (params: {
      topLevelRecognitions: RecognitionAttempt[]
      actionLevelRecognitions: RecognitionAttempt[]
      nestedActionGroups: NestedActionGroup[]
      waitFreezesFlow: UnifiedFlowItem[]
      createActionRoot: (actionFlow: UnifiedFlowItem[]) => UnifiedFlowItem | null
    }) => {
      const recognitionFlow = buildRecognitionFlowItems(params.topLevelRecognitions)
      const actionFlow = buildActionFlowItems(params.actionLevelRecognitions, params.nestedActionGroups)
      const {
        recognitionFlow: scopedRecognitionFlow,
        actionFlow: scopedActionFlow,
        actionScopeWaitFreezes,
        unassignedContextWaitFreezes,
      } = splitAndAttachWaitFreezesFlowItems({
        recognitionFlow,
        actionFlow,
        waitFreezesFlow: params.waitFreezesFlow,
        toTimestampMs,
      })
      const actionScopeWaitFreezesAll = [...actionScopeWaitFreezes, ...unassignedContextWaitFreezes]

      const actionRootBase = params.createActionRoot(actionFlow)
      const actionRoot: UnifiedFlowItem | null = actionRootBase
        ? {
            ...actionRootBase,
            children: scopedActionFlow.length > 0
              ? sortFlowItemsByTimestamp(
                [
                  ...(actionRootBase.children ?? []),
                  ...scopedActionFlow,
                ],
                toTimestampMs
              )
              : actionRootBase.children,
          }
        : null

      const waitFreezesPlacement = partitionActionScopeWaitFreezes(
        actionScopeWaitFreezesAll,
        toTimestampMs,
        actionRoot?.ts,
        actionRoot?.end_ts,
        actionRoot?.status,
      )
      if (actionRoot && waitFreezesPlacement.inside.length > 0) {
        actionRoot.children = sortFlowItemsByTimestamp(
          [
            ...(actionRoot.children ?? []),
            ...waitFreezesPlacement.inside,
          ],
          toTimestampMs
        )
      }

      const nodeFlow = [
        ...scopedRecognitionFlow,
        ...waitFreezesPlacement.before,
        ...(!actionRoot ? waitFreezesPlacement.inside : []),
        ...(actionRoot ? [actionRoot] : []),
        ...waitFreezesPlacement.after,
      ]

      return {
        nodeFlow,
        actionFlow,
      }
    }
    const refreshActivePipelineNodePreview = (timestamp: string) => {
      const activeNode = getActivePipelineNode()
      if (!activeNode) return

      const nowTimestamp = this.stringPool.intern(timestamp)
      activeNode.end_ts = nowTimestamp
      activeNode.next_list = getTaskNextList(taskScopedNodeAggregationByTaskId, task.task_id)

      const topLevelRecognitions = dedupeRecognitionAttempts(currentTaskRecognitions)
      const actionRecognitions = dedupeRecognitionAttempts(actionLevelRecognitionNodes)
      const runtimeNestedActionNodes = dedupeNestedActionNodes([
        ...nestedActionNodes,
        ...activeSubTaskActionNodes.values(),
      ])

      const runtimeActionGroup = createActionNodeGroup({
        taskId: task.task_id,
        ts: activeNode.ts,
        endTs: nowTimestamp,
        nestedActions: runtimeNestedActionNodes,
      })
      const runtimeNestedActionGroups: NestedActionGroup[] = runtimeActionGroup ? [runtimeActionGroup] : []

      const runtimeActionState = getLatestActionRuntimeState()
      const resolvedActionId =
        runtimeActionState?.action_id ??
        activeNode.action_details?.action_id ??
        activeNode.node_details?.action_id ??
        activeNode.node_id
      const composedFlow = composePipelineNodeFlow({
        topLevelRecognitions,
        actionLevelRecognitions: actionRecognitions,
        nestedActionGroups: runtimeNestedActionGroups,
        waitFreezesFlow: buildWaitFreezesFlowItems(
          taskScopedNodeAggregationByTaskId.get(task.task_id)?.waitFreezesRuntimeStates
        ),
        createActionRoot: (actionFlow) => {
          const inferredActionStatus = summarizeActionFlowStatus(actionFlow)
          const actionRootStatus = runtimeActionState?.status ?? inferredActionStatus
          if (!actionRootStatus) return null

          const runtimeActionErrorImage = actionRootStatus === 'failed'
            ? this.findErrorImageByNames(nowTimestamp, [
                runtimeActionState?.name,
                activeNode.action_details?.name,
                activeNode.node_details?.name,
                activeNode.reco_details?.name,
                activeNode.name,
              ])
            : undefined

          return createActionRootFlowItem({
            actionId: resolvedActionId,
            name:
              runtimeActionState?.name ||
              activeNode.action_details?.name ||
              activeNode.name,
            status: actionRootStatus,
            ts: runtimeActionState?.ts || activeNode.action_details?.ts || activeNode.ts,
            endTs: runtimeActionState?.end_ts || activeNode.action_details?.end_ts || nowTimestamp,
            actionDetails: activeNode.action_details,
            errorImage: runtimeActionErrorImage,
          })
        },
      })

      activeNode.node_flow = composedFlow.nodeFlow

      const fallbackRecoDetails =
        topLevelRecognitions.length > 0
          ? topLevelRecognitions[topLevelRecognitions.length - 1].reco_details
          : undefined
      if (fallbackRecoDetails) {
        activeNode.reco_details = markRaw(fallbackRecoDetails)
      }
    }

    // 子任务事件收集器
    const subTasks = new SubTaskCollector()
    const consumeMatchedSubTaskAction = (subTaskId: number, actionId: number | null | undefined) => {
      const taskActions = subTasks.consumeActions(subTaskId)
      if (taskActions.length === 0) return undefined

      let matchedTaskAction: SubTaskActionSnapshot | undefined
      let matchedTaskActionIndex = -1
      if (actionId != null) {
        for (let i = taskActions.length - 1; i >= 0; i--) {
          if (taskActions[i]?.action_id === actionId) {
            matchedTaskAction = taskActions[i]
            matchedTaskActionIndex = i
            break
          }
        }
      }
      if (!matchedTaskAction) {
        matchedTaskActionIndex = taskActions.length - 1
        matchedTaskAction = taskActions[matchedTaskActionIndex]
      }
      for (let i = 0; i < taskActions.length; i++) {
        if (i === matchedTaskActionIndex) continue
        subTasks.addAction(subTaskId, taskActions[i])
      }
      return matchedTaskAction
    }
    const clearSubTaskRuntimeStateAfterPipelineFinalize = (
      subTaskId: number,
      nodeId: number | null | undefined,
      actionKey: string | null
    ) => {
      if (nodeId != null) {
        subTaskPipelineNodeStartTimes.delete(scopedKey(subTaskId, nodeId))
      }
      if (actionKey) {
        subTaskActionStartTimes.delete(actionKey)
        subTaskActionEndTimes.delete(actionKey)
        subTaskActionStartOrders.delete(actionKey)
        subTaskActionEndOrders.delete(actionKey)
      }
      const scopedPrefix = `${subTaskId}:`
      for (const key of activeSubTaskActionNodes.keys()) {
        if (key.startsWith(scopedPrefix)) {
          activeSubTaskActionNodes.delete(key)
        }
      }
      for (const key of activeRecognitionNodeAttempts.keys()) {
        if (key.startsWith(scopedPrefix)) {
          activeRecognitionNodeAttempts.delete(key)
        }
      }
      clearTaskNodeAggregation(taskScopedNodeAggregationByTaskId, subTaskId)
    }
    const finalizeSubTaskPipelineNodeEvent = (
      subTaskId: number,
      details: Record<string, any>,
      phase: TaskTerminalPhase,
      timestamp: string
    ) => {
      const subTaskPipelineStatus = resolveTerminalCompletionStatus(phase)
      const nodeId = readNumberField(details, 'node_id')
      const resolvedNodeId = nodeId ?? syntheticSubTaskPipelineNodeId--
      const endTimestamp = this.stringPool.intern(timestamp)
      const startTimestamp = nodeId != null
        ? (subTaskPipelineNodeStartTimes.get(scopedKey(subTaskId, nodeId)) || endTimestamp)
        : endTimestamp
      const actionId = resolveActionDetailsActionId(details)
      const actionKey = resolveSubTaskActionKey(subTaskId, actionId)
      const actionStartTimestamp = actionKey ? subTaskActionStartTimes.get(actionKey) : undefined
      const actionEndTimestamp = actionKey ? subTaskActionEndTimes.get(actionKey) : undefined
      const matchedTaskAction = consumeMatchedSubTaskAction(subTaskId, actionId)
      const mergedActionDetails = details.action_details || matchedTaskAction?.action_details
      const mergedActionStartTimestamp = actionStartTimestamp || matchedTaskAction?.ts
      const mergedActionEndTimestamp = actionEndTimestamp || matchedTaskAction?.end_ts
      const taskRecognitions = dedupeRecognitionAttempts(subTasks.consumeRecognitions(subTaskId))
      const recognitionNodes = dedupeRecognitionAttempts(subTasks.consumeRecognitionNodes(subTaskId))
      const attachedRecognitions = attachRecognitionNodesToAttempts(taskRecognitions, recognitionNodes)
      const fallbackRecoDetails = resolveFallbackRecoDetails(details, attachedRecognitions.attempts)
      const resolvedNodeName = this.stringPool.intern(
        details.reco_details?.name || details.action_details?.name || details.name || ''
      )
      const resolvedNextList = getTaskNextList(taskScopedNodeAggregationByTaskId, subTaskId)
      const resolvedActionDetails = withActionTimestamps(
        mergedActionDetails,
        mergedActionStartTimestamp,
        mergedActionEndTimestamp,
        endTimestamp
      )
      const attachedTopLevelRecognitions = attachedRecognitions.attempts.length > 0
        ? attachedRecognitions.attempts
        : attachedRecognitions.orphans
      const attachedNodeRecognitions = attachedRecognitions.attempts.length > 0
        ? attachedRecognitions.attempts
        : (attachedRecognitions.orphans.length > 0 ? attachedRecognitions.orphans : undefined)
      const composedSubTaskFlow = composeFinalPipelineNodeFlow({
        taskId: subTaskId,
        topLevelRecognitions: attachedTopLevelRecognitions,
        actionLevelRecognitions: [],
        nestedActionGroups: [],
        actionDetails: resolvedActionDetails,
        fallbackStatus: subTaskPipelineStatus,
        eventTimestamp: timestamp,
        details,
        nodeName: resolvedNodeName,
        actionId,
        nodeId,
        fallbackTimestamp: endTimestamp,
      })
      const resolvedNodeFlow = composedSubTaskFlow.nodeFlow.length > 0
        ? composedSubTaskFlow.nodeFlow
        : undefined
      subTasks.addPipelineNode(subTaskId, {
        node_id: resolvedNodeId,
        name: resolvedNodeName,
        ts: startTimestamp,
        end_ts: endTimestamp,
        status: subTaskPipelineStatus,
        reco_details: fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined,
        action_details: resolvedActionDetails,
        next_list: resolvedNextList,
        node_flow: resolvedNodeFlow,
        recognitions: attachedNodeRecognitions
      })
      clearSubTaskRuntimeStateAfterPipelineFinalize(subTaskId, nodeId, actionKey)
      refreshActivePipelineNodePreview(timestamp)
    }
    const getActivePipelineNode = (): NodeInfo | null => {
      if (activePipelineNodeId == null) return null
      const node = pipelineNodesById.get(activePipelineNodeId)
      if (!node || node.status !== 'running') return null
      return node
    }
    const resetCurrentNodeAggregation = () => {
      taskScopedNodeAggregationByTaskId.clear()
      resetTaskNodeAggregation(taskScopedNodeAggregationByTaskId, task.task_id)
      currentTaskRecognitions.length = 0
      nestedActionNodes.length = 0
      actionLevelRecognitionNodes.length = 0
      activeRecognitionNodeAttempts.clear()
      actionRuntimeStates.clear()
      activeSubTaskActionNodes.clear()
      subTasks.clear()
      subTaskParentByTaskId.clear()
      activeTaskStack.length = 0
      activeTaskStack.push(task.task_id)
    }
    const settleCurrentNodeRuntimeStates = (
      fallbackStatus: 'success' | 'failed',
      timestamp: string
    ) => {
      const endTimestamp = this.stringPool.intern(timestamp)
      const settleAttempt = (attempt: RecognitionAttempt) => {
        if (attempt.status !== 'running') return
        attempt.status = fallbackStatus
        attempt.end_ts = endTimestamp
      }

      for (const attempt of currentTaskRecognitions) {
        settleAttempt(attempt)
      }
      for (const attempt of actionLevelRecognitionNodes) {
        settleAttempt(attempt)
      }

      const currentTaskKeyPrefix = `${task.task_id}:`
      for (const [key, attempt] of activeRecognitionAttempts.entries()) {
        if (!key.startsWith(currentTaskKeyPrefix)) continue
        settleAttempt(attempt)
        activeRecognitionAttempts.delete(key)
        finishedRecognitionKeys.add(key)
      }
      for (const key of activeRecognitionNodeAttempts.keys()) {
        if (!key.startsWith(currentTaskKeyPrefix)) continue
        const attempt = activeRecognitionNodeAttempts.get(key)
        if (attempt) settleAttempt(attempt)
      }
      for (let i = activeRecognitionStack.length - 1; i >= 0; i--) {
        if (activeRecognitionStack[i].taskId === task.task_id) {
          activeRecognitionStack.splice(i, 1)
        }
      }

      for (const state of actionRuntimeStates.values()) {
        if (state.status !== 'running') continue
        state.status = fallbackStatus
        state.end_ts = endTimestamp
      }
      for (const aggregation of taskScopedNodeAggregationByTaskId.values()) {
        for (const state of aggregation.waitFreezesRuntimeStates.values()) {
          if (state.status !== 'running') continue
          state.status = fallbackStatus
          state.end_ts = endTimestamp
        }
      }

      for (const actionNode of activeSubTaskActionNodes.values()) {
        if (actionNode.status === 'running') {
          actionNode.status = fallbackStatus
          actionNode.end_ts = endTimestamp
        }
        if (!nestedActionNodes.includes(actionNode)) {
          nestedActionNodes.push(actionNode)
        }
      }
    }
    const upsertCurrentTaskPipelineNode = (node: NodeInfo) => {
      const existingNode = pipelineNodesById.get(node.node_id)
      if (existingNode) {
        Object.assign(existingNode, node)
        return existingNode
      }
      nodes.push(node)
      pipelineNodesById.set(node.node_id, node)
      return node
    }
    const cleanupCurrentTaskPipelineRuntimeState = (
      nodeId: number,
      actionId: number | null | undefined
    ) => {
      if (activePipelineNodeId === nodeId) {
        activePipelineNodeId = null
      }
      pipelineNodeStartTimes.delete(nodeId)
      if (actionId != null) {
        actionStartTimes.delete(actionId)
        actionEndTimes.delete(actionId)
        actionStartOrders.delete(actionId)
        actionEndOrders.delete(actionId)
      }
      resetCurrentNodeAggregation()
    }
    const finalizeTaskPipelineNodeEvent = (
      taskId: number,
      details: Record<string, any>,
      phase: TaskTerminalPhase,
      timestamp: string
    ) => {
      const nodeId = readNumberField(details, 'node_id')
      if (!nodeId) return

      const pipelineStatus = resolveTerminalCompletionStatus(phase)
      settleCurrentNodeRuntimeStates(pipelineStatus, timestamp)

      const nodeName = details.name || ''
      const startTimestamp = pipelineNodeStartTimes.get(nodeId) || this.stringPool.intern(timestamp)
      const endTimestamp = this.stringPool.intern(timestamp)
      const actionId = resolveActionDetailsActionId(details)
      const actionStartTimestamp = actionId != null ? actionStartTimes.get(actionId) : undefined
      const actionEndTimestamp = actionId != null ? actionEndTimes.get(actionId) : undefined
      const actionStartOrder = actionId != null ? actionStartOrders.get(actionId) : undefined
      const actionEndOrder = actionId != null ? actionEndOrders.get(actionId) : undefined
      const currentTaskRecognitionAttempts = dedupeRecognitionAttempts(currentTaskRecognitions)
      const { topLevel: scopedTopLevelRecognitions, actionLevel: scopedActionRecognitions } =
        splitRecognitionAttemptsByActionWindow(
          currentTaskRecognitionAttempts,
          recognitionOrderMeta,
          actionStartOrder,
          actionEndOrder
        )
      const subTaskActionGroups: NestedActionGroup[] =
        subTasks.consumeAsNestedActionGroups(this.stringPool).map((group) => {
          const snapshot = subTaskSnapshots.get(group.task_id)
          return snapshot
            ? mergeSubTaskActionGroupWithSnapshot(
              group,
              snapshot,
              (value) => this.stringPool.intern(value)
            )
            : group
        })
      const subTaskOrphanRecognitionAttempts = subTasks.consumeOrphanRecognitions()
      const subTaskOrphanRecognitionNodes = subTasks.consumeOrphanRecognitionNodes()
      const pendingActionLevelRecognitions = dedupeRecognitionAttempts([
        ...actionLevelRecognitionNodes,
        ...scopedActionRecognitions,
        ...subTaskOrphanRecognitionAttempts,
        ...subTaskOrphanRecognitionNodes
      ])
      const scopedAttachResult = attachActionLevelRecognitionAcrossScopes({
        topLevelAttempts: scopedTopLevelRecognitions,
        nestedActionGroups: subTaskActionGroups,
        actionLevelNodes: pendingActionLevelRecognitions,
        actionStartOrder,
        recognitionOrderMeta,
        cloneRecognitionAttempt,
        sortByParseOrderThenRecoId,
        pickBestAttemptIndex,
        attachNodeToAttempt,
        dedupeRecognitionAttempts,
      })
      const nestedRecognitionInAction = scopedAttachResult.remaining
      const resolvedNestedActionGroups = resolveFinalNestedActionGroups(
        taskId,
        startTimestamp,
        endTimestamp,
        scopedAttachResult.nestedActionGroups
      )
      const fallbackRecoDetails = resolveFallbackRecoDetails(details, scopedAttachResult.topLevelAttempts)
      const mergedActionDetails = withActionTimestamps(details.action_details, actionStartTimestamp, actionEndTimestamp, endTimestamp)
      const resolvedNodeName = this.stringPool.intern(nodeName)
      const composedFlow = composeFinalPipelineNodeFlow({
        taskId,
        topLevelRecognitions: scopedAttachResult.topLevelAttempts,
        actionLevelRecognitions: nestedRecognitionInAction,
        nestedActionGroups: resolvedNestedActionGroups,
        actionDetails: mergedActionDetails,
        fallbackStatus: pipelineStatus,
        eventTimestamp: timestamp,
        details,
        nodeName: resolvedNodeName,
        actionId,
        nodeId,
        fallbackTimestamp: endTimestamp,
      })
      const nodeFlow = composedFlow.nodeFlow
      const actionFlow = composedFlow.actionFlow

      const resolvedNextList = getTaskNextList(taskScopedNodeAggregationByTaskId, taskId)
      let nodeStatus: NodeInfo['status'] = pipelineStatus
      if (nodeStatus === 'success' && actionFlow.some(item => item.type === 'task' && item.status === 'failed')) {
        nodeStatus = 'failed'
      }

      const resolvedRecoDetails = fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined
      const existingNode = pipelineNodesById.get(nodeId)
      const resolvedFocus = resolveEventFocus(details, existingNode?.focus)
      const resolvedNodeDetails = details.node_details ? markRaw(details.node_details) : undefined
      const resolvedNodeFlow = nodeFlow.length > 0 ? nodeFlow : undefined
      const resolvedErrorImage = this.findErrorImageByNames(timestamp, [
        details.action_details?.name,
        details.node_details?.name,
        details.reco_details?.name,
        nodeName,
      ])
      const resolvedNode: NodeInfo = {
        node_id: nodeId,
        task_id: taskId,
        name: resolvedNodeName,
        ts: startTimestamp,
        end_ts: endTimestamp,
        status: nodeStatus,
        reco_details: resolvedRecoDetails,
        action_details: mergedActionDetails,
        focus: resolvedFocus,
        next_list: resolvedNextList,
        node_flow: resolvedNodeFlow,
        node_details: resolvedNodeDetails,
        error_image: resolvedErrorImage,
      }
      upsertCurrentTaskPipelineNode(resolvedNode)
      cleanupCurrentTaskPipelineRuntimeState(nodeId, actionId)
    }
    const handleNextListNodeEvent = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ): boolean => {
      if (taskId != null) {
        if (phase === 'Failed') {
          applyTaskNextList(taskId, [])
        } else {
          applyTaskNextList(taskId, Array.isArray(details.list) ? details.list : [])
        }
      }
      refreshActivePipelineNodePreview(timestamp)
      return true
    }
    const handleWaitFreezesNodeEvent = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      onUpdated?: (details: Record<string, any>) => void
    ): boolean => {
      if (taskId != null) {
        const waitFreezesStatus = resolveRuntimeStatusFromPhase(phase)
        const aggregation = getOrCreateTaskNodeAggregation(taskScopedNodeAggregationByTaskId, taskId)
        upsertWaitFreezesState({
          runtimeStates: aggregation.waitFreezesRuntimeStates,
          details,
          timestamp,
          status: waitFreezesStatus,
          eventOrder,
          activeNodeName: taskId === task.task_id ? getActivePipelineNode()?.name : undefined,
          intern: (value) => this.stringPool.intern(value),
          resolveEventFocus,
          findWaitFreezesImages: (ts, actionName) => this.findWaitFreezesImages(ts, actionName),
        })
        onUpdated?.(details)
      }
      refreshActivePipelineNodePreview(timestamp)
      return true
    }
    const handleRecognitionNodeEvent = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void,
      skipRefreshWhenTaskMissingOnFinish?: boolean
    ): boolean => {
      if (phase === 'Starting') {
        if (taskId != null) {
          handleRecognitionStartEvent(
            taskId,
            details,
            timestamp,
            eventOrder,
            onAttempt
          )
        }
        refreshActivePipelineNodePreview(timestamp)
        return true
      }
      if (taskId == null) {
        if (!skipRefreshWhenTaskMissingOnFinish) {
          refreshActivePipelineNodePreview(timestamp)
        }
        return true
      }
      handleRecognitionFinishEvent(
        taskId,
        details,
        timestamp,
        resolveTerminalCompletionStatus(phase),
        eventOrder,
        onAttempt
      )
      refreshActivePipelineNodePreview(timestamp)
      return true
    }
    const createCurrentTaskActionRuntimeState = (
      actionId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      status: 'running' | 'success' | 'failed'
    ) => {
      return {
        action_id: actionId,
        name: resolveActionEventName(details, {
          intern: (name) => this.stringPool.intern(name),
        }),
        ts: timestamp,
        end_ts: timestamp,
        status,
        order: eventOrder,
      }
    }
    const handleCurrentTaskActionEvent: ScopedActionEventHandler = (
      _taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ): void => {
      const actionId = readNumberField(details, 'action_id')
      if (actionId == null) {
        refreshActivePipelineNodePreview(timestamp)
        return
      }
      const isStarting = phase === 'Starting'
      if (isStarting) {
        const startTimestamp = this.stringPool.intern(timestamp)
        actionStartTimes.set(actionId, startTimestamp)
        actionStartOrders.set(actionId, eventOrder)
        actionRuntimeStates.set(
          actionId,
          createCurrentTaskActionRuntimeState(actionId, details, startTimestamp, eventOrder, 'running')
        )
      } else {
        const endTimestamp = this.stringPool.intern(timestamp)
        actionEndTimes.set(actionId, endTimestamp)
        actionEndOrders.set(actionId, eventOrder)
        const existing = actionRuntimeStates.get(actionId)
        const terminalStatus = resolveRuntimeStatusFromPhase(phase)
        if (existing) {
          existing.status = terminalStatus
          existing.end_ts = endTimestamp
          existing.name = resolveActionEventName(details, {
            fallbackName: existing.name,
            intern: (name) => this.stringPool.intern(name),
          })
        } else {
          actionRuntimeStates.set(
            actionId,
            createCurrentTaskActionRuntimeState(
              actionId,
              details,
              endTimestamp,
              eventOrder,
              terminalStatus
            )
          )
        }
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const handleSubTaskActionEvent: ScopedActionEventHandler = (
      subTaskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ): void => {
      if (subTaskId == null) {
        refreshActivePipelineNodePreview(timestamp)
        return
      }
      const actionId = readNumberField(details, 'action_id')
      if (phase === 'Starting') {
        if (actionId != null) {
          const actionKey = resolveSubTaskActionKey(subTaskId, actionId)!
          subTaskActionStartTimes.set(actionKey, this.stringPool.intern(timestamp))
          subTaskActionStartOrders.set(actionKey, eventOrder)
        }
      } else {
        const actionKey = resolveSubTaskActionKey(subTaskId, actionId)
        const endTimestamp = this.stringPool.intern(timestamp)
        const startTimestamp = actionKey
          ? (subTaskActionStartTimes.get(actionKey) || endTimestamp)
          : endTimestamp
        if (actionKey) {
          subTaskActionEndTimes.set(actionKey, endTimestamp)
          subTaskActionEndOrders.set(actionKey, eventOrder)
        }
        subTasks.addAction(subTaskId, {
          action_id: actionId,
          name: resolveActionEventName(details, {
            intern: (name) => this.stringPool.intern(name),
          }),
          ts: startTimestamp,
          end_ts: endTimestamp,
          status: resolveRuntimeStatusFromPhase(phase),
          action_details: withActionTimestamps(details.action_details, startTimestamp, endTimestamp, endTimestamp)
        })
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const handleCurrentTaskActionNodeEvent: ScopedActionNodeEventHandler = (
      _taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ): void => {
      const actionId = resolveActionNodeEventId(details)
      if (actionId != null) {
        if (phase === 'Starting') {
          actionNodeStartTimes.set(actionId, this.stringPool.intern(timestamp))
        } else {
          actionNodeStartTimes.delete(actionId)
        }
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const syncActiveNodeFocusAfterWaitFreezes = (details: Record<string, any>) => {
      const activeNode = getActivePipelineNode()
      if (activeNode) {
        activeNode.focus = resolveEventFocus(details, activeNode.focus)
      }
    }
    const handleSimpleNodeEvent = (
      taskId: number | null,
      messageMeta: MaaMessageMeta,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      handleActionEvent: ScopedActionEventHandler,
      handleActionNodeEvent: ScopedActionNodeEventHandler,
      onWaitFreezesUpdated?: (details: Record<string, any>) => void,
      onRecognitionAttempt?: (taskId: number, attempt: RecognitionAttempt) => void,
      skipRecognitionRefreshWhenTaskMissingOnFinish?: boolean
    ): boolean => {
      switch (messageMeta.nodeKind) {
        case 'NextList':
          return handleNextListNodeEvent(taskId, phase, details, timestamp)
        case 'WaitFreezes':
          return handleWaitFreezesNodeEvent(
            taskId,
            phase,
            details,
            timestamp,
            eventOrder,
            onWaitFreezesUpdated
          )
        case 'Recognition':
          return handleRecognitionNodeEvent(
            taskId,
            phase,
            details,
            timestamp,
            eventOrder,
            onRecognitionAttempt,
            skipRecognitionRefreshWhenTaskMissingOnFinish
          )
        case 'Action':
          handleActionEvent(taskId, phase, details, timestamp, eventOrder)
          return true
        case 'ActionNode':
          handleActionNodeEvent(taskId, phase, details, timestamp)
          return true
        default:
          return false
      }
    }
    const resolveScopedTaskId = (fixedTaskId: number | undefined, taskId: number | null): number | null => {
      return fixedTaskId ?? taskId
    }
    const createScopedSimpleNodeEventHandler = (params: {
      fixedTaskId?: number
      handleActionEvent: ScopedActionEventHandler
      handleActionNodeEvent: ScopedActionNodeEventHandler
      onWaitFreezesUpdated?: (details: Record<string, any>) => void
      onRecognitionAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
      skipRecognitionRefreshWhenTaskMissingOnFinish?: boolean
    }): ScopedSimpleNodeEventHandler => {
      return (
        taskId: number | null,
        messageMeta: MaaMessageMeta,
        phase: KnownMaaPhase,
        details: Record<string, any>,
        timestamp: string,
        eventOrder: number
      ): boolean => {
        const scopedTaskId = resolveScopedTaskId(params.fixedTaskId, taskId)
        return handleSimpleNodeEvent(
          scopedTaskId,
          messageMeta,
          phase,
          details,
          timestamp,
          eventOrder,
          params.handleActionEvent,
          params.handleActionNodeEvent,
          params.onWaitFreezesUpdated,
          params.onRecognitionAttempt,
          params.skipRecognitionRefreshWhenTaskMissingOnFinish
        )
      }
    }
    const createScopedPipelineNodeFinalizeHandler = (params: {
      fixedTaskId?: number
    }): ScopedPipelineNodeFinalizeHandler => {
      return (
        taskId: number | null,
        details: Record<string, any>,
        phase: TaskTerminalPhase,
        timestamp: string
      ): void => {
        const scopedTaskId = resolveScopedTaskId(params.fixedTaskId, taskId)
        if (scopedTaskId == null) return
        if (scopedTaskId === task.task_id) {
          finalizeTaskPipelineNodeEvent(task.task_id, details, phase, timestamp)
        } else {
          finalizeSubTaskPipelineNodeEvent(scopedTaskId, details, phase, timestamp)
        }
      }
    }
    const handleRecognitionNodeLifecycleEvent = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      dispatchPendingRecognition: (taskId: number, recognition: RecognitionAttempt) => void,
      dispatchStandaloneRecognition: (taskId: number, recognition: RecognitionAttempt) => void,
      excludeParentTaskId?: number,
      dispatchDetachedRecognition?: (recognition: RecognitionAttempt) => void
    ): void => {
      if (phase === 'Starting') {
        if (taskId == null) return
        startRecognitionNodeEvent(
          taskId,
          details,
          timestamp,
          eventOrder,
          excludeParentTaskId,
          dispatchDetachedRecognition
        )
        refreshActivePipelineNodePreview(timestamp)
        return
      }
      if (taskId == null) return
      finalizeRecognitionNodeEvent(
        taskId,
        details,
        timestamp,
        resolveTerminalCompletionStatus(phase),
        eventOrder,
        subTasks.consumeRecognitions(taskId),
        dispatchPendingRecognition,
        dispatchStandaloneRecognition,
        excludeParentTaskId
      )
      refreshActivePipelineNodePreview(timestamp)
    }
    const handleSubTaskActionNodeLifecycleEvent: ScopedActionNodeEventHandler = (
      subTaskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ): void => {
      if (subTaskId == null) {
        refreshActivePipelineNodePreview(timestamp)
        return
      }
      if (phase === 'Starting') {
        handleSubTaskActionNodeStartingEvent(subTaskId, details, timestamp)
      } else {
        handleSubTaskActionNodeFinishedEvent(
          subTaskId,
          details,
          timestamp,
          resolveTerminalCompletionStatus(phase)
        )
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const dispatchActionLevelRecognition = (_taskId: number, recognition: RecognitionAttempt) => {
      pushActionLevelRecognition(recognition)
    }
    const addCurrentTaskRecognition = (_taskId: number, recognition: RecognitionAttempt) => {
      pushCurrentTaskRecognitionAttempt(recognition)
    }
    const addSubTaskRecognition = (taskId: number, recognition: RecognitionAttempt) => {
      subTasks.addRecognition(taskId, recognition)
    }
    const addSubTaskRecognitionNode = (taskId: number, recognition: RecognitionAttempt) => {
      subTasks.addRecognitionNode(taskId, recognition)
    }
    const startCurrentPipelineNodeEvent: ScopedPipelineNodeStartingHandler = (
      _taskId: number | null,
      details: Record<string, any>,
      timestamp: string
    ) => {
      const nodeId = readNumberField(details, 'node_id')
      if (nodeId == null) return
      const startTimestamp = this.stringPool.intern(timestamp)
      pipelineNodeStartTimes.set(nodeId, startTimestamp)
      activePipelineNodeId = nodeId
      resetCurrentNodeAggregation()

      let activeNode = pipelineNodesById.get(nodeId)
      if (!activeNode) {
        activeNode = {
          node_id: nodeId,
          name: this.stringPool.intern(details.name || ''),
          ts: startTimestamp,
          end_ts: startTimestamp,
          status: 'running',
          task_id: task.task_id,
          reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
          action_details: withActionTimestamps(details.action_details, undefined, undefined, startTimestamp),
          focus: resolveEventFocus(details),
          next_list: [],
          node_details: details.node_details ? markRaw(details.node_details) : undefined,
        }
        nodes.push(activeNode)
        pipelineNodesById.set(nodeId, activeNode)
      } else if (activeNode.status === 'running') {
        activeNode.name = this.stringPool.intern(details.name || activeNode.name || '')
        activeNode.ts = startTimestamp
        activeNode.end_ts = startTimestamp
        activeNode.task_id = task.task_id
        activeNode.focus = resolveEventFocus(details, activeNode.focus)
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const startSubTaskPipelineNodeEvent: ScopedPipelineNodeStartingHandler = (
      subTaskId: number | null,
      details: Record<string, any>,
      timestamp: string
    ) => {
      if (subTaskId != null) {
        resetTaskNodeAggregation(taskScopedNodeAggregationByTaskId, subTaskId)
        const nodeId = readNumberField(details, 'node_id')
        if (nodeId != null) {
          subTaskPipelineNodeStartTimes.set(scopedKey(subTaskId, nodeId), this.stringPool.intern(timestamp))
        }
      }
      refreshActivePipelineNodePreview(timestamp)
    }
    const handleScopedNodeEvent = (
      taskId: number | null,
      messageMeta: MaaMessageMeta,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      config: ScopedNodeDispatchConfig
    ) => {
      const phase = toKnownMaaPhase(messageMeta.phase)
      if (!phase) return
      const excludeParentTaskId = config.excludeTaskIdFromParentRecognitionLookup
        ? (taskId ?? undefined)
        : undefined
      if (config.handleSimpleNodeEvent(taskId, messageMeta, phase, details, timestamp, eventOrder)) {
        return
      }
      switch (messageMeta.nodeKind) {
        case 'RecognitionNode':
          handleRecognitionNodeLifecycleEvent(
            taskId,
            phase,
            details,
            timestamp,
            eventOrder,
            config.dispatchPendingRecognition,
            config.dispatchStandaloneRecognition,
            excludeParentTaskId,
            config.dispatchDetachedRecognition
          )
          return
        case 'PipelineNode':
          if (phase === 'Starting') {
            config.handlePipelineNodeStarting(taskId, details, timestamp)
          } else {
            config.handlePipelineNodeFinalize(taskId, details, phase, timestamp)
          }
          return
        default:
          return
      }
    }
    const currentTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
      handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
        fixedTaskId: task.task_id,
        handleActionEvent: handleCurrentTaskActionEvent,
        handleActionNodeEvent: handleCurrentTaskActionNodeEvent,
        onWaitFreezesUpdated: syncActiveNodeFocusAfterWaitFreezes,
        onRecognitionAttempt: addCurrentTaskRecognition,
      }),
      dispatchPendingRecognition: dispatchActionLevelRecognition,
      dispatchStandaloneRecognition: dispatchActionLevelRecognition,
      handlePipelineNodeStarting: startCurrentPipelineNodeEvent,
      handlePipelineNodeFinalize: createScopedPipelineNodeFinalizeHandler({
        fixedTaskId: task.task_id,
      }),
      dispatchDetachedRecognition: pushActionLevelRecognition,
    }
    const subTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
      handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
        handleActionEvent: handleSubTaskActionEvent,
        handleActionNodeEvent: handleSubTaskActionNodeLifecycleEvent,
        onRecognitionAttempt: addSubTaskRecognition,
        skipRecognitionRefreshWhenTaskMissingOnFinish: true,
      }),
      dispatchPendingRecognition: addSubTaskRecognition,
      dispatchStandaloneRecognition: addSubTaskRecognitionNode,
      handlePipelineNodeStarting: startSubTaskPipelineNodeEvent,
      handlePipelineNodeFinalize: createScopedPipelineNodeFinalizeHandler({}),
      excludeTaskIdFromParentRecognitionLookup: true,
    }
    const taskLifecycleMetaContext: TaskLifecycleMetaEventContext = {
      rootTaskId: task.task_id,
      peekActiveTask,
      pushActiveTask,
      popActiveTask,
      setSubTaskParent: (subTaskId: number, parentTaskId: number) => {
        subTaskParentByTaskId.set(subTaskId, parentTaskId)
      },
      onSubTaskStarting: (subTaskId, subTaskDetails, subTaskMessage, subTaskTimestamp) => {
        const snapshot = getOrCreateSubTaskSnapshot(subTaskSnapshots, subTaskId)
        applySubTaskSnapshotStarting(
          snapshot,
          subTaskDetails,
          subTaskMessage,
          subTaskTimestamp,
          (value) => this.stringPool.intern(value)
        )
      },
      onSubTaskTerminal: (subTaskId, subTaskDetails, subTaskMessage, subTaskTimestamp, phase) => {
        const snapshot = getOrCreateSubTaskSnapshot(subTaskSnapshots, subTaskId)
        applySubTaskSnapshotTerminal(
          snapshot,
          subTaskDetails,
          subTaskMessage,
          subTaskTimestamp,
          phase,
          (value) => this.stringPool.intern(value)
        )
      },
    }
    for (let eventIndex = 0; eventIndex < taskEvents.length; eventIndex++) {
      const event = taskEvents[eventIndex]
      const eventOrder = eventIndex
      const timestamp = event.timestamp
      const { message, details } = event
      const messageMeta = this.getCachedMaaMessageMeta(message)
      const eventTaskId = resolveEventTaskId(details)

      handleTaskLifecycleMetaEvent(
        taskLifecycleMetaContext,
        messageMeta,
        eventTaskId,
        details,
        message,
        timestamp,
      )

      if (messageMeta.domain !== 'Node') continue
      const isCurrentTask = eventTaskId === task.task_id

      handleScopedNodeEvent(
        isCurrentTask ? task.task_id : (eventTaskId ?? null),
        messageMeta,
        details,
        timestamp,
        eventOrder,
        isCurrentTask ? currentTaskNodeDispatchConfig : subTaskNodeDispatchConfig
      )
    }

    return nodes
  }

  /**
   * 查找识别尝试的截图（匹配到秒级别）
   */
  findRecognitionImage(timestamp: string, nodeName: string): string | undefined {
    return this.findImageByTimestampSuffix(this.errorImages, timestamp, `_${nodeName}`)
  }

  /**
   * 查找错误截图（匹配到秒级别 + 节点名）
   */
  findErrorImage(timestamp: string, nodeName: string): string | undefined {
    return this.findImageByTimestampSuffix(this.errorImages, timestamp, `_${nodeName}`)
  }

  findErrorImageByNames(timestamp: string, candidateNames: Array<string | null | undefined>): string | undefined {
    const seen = new Set<string>()
    for (const candidate of candidateNames) {
      if (!candidate || seen.has(candidate)) continue
      seen.add(candidate)
      const matched = this.findErrorImage(timestamp, candidate)
      if (matched) return matched
    }
    return undefined
  }

  /**
   * 查找 vision 调试截图（秒级时间戳 + 节点名 + reco_id 三重匹配）
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
   */
  findVisionImage(timestamp: string, nodeName: string, recoId: number): string | undefined {
    return this.findImageByTimestampSuffix(this.visionImages, timestamp, `_${nodeName}_${recoId}`)
  }

  private toImageSecondsKey(timestamp: string): string {
    return timestamp.replace(
      /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/,
      '$1.$2.$3-$4.$5.$6'
    )
  }

  private findImageByTimestampSuffix(
    source: Map<string, string>,
    timestamp: string,
    suffix: string
  ): string | undefined {
    if (source.size === 0) return undefined
    const secondsKey = this.toImageSecondsKey(timestamp)
    for (const [key, path] of source.entries()) {
      if (key.includes(`${secondsKey}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
  }

  /**
   * 查找 action 的 wait_freezes 调试截图（按节点名匹配，返回所有匹配的图片）
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
   * 匹配逻辑：节点名一致，且时间戳在节点完成前（同分钟或前几分钟）
   */
  private findWaitFreezesImages(nodeTimestamp: string, actionName: string): string[] | undefined {
    if (this.waitFreezesImages.size === 0) return undefined

    const suffix = `_${actionName}_wait_freezes`
    const results: string[] = []

    // 节点完成时间（毫秒）
    const nodeTime = new Date(nodeTimestamp).getTime()
    if (isNaN(nodeTime)) return undefined

    for (const [key, path] of this.waitFreezesImages.entries()) {
      if (!key.endsWith(suffix)) continue

      // 从 key 中提取时间戳: 2026.03.11-06.22.54.365_NodeName_wait_freezes
      // -> 2026-03-11 06:22:54.365
      const tsMatch = key.match(/^(\d{4})\.(\d{2})\.(\d{2})-(\d{2})\.(\d{2})\.(\d{2})\.(\d{1,3})_/)
      if (!tsMatch) continue
      const [, y, mo, d, h, mi, s, ms] = tsMatch
      const imgTime = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}.${ms.padEnd(3, '0')}`).getTime()

      // wait_freezes 截图应该在节点完成前、且不超过60秒
      if (!isNaN(imgTime) && imgTime <= nodeTime && nodeTime - imgTime < 60000) {
        results.push(path)
      }
    }

    return results.length > 0 ? results : undefined
  }

  /**
   * 获取所有事件
   */
  getEvents(): EventNotification[] {
    return this.events
  }

  /**
   * 获取所有唯一的进程ID（已排序）
   */
  getProcessIds(): string[] {
    return Array.from(new Set(this.taskProcessMap.values())).sort()
  }

  /**
   * 获取所有唯一的线程ID（已排序）
   */
  getThreadIds(): string[] {
    return Array.from(new Set(this.taskThreadMap.values())).sort()
  }

  /**
   * 获取指定任务的进程ID
   */
  getTaskProcessId(taskId: number): string | undefined {
    return this.taskProcessMap.get(taskId)
  }

  /**
   * 获取指定任务的线程ID
   */
  getTaskThreadId(taskId: number): string | undefined {
    return this.taskThreadMap.get(taskId)
  }
}
