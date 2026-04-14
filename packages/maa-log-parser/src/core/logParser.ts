/**
 * Parser entry orchestration file.
 *
 * Architecture guide: ./logParser/README.md
 * Helper modules: ./logParser/
 *
 * Keep this file focused on high-level flow wiring; move detailed domain logic
 * into helper modules under ./logParser/ whenever possible.
 */
import type {
  EventNotification,
  TaskInfo,
  NodeInfo,
  RecognitionAttempt,
  NestedActionGroup,
} from '../shared/types'
import { StringPool } from '../shared/stringPool'
import {
  readNumberField,
} from '../shared/logEventDecoders'
import {
  parseMaaMessageMeta,
  resolveTaskLifecyclePhase,
  resolveTerminalCompletionStatus,
  type KnownMaaPhase,
  type MaaMessageMeta,
  type TaskTerminalPhase,
} from '../event/meta'
import {
  resolveTaskLifecycleEventDetails,
  type TaskLifecycleMetaEventContext,
} from '../task/lifecycle'
import {
  SubTaskCollector,
} from '../subtask/collector'
import { parseEventLine as parseMaaEventLine, type ParsedEventLine } from '../event/line'
import {
  resolveActionDetailsActionId,
  resolveActionEventName,
  resolveActionNodeEventId,
  resolveRuntimeStatusFromPhase,
  resolveSubTaskActionKey,
} from '../action/helpers'
import {
  handleCurrentTaskActionEvent as handleCurrentTaskActionEventHelper,
  handleCurrentTaskActionNodeEvent as handleCurrentTaskActionNodeEventHelper,
  handleSubTaskActionEvent as handleSubTaskActionEventHelper,
} from '../action/eventLifecycleHelpers'
import { createRecognitionAttemptHelpers } from '../recognition/helpers'
import { createRecognitionAttemptRuntime } from '../recognition/attemptRuntime'
import { pushActionLevelRecognitionIfUnknown } from '../recognition/collectionHelpers'
import {
  attachActionLevelRecognitionAcrossScopes,
  cloneNestedActionGroup,
  resolveFallbackRecoDetails,
  splitRecognitionAttemptsByActionWindow,
} from '../recognition/scopeHelpers'
import {
  applySubTaskSnapshotStarting,
  applySubTaskSnapshotTerminal,
  getOrCreateSubTaskSnapshot,
  mergeSubTaskActionGroupWithSnapshot,
} from '../subtask/snapshotHelpers'
import {
  buildWaitFreezesFlowItems,
  upsertWaitFreezesState,
} from '../waitFreezes/helpers'
import { handleWaitFreezesNodeEvent as handleWaitFreezesNodeEventHelper } from '../waitFreezes/eventHelpers'
import {
  getOrCreateTaskNodeAggregation,
  getTaskNextList,
} from '../task/scopedAggregationHelpers'
import {
  findImageByTimestampSuffix,
  findWaitFreezesImages,
} from '../event/imageLookupHelpers'
import { createTaskNodeRuntimeContext } from '../task/nodeRuntimeContext'
import { buildTasksFromEvents } from '../task/builder'
import { processTaskEvents } from '../task/eventLoopHelpers'
import { createTaskLifecycleMetaContext } from '../task/lifecycleContextFactory'
import { createSimpleNodeEventHandler } from '../node/simpleEventHandlerFactory'
import {
  parseRecognitionAnchorName as parseRecognitionAnchorNameHelper,
  resolveEventFocus,
  scopedTaskNodeKey,
  toNextListItems as toNextListItemsHelper,
  withActionTimestamps as withActionTimestampsHelper,
} from '../node/eventValueHelpers'
import {
  refreshActivePipelineNodePreview as refreshActivePipelineNodePreviewHelper,
  resolveFinalNestedActionGroups as resolveFinalNestedActionGroupsHelper,
} from '../pipeline/activePreviewHelpers'
import {
  createActionNodeGroup,
  finishSubTaskActionNode,
  startSubTaskActionNode,
} from '../subtask/actionNodeHelpers'
import { handleSubTaskActionNodeLifecycleEvent as handleSubTaskActionNodeLifecycleEventHelper } from '../subtask/actionNodeLifecycleHandler'
import {
  clearSubTaskRuntimeStateAfterPipelineFinalize,
  consumeMatchedSubTaskAction,
} from '../subtask/runtimeCleanupHelpers'
import { finalizeSubTaskPipelineNodeEvent as finalizeSubTaskPipelineNodeEventHelper } from '../subtask/pipelineFinalizeHelpers'
import { finalizeTaskPipelineNodeEvent as finalizeTaskPipelineNodeEventHelper } from '../task/pipelineFinalizeHelpers'
import { resetCurrentNodeAggregationState } from '../node/aggregationResetHelpers'
import {
  startCurrentPipelineNodeEvent as startCurrentPipelineNodeEventHelper,
  startSubTaskPipelineNodeEvent as startSubTaskPipelineNodeEventHelper,
} from '../pipeline/startHelpers'
import {
  cleanupCurrentTaskPipelineRuntimeState as cleanupCurrentTaskPipelineRuntimeStateHelper,
  getActiveRunningPipelineNode,
  upsertPipelineNode,
} from '../pipeline/runtimeStateHelpers'
import {
  finalizeRecognitionNodeEvent as finalizeRecognitionNodeEventHelper,
  startRecognitionNodeEvent as startRecognitionNodeEventHelper,
} from '../recognition/nodeLifecycleHelpers'
import {
  handleRecognitionFinishEvent as handleRecognitionFinishEventHelper,
  handleRecognitionNodeEvent as handleRecognitionNodeEventHelper,
  handleRecognitionStartEvent as handleRecognitionStartEventHelper,
  pushRecognitionAttemptIfMissing,
} from '../recognition/eventHandlers'
import {
  handleRecognitionNodeLifecycleEvent as handleRecognitionNodeLifecycleEventHelper,
  handleScopedNodeEvent as handleScopedNodeEventHelper,
} from '../node/dispatchLifecycleHelpers'
import {
  applyTaskNextList as applyTaskNextListHelper,
  handleNextListNodeEvent as handleNextListNodeEventHelper,
} from '../node/nextListHelpers'
import { settleCurrentNodeRuntimeStates as settleCurrentNodeRuntimeStatesHelper } from '../pipeline/runtimeSettlementHelpers'
import {
  type ScopedActionEventHandler,
  type ScopedActionNodeEventHandler,
} from '../node/scopedDispatchHelpers'
import { createNodeDispatchConfigs } from '../node/dispatchConfigFactory'
import {
  composeFinalPipelineNodeFlow,
  composePipelineNodeFlow,
  createActionRootFlowItem,
  summarizeActionFlowStatus,
} from '../pipeline/nodeFlowHelpers'
import { wrapRaw } from '../shared/rawValue'
import { toTimestampMs } from '../shared/timestamp'
import { createProtocolEvent } from '../protocol/eventFactory'
import type { ProtocolEvent } from '../protocol/types'
import { buildTraceTree, type TraceScopePayload } from '../trace/reducer'
import type { ScopeNode } from '../trace/scopeTypes'
import { buildTraceIndex, type TraceIndex } from '../query/traceIndex'
import { projectTasksFromTrace } from '../projector/taskProjector'
import {
  cloneRawLineStore,
  createRawLineStore,
  setRawLineSource,
  type RawLineStore,
} from '../raw/store'

export interface ParseProgress {
  current: number
  total: number
  percentage: number
}

export interface ParseFileOptions {
  chunkLineCount?: number
  yieldControl?: (() => Promise<void> | void) | null
  sourceKey?: string
  sourcePath?: string
  inputIndex?: number
  storeRawLines?: boolean
}

export interface ParseSourceInput {
  content: string
  sourceKey?: string
  sourcePath?: string
  inputIndex?: number
}

export interface ParseArtifactsSnapshot {
  events: ProtocolEvent[]
  trace: ScopeNode<TraceScopePayload | Record<string, never>>
  index: TraceIndex
  rawLines?: RawLineStore
}

const defaultParseYieldControl = async (): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
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
  private protocolEvents: ProtocolEvent[] = []
  private rawLines: RawLineStore | null = null
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
    this.protocolEvents = []
    this.rawLines = null
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

  private ensureRawLineStore(): RawLineStore {
    if (!this.rawLines) {
      this.rawLines = createRawLineStore()
    }
    return this.rawLines
  }

  private appendEvent(
    event: EventNotification & {
      processId: string
      threadId: string
      _dedupSignature: string
      _timestampMs: number
    },
    sourceOptions?: {
      sourceKey?: string
      sourcePath?: string
      inputIndex?: number
    },
  ): void {
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
    const protocolEvent = createProtocolEvent(event, {
      seq: this.protocolEvents.length + 1,
      sourceKey: sourceOptions?.sourceKey,
      sourcePath: sourceOptions?.sourcePath,
      inputIndex: sourceOptions?.inputIndex,
    })
    if (protocolEvent) {
      this.protocolEvents.push(protocolEvent)
    }
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
        this.appendEvent(event, {
          sourceKey: 'input:0',
          inputIndex: 0,
        })
      } catch (e) {
        console.warn(`解析实时事件行失败(line=${lineNum}):`, e)
      }
    }
  }

  /**
   * 解析日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  private async parseSourceContent(
    input: ParseSourceInput,
    runtime: {
      onProgress?: ((progress: ParseProgress) => void) | undefined
      chunkLineCount: number
      yieldControl: (() => Promise<void> | void) | null
      progressOffset: number
      totalChars: number
      storeRawLines: boolean
    },
  ): Promise<number> {
    const content = input.content
    const totalChars = content.length
    const normalizedInputIndex = input.inputIndex ?? 0
    const sourceKey = input.sourceKey ?? input.sourcePath ?? `input:${normalizedInputIndex}`
    const sourceMeta = {
      sourceKey,
      sourcePath: input.sourcePath,
      inputIndex: normalizedInputIndex,
    }
    const rawLines = runtime.storeRawLines ? [] as string[] : null
    const chunkLineCount = runtime.chunkLineCount
    let cursor = 0
    let lineNum = 0

    if (totalChars === 0) {
      if (rawLines) {
        setRawLineSource(this.ensureRawLineStore(), {
          ...sourceMeta,
          lines: rawLines,
        })
      }
      if (runtime.onProgress) {
        const current = Math.min(runtime.progressOffset, runtime.totalChars)
        runtime.onProgress({
          current,
          total: runtime.totalChars,
          percentage: runtime.totalChars === 0
            ? 100
            : Math.round((current / runtime.totalChars) * 100),
        })
      }
      return 0
    }

    while (cursor <= totalChars) {
      if (runtime.yieldControl) {
        await runtime.yieldControl()
      }
      let parsedLines = 0

      while (parsedLines < chunkLineCount && cursor <= totalChars) {
        const lineStart = cursor
        let lineEnd = content.indexOf('\n', lineStart)
        if (lineEnd < 0) lineEnd = totalChars
        const rawLine = content.slice(lineStart, lineEnd)
        if (rawLines) {
          rawLines.push(rawLine)
        }
        cursor = lineEnd < totalChars ? lineEnd + 1 : totalChars + 1
        parsedLines += 1
        lineNum += 1

        if (!rawLine || !rawLine.includes('!!!OnEventNotify!!!')) continue

        try {
          const event = this.parseEventLine(rawLine.trim(), lineNum)
          if (!event) continue
          this.appendEvent(event, sourceMeta)
        } catch (e) {
          console.warn(`解析第 ${lineNum} 行失败:`, e)
        }
      }

      if (runtime.onProgress) {
        const current = Math.min(runtime.progressOffset + Math.min(cursor, totalChars), runtime.totalChars)
        runtime.onProgress({
          current,
          total: runtime.totalChars,
          percentage: runtime.totalChars === 0
            ? 100
            : Math.round((current / runtime.totalChars) * 100),
        })
      }
    }

    if (rawLines) {
      setRawLineSource(this.ensureRawLineStore(), {
        ...sourceMeta,
        lines: rawLines,
      })
    }

    return totalChars
  }

  /**
   * 解析多 source 日志内容（异步分块处理）
   */
  async parseInputs(
    inputs: ParseSourceInput[],
    onProgress?: (progress: ParseProgress) => void,
    options?: ParseFileOptions,
  ): Promise<void> {
    this.resetParsedEvents()

    const normalizedInputs = inputs.map((input, index) => ({
      ...input,
      inputIndex: input.inputIndex ?? index,
    }))
    const totalChars = normalizedInputs.reduce((sum, input) => sum + input.content.length, 0)
    const chunkLineCount = options?.chunkLineCount ?? 1000
    const yieldControl = options?.yieldControl === undefined
      ? defaultParseYieldControl
      : options.yieldControl
    const storeRawLines = options?.storeRawLines === true

    if (normalizedInputs.length === 0) {
      if (onProgress) {
        onProgress({
          current: 0,
          total: 0,
          percentage: 100,
        })
      }
      return
    }

    let progressOffset = 0
    for (const input of normalizedInputs) {
      const parsedChars = await this.parseSourceContent(input, {
        onProgress,
        chunkLineCount,
        yieldControl,
        progressOffset,
        totalChars,
        storeRawLines,
      })
      progressOffset += parsedChars
    }

    if (onProgress) {
      onProgress({
        current: totalChars,
        total: totalChars,
        percentage: 100,
      })
    }
  }

  /**
   * 解析单个日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void,
    options?: ParseFileOptions
  ): Promise<void> {
    await this.parseInputs([{
      content,
      sourceKey: options?.sourceKey,
      sourcePath: options?.sourcePath,
      inputIndex: options?.inputIndex,
    }], onProgress, options)
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
      this.protocolEvents = []
      this.rawLines = null
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

  getEventsSnapshot(): EventNotification[] {
    return this.events.slice()
  }

  getProtocolEventsSnapshot(): ProtocolEvent[] {
    return this.protocolEvents.slice()
  }

  getRawLineStoreSnapshot(): RawLineStore | null {
    return cloneRawLineStore(this.rawLines)
  }

  getTraceSnapshot(): ScopeNode<TraceScopePayload | Record<string, never>> {
    return buildTraceTree(this.protocolEvents)
  }

  getTraceIndexSnapshot(): TraceIndex {
    return buildTraceIndex(this.getTraceSnapshot(), this.protocolEvents)
  }

  getProjectedTasksSnapshot(): TaskInfo[] {
    const trace = this.getTraceSnapshot()
    return projectTasksFromTrace(trace, {
      events: this.getEventsSnapshot(),
    })
  }

  getParseArtifactsSnapshot(): ParseArtifactsSnapshot {
    const events = this.getProtocolEventsSnapshot()
    const trace = buildTraceTree(events)
    const index = buildTraceIndex(trace, events)
    return {
      events,
      trace,
      index,
      rawLines: this.getRawLineStoreSnapshot() ?? undefined,
    }
  }

  getTasks(): TaskInfo[] {
    return this.buildTasks(true)
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const {
      nodes,
      pipelineNodesById,
      taskScopedNodeAggregationByTaskId,
      currentTaskRecognitions,
      actionLevelRecognitionNodes,
      nestedActionNodes,
      pipelineNodeStartTimes,
      recognitionNodeStartTimes,
      activeRecognitionNodeAttempts,
      actionStartTimes,
      actionEndTimes,
      actionStartOrders,
      actionEndOrders,
      actionNodeStartTimes,
      actionRuntimeStates,
      activeSubTaskActionNodes,
      subTaskPipelineNodeStartTimes,
      subTaskRecognitionNodeStartTimes,
      subTaskActionStartTimes,
      subTaskActionEndTimes,
      subTaskActionStartOrders,
      subTaskActionEndOrders,
      subTaskActionNodeStartTimes,
      subTaskSnapshots,
      subTaskParentByTaskId,
      taskStackTracker,
      activeRecognitionAttempts,
      activeRecognitionStack,
      finishedRecognitionKeys,
      recognitionOrderMeta,
    } = createTaskNodeRuntimeContext(task.task_id)
    let activePipelineNodeId: number | null = null
    const activePipelineNodeIdByTaskId = new Map<number, number>()

    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? this.events.length - 1
    if (taskStartIndex === -1) return []

    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    let syntheticSubTaskPipelineNodeId = -1
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
        reco_details: details.reco_details ? wrapRaw(details.reco_details) : undefined,
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
      attempt.reco_details = details.reco_details ? wrapRaw(details.reco_details) : attempt.reco_details
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
    const resolveNestedActionGroups = (
      taskId: number,
      startTimestamp: string,
      endTimestamp: string,
      groups: NestedActionGroup[],
      resolvedNestedActionNodes: typeof nestedActionNodes
    ): NestedActionGroup[] => {
      return resolveFinalNestedActionGroupsHelper({
        taskId,
        rootTaskId: task.task_id,
        startTimestamp,
        endTimestamp,
        groups,
        subTaskParentByTaskId,
        nestedActionNodes: resolvedNestedActionNodes,
        createActionNodeGroup,
        cloneNestedActionGroup,
        cloneRecognitionAttempt,
        toTimestampMs,
        intern: (value) => this.stringPool.intern(value),
      })
    }
    const resolveFinalNestedActionGroups = (
      taskId: number,
      startTimestamp: string,
      endTimestamp: string,
      groups: NestedActionGroup[]
    ): NestedActionGroup[] => {
      return resolveNestedActionGroups(taskId, startTimestamp, endTimestamp, groups, nestedActionNodes)
    }
    const refreshActivePipelineNodePreview = (timestamp: string) => {
      refreshActivePipelineNodePreviewHelper({
        timestamp,
        rootTaskId: task.task_id,
        getActivePipelineNode,
        getTaskNextList: () => getTaskNextList(taskScopedNodeAggregationByTaskId, task.task_id),
        currentTaskRecognitions,
        actionLevelRecognitionNodes,
        nestedActionNodes,
        activeSubTaskActionNodes,
        collectSubTaskActionGroups: () => {
          const groups = subTasks
            .peekAsNestedActionGroups(this.stringPool)
            .map((group) => {
              const snapshot = subTaskSnapshots.get(group.task_id)
              return snapshot
                ? mergeSubTaskActionGroupWithSnapshot(group, snapshot, (value) => this.stringPool.intern(value))
                : group
            })
          return groups
        },
        resolveRuntimeNestedActionGroups: ({
          taskId,
          startTimestamp,
          endTimestamp,
          groups,
          nestedActionNodes: runtimeNestedActionNodes,
        }) => resolveNestedActionGroups(
          taskId,
          startTimestamp,
          endTimestamp,
          groups,
          runtimeNestedActionNodes
        ),
        actionRuntimeStates,
        composePipelineNodeFlow,
        summarizeActionFlowStatus,
        createActionRootFlowItem,
        buildWaitFreezesFlowItems: () => buildWaitFreezesFlowItems(
          taskScopedNodeAggregationByTaskId.get(task.task_id)?.waitFreezesRuntimeStates,
          task.task_id,
        ),
        findErrorImageByNames: (eventTs, names) => this.findErrorImageByNames(eventTs, names),
        intern: (value) => this.stringPool.intern(value),
        dedupeRecognitionAttempts,
      })
    }

    // 子任务事件收集器
    const subTasks = new SubTaskCollector()
    const finalizeSubTaskPipelineNodeEvent = (
      subTaskId: number,
      details: Record<string, any>,
      phase: TaskTerminalPhase,
      timestamp: string
    ) => {
      finalizeSubTaskPipelineNodeEventHelper({
        subTaskId,
        details,
        phase,
        timestamp,
        allocateSyntheticNodeId: () => syntheticSubTaskPipelineNodeId--,
        readNumberField,
        resolveTerminalCompletionStatus,
        resolveActionDetailsActionId,
        resolveSubTaskActionKey,
        consumeMatchedSubTaskAction,
        subTasks,
        dedupeRecognitionAttempts,
        attachRecognitionNodesToAttempts,
        resolveFallbackRecoDetails,
        withTimestamps,
        composeFinalPipelineNodeFlow,
        findErrorImageByNames: (eventTs, names) => this.findErrorImageByNames(eventTs, names),
        getTaskNextList,
        taskScopedNodeAggregationByTaskId,
        scopedKey,
        subTaskPipelineNodeStartTimes,
        subTaskActionStartTimes,
        subTaskActionEndTimes,
        subTaskActionStartOrders,
        subTaskActionEndOrders,
        activeSubTaskActionNodes,
        activeRecognitionNodeAttempts,
        clearSubTaskRuntimeStateAfterPipelineFinalize,
        intern: (value) => this.stringPool.intern(value),
      })
      activePipelineNodeIdByTaskId.delete(subTaskId)
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
      activePipelineNodeIdByTaskId.clear()
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
      if (activePipelineNodeId == null) {
        activePipelineNodeIdByTaskId.delete(task.task_id)
      }
    }
    const finalizeTaskPipelineNodeEvent = (
      taskId: number,
      details: Record<string, any>,
      phase: TaskTerminalPhase,
      timestamp: string
    ) => {
      finalizeTaskPipelineNodeEventHelper({
        taskId,
        details,
        phase,
        timestamp,
        readNumberField,
        resolveTerminalCompletionStatus,
        settleCurrentNodeRuntimeStates,
        pipelineNodeStartTimes,
        resolveActionDetailsActionId,
        actionStartTimes,
        actionEndTimes,
        actionStartOrders,
        actionEndOrders,
        currentTaskRecognitions,
        actionLevelRecognitionNodes,
        dedupeRecognitionAttempts,
        splitRecognitionAttemptsByActionWindow,
        recognitionOrderMeta,
        subTasks,
        consumeSubTaskActionGroups: () => subTasks.consumeAsNestedActionGroups(this.stringPool),
        subTaskSnapshots,
        mergeSubTaskActionGroupWithSnapshot,
        attachActionLevelRecognitionAcrossScopes,
        cloneRecognitionAttempt,
        sortByParseOrderThenRecoId,
        pickBestAttemptIndex,
        attachNodeToAttempt,
        resolveFinalNestedActionGroups,
        resolveFallbackRecoDetails,
        withTimestamps,
        composeFinalPipelineNodeFlow,
        findErrorImageByNames: (eventTs, names) => this.findErrorImageByNames(eventTs, names),
        getTaskNextList,
        taskScopedNodeAggregationByTaskId,
        pipelineNodesById,
        resolveEventFocus,
        upsertCurrentTaskPipelineNode,
        cleanupCurrentTaskPipelineRuntimeState,
        intern: (value) => this.stringPool.intern(value),
      })
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
        getActivePipelineNodeId: (eventTaskId) => {
          if (eventTaskId === task.task_id) {
            return getActivePipelineNode()?.node_id
          }
          return activePipelineNodeIdByTaskId.get(eventTaskId)
        },
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
    const handleSimpleNodeEvent = createSimpleNodeEventHandler({
      onNextList: handleNextListNodeEvent,
      onWaitFreezes: handleWaitFreezesNodeEvent,
      onRecognition: handleRecognitionNodeEvent,
    })
    const handleSubTaskActionNodeLifecycleEvent: ScopedActionNodeEventHandler = (
      subTaskId: number | null,
      phase: KnownMaaPhase,
      details: Record<string, any>,
      timestamp: string
    ): void => {
      handleSubTaskActionNodeLifecycleEventHelper({
        subTaskId,
        phase,
        details,
        timestamp,
        startSubTaskActionNode: (id, eventDetails, eventTimestamp) => {
          startSubTaskActionNode({
            subTaskId: id,
            details: eventDetails,
            timestamp: eventTimestamp,
            nestedActionNodes,
            activeSubTaskActionNodes,
            subTaskActionNodeStartTimes,
            withTimestamps,
            intern: (value) => this.stringPool.intern(value),
          })
        },
        finishSubTaskActionNode: (id, eventDetails, eventTimestamp, status) => {
          finishSubTaskActionNode({
            subTaskId: id,
            details: eventDetails,
            timestamp: eventTimestamp,
            status,
            nestedActionNodes,
            activeSubTaskActionNodes,
            subTaskActionNodeStartTimes,
            subTaskActionStartTimes,
            subTaskActionEndTimes,
            withTimestamps,
            intern: (value) => this.stringPool.intern(value),
          })
        },
        resolveTerminalCompletionStatus: (nodePhase) => resolveTerminalCompletionStatus(nodePhase as TaskTerminalPhase),
        refresh: refreshActivePipelineNodePreview,
      })
    }
    const addSubTaskRecognition = (taskId: number, recognition: RecognitionAttempt) => {
      subTasks.addRecognition(taskId, recognition)
    }
    const addSubTaskRecognitionNode = (taskId: number, recognition: RecognitionAttempt) => {
      subTasks.addRecognitionNode(taskId, recognition)
    }
    const {
      currentTaskNodeDispatchConfig,
      subTaskNodeDispatchConfig,
    } = createNodeDispatchConfigs({
      rootTaskId: task.task_id,
      handleSimpleNodeEvent,
      handleCurrentTaskActionEvent,
      handleCurrentTaskActionNodeEvent,
      syncActiveNodeFocusAfterWaitFreezes: (details) => {
        const activeNode = getActivePipelineNode()
        if (activeNode) {
          activeNode.focus = resolveEventFocus(details, activeNode.focus)
        }
      },
      handleSubTaskActionEvent,
      handleSubTaskActionNodeLifecycleEvent,
      startCurrentPipelineNodeEvent: (_taskId, details, timestamp) => {
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
        activePipelineNodeIdByTaskId.set(task.task_id, startedNodeId)
        refreshActivePipelineNodePreview(timestamp)
      },
      startSubTaskPipelineNodeEvent: (subTaskId, details, timestamp) => {
        startSubTaskPipelineNodeEventHelper({
          subTaskId,
          details,
          timestamp,
          scopedKey,
          taskScopedNodeAggregationByTaskId,
          subTaskPipelineNodeStartTimes,
          intern: (value) => this.stringPool.intern(value),
        })
        if (subTaskId != null) {
          const subTaskNodeId = readNumberField(details, 'node_id')
          if (subTaskNodeId != null) {
            activePipelineNodeIdByTaskId.set(subTaskId, subTaskNodeId)
          }
        }
        refreshActivePipelineNodePreview(timestamp)
      },
      finalizeTaskPipelineNodeEvent,
      finalizeSubTaskPipelineNodeEvent,
      pushActionLevelRecognition,
      pushCurrentTaskRecognitionAttempt,
      addSubTaskRecognition,
      addSubTaskRecognitionNode,
    })
    const taskLifecycleMetaContext: TaskLifecycleMetaEventContext = createTaskLifecycleMetaContext({
      rootTaskId: task.task_id,
      taskStackTracker,
      subTaskParentByTaskId,
      subTaskSnapshots,
      getOrCreateSubTaskSnapshot,
      applySubTaskSnapshotStarting,
      applySubTaskSnapshotTerminal,
      intern: (value) => this.stringPool.intern(value),
    })
    processTaskEvents({
      taskEvents,
      rootTaskId: task.task_id,
      getCachedMaaMessageMeta: (message) => this.getCachedMaaMessageMeta(message),
      taskLifecycleMetaContext,
      handleScopedNodeEvent: (taskId, messageMeta, details, timestamp, eventOrder, config) => {
        handleScopedNodeEventHelper({
          taskId,
          messageMeta,
          details,
          timestamp,
          eventOrder,
          config,
          handleRecognitionNodeLifecycleEvent: (args) => {
            handleRecognitionNodeLifecycleEventHelper({
              taskId: args.taskId,
              phase: args.phase,
              details: args.details,
              timestamp: args.timestamp,
              eventOrder: args.eventOrder,
              dispatchPendingRecognition: args.dispatchPendingRecognition,
              dispatchStandaloneRecognition: args.dispatchStandaloneRecognition,
              excludeParentTaskId: args.excludeParentTaskId,
              dispatchDetachedRecognition: args.dispatchDetachedRecognition,
              startRecognitionNodeEvent,
              finalizeRecognitionNodeEvent,
              resolveTerminalCompletionStatus,
              consumeRecognitions: (id) => subTasks.consumeRecognitions(id),
              refresh: refreshActivePipelineNodePreview,
            })
          },
        })
      },
      currentTaskNodeDispatchConfig,
      subTaskNodeDispatchConfig,
    })

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
