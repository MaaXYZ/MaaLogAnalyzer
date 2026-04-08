import { markRaw } from 'vue'
import type {
  EventNotification,
  TaskInfo,
  NodeInfo,
  RecognitionAttempt,
  NestedActionGroup,
  NestedActionNode,
} from '../types'
import { StringPool } from './stringPool'
import {
  readNumberField,
} from './logEventDecoders'
import {
  parseMaaMessageMeta,
  resolveTaskLifecyclePhase,
  resolveTerminalCompletionStatus,
  type KnownMaaPhase,
  type MaaMessageMeta,
  type TaskTerminalPhase,
} from './logParser/eventMeta'
import {
  handleTaskLifecycleMetaEvent,
  resolveEventTaskId,
  resolveTaskLifecycleEventDetails,
  type TaskLifecycleMetaEventContext,
} from './logParser/taskLifecycle'
import {
  SubTaskCollector,
} from './logParser/subTaskCollector'
import { parseEventLine as parseMaaEventLine, type ParsedEventLine } from './logParser/eventLine'
import {
  resolveActionDetailsActionId,
  resolveActionEventName,
  resolveActionNodeEventId,
  resolveRuntimeStatusFromPhase,
  resolveSubTaskActionKey,
} from './logParser/actionHelpers'
import {
  handleCurrentTaskActionEvent as handleCurrentTaskActionEventHelper,
  handleCurrentTaskActionNodeEvent as handleCurrentTaskActionNodeEventHelper,
  handleSubTaskActionEvent as handleSubTaskActionEventHelper,
} from './logParser/actionEventLifecycleHelpers'
import { createRecognitionAttemptHelpers } from './logParser/recognitionHelpers'
import { createRecognitionAttemptRuntime } from './logParser/recognitionAttemptRuntime'
import { pushActionLevelRecognitionIfUnknown } from './logParser/recognitionCollectionHelpers'
import {
  attachActionLevelRecognitionAcrossScopes,
  cloneNestedActionGroup,
  resolveFallbackRecoDetails,
  splitRecognitionAttemptsByActionWindow,
} from './logParser/recognitionScopeHelpers'
import { nestSubTaskActionGroups } from './logParser/subTaskNestingHelpers'
import {
  applySubTaskSnapshotStarting,
  applySubTaskSnapshotTerminal,
  getOrCreateSubTaskSnapshot,
  mergeSubTaskActionGroupWithSnapshot,
  type SubTaskSnapshot,
} from './logParser/subTaskSnapshotHelpers'
import {
  buildWaitFreezesFlowItems,
  upsertWaitFreezesState,
} from './logParser/waitFreezesHelpers'
import { handleWaitFreezesNodeEvent as handleWaitFreezesNodeEventHelper } from './logParser/waitFreezesEventHelpers'
import {
  getOrCreateTaskNodeAggregation,
  getTaskNextList,
  type TaskScopedNodeAggregation,
} from './logParser/taskScopedAggregationHelpers'
import { createTaskStackTracker } from './logParser/taskStackHelpers'
import {
  findImageByTimestampSuffix,
  findWaitFreezesImages,
} from './logParser/imageLookupHelpers'
import { buildTasksFromEvents } from './logParser/taskBuilder'
import {
  parseRecognitionAnchorName as parseRecognitionAnchorNameHelper,
  resolveEventFocus,
  scopedTaskNodeKey,
  toNextListItems as toNextListItemsHelper,
  withActionTimestamps as withActionTimestampsHelper,
} from './logParser/nodeEventValueHelpers'
import {
  dedupeNestedActionNodes,
  getLatestActionRuntimeState,
  type ActionRuntimeState,
} from './logParser/actionRuntimeHelpers'
import {
  createActionNodeGroup,
  finishSubTaskActionNode,
  startSubTaskActionNode,
} from './logParser/subTaskActionNodeHelpers'
import {
  clearSubTaskRuntimeStateAfterPipelineFinalize,
  consumeMatchedSubTaskAction,
} from './logParser/subTaskRuntimeCleanupHelpers'
import { resetCurrentNodeAggregationState } from './logParser/nodeAggregationResetHelpers'
import {
  startCurrentPipelineNodeEvent as startCurrentPipelineNodeEventHelper,
  startSubTaskPipelineNodeEvent as startSubTaskPipelineNodeEventHelper,
} from './logParser/pipelineNodeStartHelpers'
import {
  cleanupCurrentTaskPipelineRuntimeState as cleanupCurrentTaskPipelineRuntimeStateHelper,
  getActiveRunningPipelineNode,
  upsertPipelineNode,
} from './logParser/pipelineRuntimeStateHelpers'
import {
  finalizeRecognitionNodeEvent as finalizeRecognitionNodeEventHelper,
  startRecognitionNodeEvent as startRecognitionNodeEventHelper,
} from './logParser/recognitionNodeLifecycleHelpers'
import {
  handleRecognitionFinishEvent as handleRecognitionFinishEventHelper,
  handleRecognitionNodeEvent as handleRecognitionNodeEventHelper,
  handleRecognitionStartEvent as handleRecognitionStartEventHelper,
  pushRecognitionAttemptIfMissing,
} from './logParser/recognitionEventHandlers'
import {
  handleRecognitionNodeLifecycleEvent as handleRecognitionNodeLifecycleEventHelper,
  handleScopedNodeEvent as handleScopedNodeEventHelper,
} from './logParser/nodeDispatchLifecycleHelpers'
import {
  applyTaskNextList as applyTaskNextListHelper,
  handleNextListNodeEvent as handleNextListNodeEventHelper,
} from './logParser/nextListEventHelpers'
import { settleCurrentNodeRuntimeStates as settleCurrentNodeRuntimeStatesHelper } from './logParser/runtimeSettlementHelpers'
import {
  createScopedPipelineNodeFinalizeHandler,
  createScopedSimpleNodeEventHandler,
  type ScopedActionEventHandler,
  type ScopedActionNodeEventHandler,
  type ScopedNodeDispatchConfig,
  type ScopedPipelineNodeStartingHandler,
} from './logParser/scopedNodeDispatchHelpers'
import { routeSimpleNodeEvent } from './logParser/simpleNodeEventRouter'
import {
  composeFinalPipelineNodeFlow,
  composePipelineNodeFlow,
  createActionRootFlowItem,
  summarizeActionFlowStatus,
} from './logParser/pipelineNodeFlowHelpers'
import { toTimestampMs } from './timestamp'

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

  /**
   * 获取所有任务
   */
  private buildTasks(consume: boolean): TaskInfo[] {
    const tasks = buildTasksFromEvents({
      events: this.events,
      stringPool: this.stringPool,
      getCachedMaaMessageMeta: (message) => this.getCachedMaaMessageMeta(message),
      getTaskNodes: (task) => this.getTaskNodes(task),
    })

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

    return tasks
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
    const actionRuntimeStates = new Map<number, ActionRuntimeState>()
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
    const taskStackTracker = createTaskStackTracker(task.task_id)
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

    const scopedKey = scopedTaskNodeKey
    const withTimestamps = (
      actionDetails: any,
      startTimestamp?: string,
      endTimestamp?: string,
      fallbackEndTimestamp?: string
    ) => withActionTimestampsHelper(actionDetails, this.stringPool, startTimestamp, endTimestamp, fallbackEndTimestamp)
    const toListItems = (list: unknown[]) => toNextListItemsHelper(list, this.stringPool)
    const parseAnchorName = (details: Record<string, any>) => parseRecognitionAnchorNameHelper(details, this.stringPool)
    const {
      startRecognitionAttempt,
      finishRecognitionAttempt,
      findActiveParentRecognition,
    } = createRecognitionAttemptRuntime({
      stringPool: this.stringPool,
      activeRecognitionAttempts,
      activeRecognitionStack,
      finishedRecognitionKeys,
      recognitionOrderMeta,
      scopedKey,
      parseAnchorName,
      findRecognitionImage: (timestamp, nodeName) => this.findRecognitionImage(timestamp, nodeName),
      findVisionImage: (timestamp, nodeName, recoId) => this.findVisionImage(timestamp, nodeName, recoId),
    })
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
      pushRecognitionAttemptIfMissing(currentTaskRecognitions, attempt)
    }
    const handleRecognitionStartEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
    ) => {
      handleRecognitionStartEventHelper({
        taskId,
        details,
        timestamp,
        eventOrder,
        startRecognitionAttempt,
        onAttempt,
      })
    }
    const handleRecognitionFinishEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number,
      onAttempt?: (taskId: number, attempt: RecognitionAttempt) => void
    ) => {
      handleRecognitionFinishEventHelper({
        taskId,
        details,
        timestamp,
        status,
        eventOrder,
        finishRecognitionAttempt,
        onAttempt,
      })
    }
    const applyTaskNextList = (taskId: number, list: unknown[]) => {
      applyTaskNextListHelper({
        taskScopedNodeAggregationByTaskId,
        taskId,
        list,
        toListItems,
        rootTaskId: task.task_id,
        getActivePipelineNode,
      })
    }
    const startRecognitionNodeEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      excludeParentTaskId?: number,
      dispatchDetachedRecognition?: (attempt: RecognitionAttempt) => void
    ) => {
      startRecognitionNodeEventHelper({
        taskId,
        rootTaskId: task.task_id,
        details,
        timestamp,
        eventOrder,
        excludeParentTaskId,
        dispatchDetachedRecognition,
        recognitionNodeStartTimes,
        subTaskRecognitionNodeStartTimes,
        scopedKey,
        ensureRecognitionNodeAttempt,
        findActiveParentRecognition,
        attachNodeToAttempt,
        intern: (value) => this.stringPool.intern(value),
      })
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
      finalizeRecognitionNodeEventHelper({
        taskId,
        rootTaskId: task.task_id,
        details,
        timestamp,
        status,
        eventOrder,
        pendingRecognitions,
        dispatchPendingRecognition,
        dispatchStandaloneRecognition,
        excludeParentTaskId,
        recognitionNodeStartTimes,
        subTaskRecognitionNodeStartTimes,
        activeRecognitionNodeAttempts,
        scopedKey,
        dedupeRecognitionAttempts,
        completeRecognitionNodeAttempt,
        findActiveParentRecognition,
        attachNodeToAttempt,
        intern: (value) => this.stringPool.intern(value),
      })
    }
    const pushActionLevelRecognition = (attempt: RecognitionAttempt) => {
      pushActionLevelRecognitionIfUnknown(currentTaskRecognitions, actionLevelRecognitionNodes, attempt)
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
        intern: (value) => this.stringPool.intern(value),
      })
      return fallbackActionGroup ? [fallbackActionGroup] : []
    }
    const latestActionRuntimeState = () => getLatestActionRuntimeState(actionRuntimeStates)
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
        intern: (value) => this.stringPool.intern(value),
      })
      const runtimeNestedActionGroups: NestedActionGroup[] = runtimeActionGroup ? [runtimeActionGroup] : []

      const runtimeActionState = latestActionRuntimeState()
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
      const matchedTaskAction = consumeMatchedSubTaskAction(subTasks, subTaskId, actionId)
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
      const resolvedActionDetails = withTimestamps(
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
        taskScopedNodeAggregationByTaskId,
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
        findErrorImageByNames: (eventTs, names) => this.findErrorImageByNames(eventTs, names),
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
      clearSubTaskRuntimeStateAfterPipelineFinalize({
        subTaskId,
        nodeId,
        actionKey,
        scopedKey,
        subTaskPipelineNodeStartTimes,
        subTaskActionStartTimes,
        subTaskActionEndTimes,
        subTaskActionStartOrders,
        subTaskActionEndOrders,
        activeSubTaskActionNodes,
        activeRecognitionNodeAttempts,
        taskScopedNodeAggregationByTaskId,
      })
      refreshActivePipelineNodePreview(timestamp)
    }
    const getActivePipelineNode = (): NodeInfo | null => {
      return getActiveRunningPipelineNode(activePipelineNodeId, pipelineNodesById)
    }
    const resetCurrentNodeAggregation = () => {
      resetCurrentNodeAggregationState({
        rootTaskId: task.task_id,
        taskScopedNodeAggregationByTaskId,
        currentTaskRecognitions,
        nestedActionNodes,
        actionLevelRecognitionNodes,
        activeRecognitionNodeAttempts,
        actionRuntimeStates,
        activeSubTaskActionNodes,
        subTasks,
        subTaskParentByTaskId,
        taskStackTracker,
      })
    }
    const settleCurrentNodeRuntimeStates = (
      fallbackStatus: 'success' | 'failed',
      timestamp: string
    ) => {
      settleCurrentNodeRuntimeStatesHelper({
        fallbackStatus,
        timestamp,
        taskId: task.task_id,
        currentTaskRecognitions,
        actionLevelRecognitionNodes,
        activeRecognitionAttempts,
        activeRecognitionNodeAttempts,
        activeRecognitionStack,
        finishedRecognitionKeys,
        actionRuntimeStates,
        taskScopedNodeAggregationByTaskId,
        activeSubTaskActionNodes,
        nestedActionNodes,
        intern: (value) => this.stringPool.intern(value),
      })
    }
    const upsertCurrentTaskPipelineNode = (node: NodeInfo) => {
      return upsertPipelineNode(nodes, pipelineNodesById, node)
    }
    const cleanupCurrentTaskPipelineRuntimeState = (
      nodeId: number,
      actionId: number | null | undefined
    ) => {
      activePipelineNodeId = cleanupCurrentTaskPipelineRuntimeStateHelper({
        activePipelineNodeId,
        nodeId,
        actionId,
        pipelineNodeStartTimes,
        actionStartTimes,
        actionEndTimes,
        actionStartOrders,
        actionEndOrders,
        resetCurrentNodeAggregation,
      })
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
      const mergedActionDetails = withTimestamps(details.action_details, actionStartTimestamp, actionEndTimestamp, endTimestamp)
      const resolvedNodeName = this.stringPool.intern(nodeName)
      const composedFlow = composeFinalPipelineNodeFlow({
        taskScopedNodeAggregationByTaskId,
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
        findErrorImageByNames: (eventTs, names) => this.findErrorImageByNames(eventTs, names),
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
      return handleNextListNodeEventHelper({
        taskId,
        phase,
        details,
        timestamp,
        applyTaskNextList,
        refreshActivePipelineNodePreview,
      })
    }
    const handleWaitFreezesNodeEvent = (
      taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number,
      onUpdated?: (details: Record<string, any>) => void
    ): boolean => {
      return handleWaitFreezesNodeEventHelper({
        taskId,
        rootTaskId: task.task_id,
        phase,
        details,
        timestamp,
        eventOrder,
        onUpdated,
        taskScopedNodeAggregationByTaskId,
        getOrCreateTaskNodeAggregation,
        upsertWaitFreezesState,
        resolveRuntimeStatusFromPhase,
        getActivePipelineNodeName: () => getActivePipelineNode()?.name,
        intern: (value) => this.stringPool.intern(value),
        resolveEventFocus,
        findWaitFreezesImages: (ts, actionName) => findWaitFreezesImages(this.waitFreezesImages, ts, actionName),
        refresh: refreshActivePipelineNodePreview,
      })
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
      return handleRecognitionNodeEventHelper({
        taskId,
        phase,
        details,
        timestamp,
        eventOrder,
        onStart: handleRecognitionStartEvent,
        onFinish: handleRecognitionFinishEvent,
        resolveTerminalStatus: (nodePhase) => resolveTerminalCompletionStatus(nodePhase as TaskTerminalPhase),
        refresh: refreshActivePipelineNodePreview,
        onAttempt,
        skipRefreshWhenTaskMissingOnFinish,
      })
    }
    const handleCurrentTaskActionEvent: ScopedActionEventHandler = (
      _taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ): void => {
      handleCurrentTaskActionEventHelper({
        phase,
        details,
        timestamp,
        eventOrder,
        actionStartTimes,
        actionEndTimes,
        actionStartOrders,
        actionEndOrders,
        actionRuntimeStates,
        readNumberField,
        resolveRuntimeStatusFromPhase,
        resolveActionName: (eventDetails, fallbackName) => resolveActionEventName(eventDetails, {
          fallbackName,
          intern: (name) => this.stringPool.intern(name),
        }),
        intern: (value) => this.stringPool.intern(value),
        refresh: refreshActivePipelineNodePreview,
      })
    }
    const handleSubTaskActionEvent: ScopedActionEventHandler = (
      subTaskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ): void => {
      handleSubTaskActionEventHelper({
        subTaskId,
        phase,
        details,
        timestamp,
        eventOrder,
        subTaskActionStartTimes,
        subTaskActionEndTimes,
        subTaskActionStartOrders,
        subTaskActionEndOrders,
        resolveSubTaskActionKey,
        readNumberField,
        resolveRuntimeStatusFromPhase,
        resolveActionName: (eventDetails, fallbackName) => resolveActionEventName(eventDetails, {
          fallbackName,
          intern: (name) => this.stringPool.intern(name),
        }),
        withTimestamps,
        addSubTaskAction: (id, action) => subTasks.addAction(id, action),
        intern: (value) => this.stringPool.intern(value),
        refresh: refreshActivePipelineNodePreview,
      })
    }
    const handleCurrentTaskActionNodeEvent: ScopedActionNodeEventHandler = (
      _taskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ): void => {
      handleCurrentTaskActionNodeEventHelper({
        phase,
        details,
        timestamp,
        actionNodeStartTimes,
        resolveActionNodeEventId,
        intern: (value) => this.stringPool.intern(value),
        refresh: refreshActivePipelineNodePreview,
      })
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
      return routeSimpleNodeEvent({
        taskId,
        messageMeta,
        phase,
        details,
        timestamp,
        eventOrder,
        handleActionEvent,
        handleActionNodeEvent,
        onNextList: handleNextListNodeEvent,
        onWaitFreezes: handleWaitFreezesNodeEvent,
        onRecognition: handleRecognitionNodeEvent,
        onWaitFreezesUpdated,
        onRecognitionAttempt,
        skipRecognitionRefreshWhenTaskMissingOnFinish,
      })
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
      handleRecognitionNodeLifecycleEventHelper({
        taskId,
        phase,
        details,
        timestamp,
        eventOrder,
        dispatchPendingRecognition,
        dispatchStandaloneRecognition,
        excludeParentTaskId,
        dispatchDetachedRecognition,
        startRecognitionNodeEvent,
        finalizeRecognitionNodeEvent,
        resolveTerminalCompletionStatus,
        consumeRecognitions: (id) => subTasks.consumeRecognitions(id),
        refresh: refreshActivePipelineNodePreview,
      })
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
        startSubTaskActionNode({
          subTaskId,
          details,
          timestamp,
          nestedActionNodes,
          activeSubTaskActionNodes,
          subTaskActionNodeStartTimes,
          withTimestamps,
          intern: (value) => this.stringPool.intern(value),
        })
      } else {
        finishSubTaskActionNode({
          subTaskId,
          details,
          timestamp,
          status: resolveTerminalCompletionStatus(phase),
          nestedActionNodes,
          activeSubTaskActionNodes,
          subTaskActionNodeStartTimes,
          subTaskActionStartTimes,
          subTaskActionEndTimes,
          withTimestamps,
          intern: (value) => this.stringPool.intern(value),
        })
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
      const startedNodeId = startCurrentPipelineNodeEventHelper({
        details,
        timestamp,
        rootTaskId: task.task_id,
        nodes,
        pipelineNodesById,
        resetCurrentNodeAggregation,
        withTimestamps,
        intern: (value) => this.stringPool.intern(value),
      })
      if (startedNodeId == null) return
      pipelineNodeStartTimes.set(startedNodeId, this.stringPool.intern(timestamp))
      activePipelineNodeId = startedNodeId
      refreshActivePipelineNodePreview(timestamp)
    }
    const startSubTaskPipelineNodeEvent: ScopedPipelineNodeStartingHandler = (
      subTaskId: number | null,
      details: Record<string, any>,
      timestamp: string
    ) => {
      startSubTaskPipelineNodeEventHelper({
        subTaskId,
        details,
        timestamp,
        scopedKey,
        taskScopedNodeAggregationByTaskId,
        subTaskPipelineNodeStartTimes,
        intern: (value) => this.stringPool.intern(value),
      })
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
      handleScopedNodeEventHelper({
        taskId,
        messageMeta,
        details,
        timestamp,
        eventOrder,
        config,
        handleRecognitionNodeLifecycleEvent: (args) => handleRecognitionNodeLifecycleEvent(
          args.taskId,
          args.phase,
          args.details,
          args.timestamp,
          args.eventOrder,
          args.dispatchPendingRecognition,
          args.dispatchStandaloneRecognition,
          args.excludeParentTaskId,
          args.dispatchDetachedRecognition,
        ),
      })
    }
    const currentTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
      handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
        fixedTaskId: task.task_id,
        handleSimpleNodeEvent,
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
        rootTaskId: task.task_id,
        finalizeTaskPipelineNodeEvent,
        finalizeSubTaskPipelineNodeEvent,
      }),
      dispatchDetachedRecognition: pushActionLevelRecognition,
    }
    const subTaskNodeDispatchConfig: ScopedNodeDispatchConfig = {
      handleSimpleNodeEvent: createScopedSimpleNodeEventHandler({
        handleSimpleNodeEvent,
        handleActionEvent: handleSubTaskActionEvent,
        handleActionNodeEvent: handleSubTaskActionNodeLifecycleEvent,
        onRecognitionAttempt: addSubTaskRecognition,
        skipRecognitionRefreshWhenTaskMissingOnFinish: true,
      }),
      dispatchPendingRecognition: addSubTaskRecognition,
      dispatchStandaloneRecognition: addSubTaskRecognitionNode,
      handlePipelineNodeStarting: startSubTaskPipelineNodeEvent,
      handlePipelineNodeFinalize: createScopedPipelineNodeFinalizeHandler({
        rootTaskId: task.task_id,
        finalizeTaskPipelineNodeEvent,
        finalizeSubTaskPipelineNodeEvent,
      }),
      excludeTaskIdFromParentRecognitionLookup: true,
    }
    const taskLifecycleMetaContext: TaskLifecycleMetaEventContext = {
      rootTaskId: task.task_id,
      peekActiveTask: () => taskStackTracker.peek(),
      pushActiveTask: (taskId) => taskStackTracker.push(taskId),
      popActiveTask: (taskId) => taskStackTracker.pop(taskId),
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
    return findImageByTimestampSuffix(this.errorImages, timestamp, `_${nodeName}`)
  }

  /**
   * 查找错误截图（匹配到秒级别 + 节点名）
   */
  findErrorImage(timestamp: string, nodeName: string): string | undefined {
    return findImageByTimestampSuffix(this.errorImages, timestamp, `_${nodeName}`)
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
    return findImageByTimestampSuffix(this.visionImages, timestamp, `_${nodeName}_${recoId}`)
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
