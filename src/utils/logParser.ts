import { markRaw } from 'vue'
import type {
  EventNotification,
  TaskInfo,
  NodeInfo,
  RecognitionAttempt,
  NestedActionGroup,
  NestedActionNode,
  UnifiedFlowItem,
  WaitFreezesDetail,
} from '../types'
import { StringPool } from './stringPool'
import { buildActionFlowItems, buildRecognitionFlowItems } from './nodeFlow'

export interface ParseProgress {
  current: number
  total: number
  percentage: number
}

// 事件行正则：提取 timestamp, level, processId, threadId, msg, detailsJson
const EVENT_LINE_REGEX = /^\[([^\]]+)\]\[([^\]]+)\]\[(Px[^\]]+)\]\[(Tx[^\]]+)\].*!!!OnEventNotify!!!\s*\[handle=[^\]]*\]\s*\[msg=([^\]]+)\]\s*\[details=(.*)\]\s*$/

/** FNV-1a hash，将字符串映射为 32 位整数字符串，用于事件去重 key */
function fnv1aHash(str: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = (hash * 0x01000193) >>> 0
  }
  return hash.toString(36)
}

const parseEventTimestampMs = (timestamp: string): number => {
  const normalized = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T')
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

const pad2 = (value: number) => String(value).padStart(2, '0')
const pad3 = (value: number) => String(value).padStart(3, '0')

const formatEventTimestampMs = (timestampMs: number): string => {
  const date = new Date(timestampMs)
  if (!Number.isFinite(date.getTime())) return ''
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}.${pad3(date.getMilliseconds())}`
}

type MaaDomain = 'Resource' | 'Controller' | 'Tasker' | 'Node' | 'Unknown'
type MaaPhase = 'Starting' | 'Succeeded' | 'Failed' | 'Unknown'
type MaaTaskerKind = 'Task' | 'Unknown'
type MaaNodeKind = 'PipelineNode' | 'RecognitionNode' | 'ActionNode' | 'NextList' | 'Recognition' | 'Action' | 'WaitFreezes' | 'Unknown'

interface MaaMessageMeta {
  domain: MaaDomain
  phase: MaaPhase
  taskerKind: MaaTaskerKind
  nodeKind: MaaNodeKind
}

const normalizeMaaDomain = (value: string): MaaDomain => {
  switch (value) {
    case 'Resource':
    case 'Controller':
    case 'Tasker':
    case 'Node':
      return value
    default:
      return 'Unknown'
  }
}

const normalizeMaaPhase = (value: string): MaaPhase => {
  switch (value) {
    case 'Starting':
    case 'Succeeded':
    case 'Failed':
      return value
    default:
      return 'Unknown'
  }
}

const normalizeMaaTaskerKind = (value: string): MaaTaskerKind => {
  return value === 'Task' ? 'Task' : 'Unknown'
}

const normalizeMaaNodeKind = (value: string): MaaNodeKind => {
  switch (value) {
    case 'PipelineNode':
    case 'RecognitionNode':
    case 'ActionNode':
    case 'NextList':
    case 'Recognition':
    case 'Action':
    case 'WaitFreezes':
      return value
    default:
      return 'Unknown'
  }
}

const parseMaaMessageMeta = (message: string): MaaMessageMeta => {
  const firstDot = message.indexOf('.')
  if (firstDot < 0) {
    return { domain: 'Unknown', phase: 'Unknown', taskerKind: 'Unknown', nodeKind: 'Unknown' }
  }
  const secondDot = message.indexOf('.', firstDot + 1)
  if (secondDot < 0) {
    return { domain: 'Unknown', phase: 'Unknown', taskerKind: 'Unknown', nodeKind: 'Unknown' }
  }

  const domainRaw = message.slice(0, firstDot)
  const kindRaw = message.slice(firstDot + 1, secondDot)
  const phaseRaw = message.slice(secondDot + 1)

  const domain = normalizeMaaDomain(domainRaw)
  const phase = normalizeMaaPhase(phaseRaw)
  const taskerKind = domain === 'Tasker' ? normalizeMaaTaskerKind(kindRaw) : 'Unknown'
  const nodeKind = domain === 'Node' ? normalizeMaaNodeKind(kindRaw) : 'Unknown'

  return {
    domain,
    phase,
    taskerKind,
    nodeKind
  }
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

/**
 * 子任务事件收集器
 * 统一管理非当前 task_id 的 Recognition/Action/PipelineNode 事件
 */
class SubTaskCollector {
  private recognitions = new Map<number, RecognitionAttempt[]>()
  private recognitionNodes = new Map<number, RecognitionAttempt[]>()
  private actions = new Map<number, any[]>()
  private pipelineNodes = new Map<number, any[]>()

  addRecognition(taskId: number, attempt: RecognitionAttempt): void {
    if (!this.recognitions.has(taskId)) {
      this.recognitions.set(taskId, [])
    }
    this.recognitions.get(taskId)!.push(attempt)
  }

  addAction(taskId: number, action: any): void {
    if (!this.actions.has(taskId)) {
      this.actions.set(taskId, [])
    }
    this.actions.get(taskId)!.push(action)
  }

  addPipelineNode(taskId: number, node: any): void {
    if (!this.pipelineNodes.has(taskId)) {
      this.pipelineNodes.set(taskId, [])
    }
    this.pipelineNodes.get(taskId)!.push(node)
  }

  consumeRecognitions(taskId: number): RecognitionAttempt[] {
    const result = this.recognitions.get(taskId) || []
    this.recognitions.delete(taskId)
    return result
  }

  addRecognitionNode(taskId: number, attempt: RecognitionAttempt): void {
    if (!this.recognitionNodes.has(taskId)) {
      this.recognitionNodes.set(taskId, [])
    }
    this.recognitionNodes.get(taskId)!.push(attempt)
  }

  consumeRecognitionNodes(taskId: number): RecognitionAttempt[] {
    const result = this.recognitionNodes.get(taskId) || []
    this.recognitionNodes.delete(taskId)
    return result
  }

  consumeOrphanRecognitionNodes(): RecognitionAttempt[] {
    const result: RecognitionAttempt[] = []
    for (const recognitions of this.recognitionNodes.values()) {
      result.push(...recognitions)
    }
    this.recognitionNodes.clear()
    return result
  }

  consumeOrphanRecognitions(): RecognitionAttempt[] {
    const result: RecognitionAttempt[] = []
    for (const recognitions of this.recognitions.values()) {
      result.push(...recognitions)
    }
    this.recognitions.clear()
    return result
  }

  consumeActions(taskId: number): any[] {
    const result = this.actions.get(taskId) || []
    this.actions.delete(taskId)
    return result
  }

  peekActions(taskId: number): any[] {
    return this.actions.get(taskId) || []
  }

  /** 将收集的子任务 PipelineNode 转换为 NestedActionGroup[] 格式 */
  consumeAsNestedActionGroups(stringPool: StringPool): any[] {
    const groups = Array.from(this.pipelineNodes.entries()).map(([taskId, nodes]) => ({
      task_id: taskId,
      name: stringPool.intern(nodes[0]?.name || 'SubTask'),
      ts: stringPool.intern(nodes[0]?.ts || ''),
      status: nodes.some((n: any) => n.status === 'failed')
        ? 'failed'
        : nodes.some((n: any) => n.status === 'running')
          ? 'running'
          : 'success',
      nested_actions: nodes
    }))
    this.pipelineNodes.clear()
    return groups
  }

  clear(): void {
    this.recognitions.clear()
    this.recognitionNodes.clear()
    this.actions.clear()
    this.pipelineNodes.clear()
  }
}

export class LogParser {
  private events: EventNotification[] = []
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
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()
    this.lastEventBySignature.clear()
    this.dedupSignatureTimeline = []
    this.dedupSignatureTimelineHead = 0
    this.eventTokenPool.clear()
    this.syntheticLineNumber = 1
    this.stringPool.clear()
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

    const eventMeta = parseMaaMessageMeta(event.message)
    if (
      eventMeta.domain === 'Tasker' &&
      eventMeta.taskerKind === 'Task' &&
      eventMeta.phase === 'Starting' &&
      event.details.task_id
    ) {
      if (!this.taskProcessMap.has(event.details.task_id)) {
        this.taskProcessMap.set(event.details.task_id, event.processId)
        this.taskThreadMap.set(event.details.task_id, event.threadId)
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
  ): (EventNotification & { processId: string; threadId: string; _dedupSignature: string; _timestampMs: number }) | null {
    const match = line.match(EVENT_LINE_REGEX)
    if (!match) return null

    const [, rawTimestamp, rawLevel, rawProcessId, rawThreadId, rawMsg, detailsJson] = match
    const timestampMs = parseEventTimestampMs(rawTimestamp)
    const timestamp = Number.isFinite(timestampMs)
      ? formatEventTimestampMs(timestampMs)
      : forceCopyString(rawTimestamp)
    const level = this.internEventToken(rawLevel)
    const processId = this.internEventToken(rawProcessId)
    const threadId = this.internEventToken(rawThreadId)
    const msg = this.internEventToken(rawMsg)

    let details: Record<string, any> = {}
    try {
      details = JSON.parse(detailsJson)
    } catch {
      return null
    }

    return {
      timestamp,
      level,
      message: msg,
      details,
      processId,
      threadId,
      _lineNumber: lineNum,
      _dedupSignature: `${msg}|${fnv1aHash(detailsJson)}`,
      _timestampMs: timestampMs
    }
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

    if (typeof details.task_id === 'number') compact.task_id = details.task_id
    if (typeof details.node_id === 'number') compact.node_id = details.node_id
    if (typeof details.reco_id === 'number') compact.reco_id = details.reco_id
    if (typeof details.action_id === 'number') compact.action_id = details.action_id

    if (typeof details.name === 'string') compact.name = this.stringPool.intern(details.name)
    if (typeof details.entry === 'string') compact.entry = this.stringPool.intern(details.entry)
    if (typeof details.status === 'string') compact.status = this.stringPool.intern(details.status)
    if (typeof details.error === 'string') compact.error = this.stringPool.intern(details.error)
    if (typeof details.reason === 'string') compact.reason = this.stringPool.intern(details.reason)
    if (typeof details.uuid === 'string') compact.uuid = this.stringPool.intern(details.uuid)
    if (typeof details.hash === 'string') compact.hash = this.stringPool.intern(details.hash)
    if (typeof details.action === 'string') compact.action = this.stringPool.intern(details.action)
    if (typeof details.anchor === 'string') compact.anchor = this.stringPool.intern(details.anchor)

    if (message.startsWith('Node.WaitFreezes.')) {
      if (typeof details.wf_id === 'number') compact.wf_id = details.wf_id
      if (typeof details.phase === 'string') compact.phase = this.stringPool.intern(details.phase)
      if (typeof details.elapsed === 'number') compact.elapsed = details.elapsed
      if (Object.prototype.hasOwnProperty.call(details, 'focus')) {
        const rawFocus = details.focus
        compact.focus = (rawFocus != null && typeof rawFocus === 'object')
          ? markRaw(rawFocus)
          : rawFocus
      }

      if (Array.isArray(details.reco_ids)) {
        const recoIds = details.reco_ids
          .map((item: unknown) => typeof item === 'number' ? item : Number(item))
          .filter((item: number) => Number.isFinite(item))
        if (recoIds.length > 0) {
          compact.reco_ids = markRaw(recoIds)
        }
      }

      if (Array.isArray(details.roi) && details.roi.length === 4) {
        const roi = details.roi
          .map((item: unknown) => typeof item === 'number' ? item : Number(item))
          .filter((item: number) => Number.isFinite(item))
        if (roi.length === 4) {
          compact.roi = markRaw(roi)
        }
      }

      if (details.param && typeof details.param === 'object') {
        const rawParam = details.param as Record<string, unknown>
        const param: Record<string, unknown> = {}
        if (typeof rawParam.method === 'number') param.method = rawParam.method
        if (typeof rawParam.rate_limit === 'number') param.rate_limit = rawParam.rate_limit
        if (typeof rawParam.threshold === 'number') param.threshold = rawParam.threshold
        if (typeof rawParam.time === 'number') param.time = rawParam.time
        if (typeof rawParam.timeout === 'number') param.timeout = rawParam.timeout
        if (Object.keys(param).length > 0) {
          compact.param = markRaw(param)
        }
      }
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
      const raw = details.action_details as Record<string, unknown>
      const actionDetails: Record<string, unknown> = {}
      if (typeof raw.action_id === 'number') actionDetails.action_id = raw.action_id
      if (typeof raw.action === 'string') actionDetails.action = this.stringPool.intern(raw.action)
      if (typeof raw.name === 'string') actionDetails.name = this.stringPool.intern(raw.name)
      if (typeof raw.success === 'boolean') actionDetails.success = raw.success
      if (Object.keys(actionDetails).length > 0) {
        compact.action_details = markRaw(actionDetails)
      }
    }

    if (details.node_details && typeof details.node_details === 'object') {
      const raw = details.node_details as Record<string, unknown>
      const nodeDetails: Record<string, unknown> = {}
      if (typeof raw.action_id === 'number') nodeDetails.action_id = raw.action_id
      if (typeof raw.node_id === 'number') nodeDetails.node_id = raw.node_id
      if (Object.keys(nodeDetails).length > 0) {
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
      const meta = parseMaaMessageMeta(message)

      if (meta.domain === 'Tasker' && meta.taskerKind === 'Task' && meta.phase === 'Starting') {
        const taskId = details.task_id
        const uuid = details.uuid || ''

        const isDuplicate = tasks.some(t =>
          t.uuid === uuid && t.task_id === taskId && !t.end_time
        )

        if (taskId && !isDuplicate) {
          tasks.push({
            task_id: taskId,
            entry: this.stringPool.intern(details.entry || ''),
            hash: this.stringPool.intern(details.hash || ''),
            uuid: this.stringPool.intern(uuid),
            start_time: this.stringPool.intern(event.timestamp),
            status: 'running',
            nodes: [],
            events: [],
            duration: undefined,
            _startEventIndex: i
          })
        }
      } else if (
        meta.domain === 'Tasker' &&
        meta.taskerKind === 'Task' &&
        (meta.phase === 'Succeeded' || meta.phase === 'Failed')
      ) {
        const taskId = details.task_id
        const uuid = details.uuid

        let matchedTask = null
        if (uuid && uuid.trim() !== '') {
          matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
        } else {
          matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
        }

        if (matchedTask) {
          matchedTask.status = meta.phase === 'Succeeded' ? 'succeeded' : 'failed'
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
          .filter(event => event.details?.task_id === task.task_id)
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

    type SubTaskStatus = 'running' | 'succeeded' | 'failed'
    type SubTaskSnapshot = {
      task_id: number
      entry?: string
      hash?: string
      uuid?: string
      status: SubTaskStatus
      ts?: string
      end_ts?: string
      start_message?: string
      end_message?: string
      start_details?: Record<string, any>
      end_details?: Record<string, any>
    }
    type WaitFreezesRuntimeState = {
      wf_id: number
      name: string
      phase?: string
      ts: string
      end_ts?: string
      status: 'running' | 'success' | 'failed'
      elapsed?: number
      reco_ids?: number[]
      roi?: [number, number, number, number]
      param?: WaitFreezesDetail['param']
      focus?: any
      images?: string[]
      order: number
    }

    // 当前节点的累积状态
    let currentNextList: any[] = []
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
    const waitFreezesRuntimeStates = new Map<number, WaitFreezesRuntimeState>()
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
    const activeTaskStack: number[] = [task.task_id]
    const activeRecognitionAttempts = new Map<string, RecognitionAttempt>()
    const activeRecognitionStack: Array<{ taskId: number; recoId: number }> = []
    const finishedRecognitionKeys = new Set<string>()
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()

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
    const toNextListItems = (list: any[]) => {
      return list.map((item: any) => ({
        name: this.stringPool.intern(item.name || ''),
        anchor: item.anchor || false,
        jump_back: item.jump_back || false
      }))
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
    const normalizeWaitFreezesId = (value: unknown): number | null => {
      const wfId = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(wfId) ? wfId : null
    }
    const normalizeNumericArray = (value: unknown): number[] | undefined => {
      if (!Array.isArray(value)) return undefined
      const normalized = value
        .map((item: unknown) => typeof item === 'number' ? item : Number(item))
        .filter((item: number) => Number.isFinite(item))
      return normalized.length > 0 ? normalized : undefined
    }
    const parseWaitFreezesRoi = (value: unknown): [number, number, number, number] | undefined => {
      const normalized = normalizeNumericArray(value)
      if (!normalized || normalized.length !== 4) return undefined
      return [normalized[0], normalized[1], normalized[2], normalized[3]]
    }
    const parseWaitFreezesParam = (value: unknown): WaitFreezesDetail['param'] | undefined => {
      if (!value || typeof value !== 'object') return undefined
      const raw = value as Record<string, unknown>
      const param: WaitFreezesDetail['param'] = {}
      if (typeof raw.method === 'number') param.method = raw.method
      if (typeof raw.rate_limit === 'number') param.rate_limit = raw.rate_limit
      if (typeof raw.threshold === 'number') param.threshold = raw.threshold
      if (typeof raw.time === 'number') param.time = raw.time
      if (typeof raw.timeout === 'number') param.timeout = raw.timeout
      return Object.keys(param).length > 0 ? param : undefined
    }
    const toWaitFreezesFlowItem = (state: WaitFreezesRuntimeState): UnifiedFlowItem => {
      return {
        id: `node.wait_freezes.${state.wf_id}`,
        type: 'wait_freezes',
        name: state.name || 'WaitFreezes',
        status: state.status,
        ts: state.ts,
        end_ts: state.end_ts,
        wait_freezes_details: markRaw({
          wf_id: state.wf_id,
          phase: state.phase,
          elapsed: state.elapsed,
          reco_ids: state.reco_ids,
          roi: state.roi,
          param: state.param,
          focus: state.focus,
          images: state.images,
        }),
      }
    }
    const sortFlowItemsByTimestamp = (items: UnifiedFlowItem[]): UnifiedFlowItem[] => {
      return items
        .map((item, index) => ({ item, index }))
        .sort((a, b) => {
          const delta = toTimestampMs(a.item.ts || a.item.end_ts) - toTimestampMs(b.item.ts || b.item.end_ts)
          if (delta !== 0) return delta
          return a.index - b.index
        })
        .map(({ item }) => item)
    }
    const findBestRecognitionParentFlowItem = (
      flowItems: UnifiedFlowItem[],
      target: UnifiedFlowItem
    ): UnifiedFlowItem | null => {
      const targetTs = toTimestampMs(target.ts || target.end_ts)
      if (!Number.isFinite(targetTs)) return null

      let bestItem: UnifiedFlowItem | null = null
      let bestDepth = -1
      let bestStartMs = Number.NEGATIVE_INFINITY
      const visit = (items: UnifiedFlowItem[], depth: number) => {
        for (const item of items) {
          if (item.type === 'recognition' || item.type === 'recognition_node') {
            const startMs = toTimestampMs(item.ts || item.end_ts)
            const endMs = toTimestampMs(item.end_ts || item.ts)
            const inRange =
              Number.isFinite(startMs) &&
              targetTs >= startMs &&
              (!Number.isFinite(endMs) || targetTs <= endMs + 1)
            if (inRange) {
              if (
                !bestItem ||
                depth > bestDepth ||
                (depth === bestDepth && startMs >= bestStartMs)
              ) {
                bestItem = item
                bestDepth = depth
                bestStartMs = startMs
              }
            }
          }
          if (item.children && item.children.length > 0) {
            visit(item.children, depth + 1)
          }
        }
      }

      visit(flowItems, 0)
      return bestItem
    }
    const splitAndAttachWaitFreezesFlowItems = (
      recognitionFlow: UnifiedFlowItem[],
      actionFlow: UnifiedFlowItem[],
      waitFreezesFlow: UnifiedFlowItem[]
    ) => {
      const contextItems: UnifiedFlowItem[] = []
      const nonContextItems: UnifiedFlowItem[] = []
      for (const item of waitFreezesFlow) {
        const phase = item.wait_freezes_details?.phase
        if (phase === 'context') {
          contextItems.push(item)
        } else {
          nonContextItems.push(item)
        }
      }

      const unassignedContextItems: UnifiedFlowItem[] = []
      for (const wfItem of contextItems) {
        const parent =
          findBestRecognitionParentFlowItem(recognitionFlow, wfItem) ||
          findBestRecognitionParentFlowItem(actionFlow, wfItem)
        if (!parent) {
          unassignedContextItems.push(wfItem)
          continue
        }
        const mergedChildren = sortFlowItemsByTimestamp([
          ...(parent.children ?? []),
          wfItem,
        ])
        parent.children = mergedChildren
      }

      return {
        recognitionFlow,
        actionFlow,
        actionScopeWaitFreezes: sortFlowItemsByTimestamp(nonContextItems),
        unassignedContextWaitFreezes: sortFlowItemsByTimestamp(unassignedContextItems),
      }
    }
    const partitionActionScopeWaitFreezes = (
      waitFreezesItems: UnifiedFlowItem[],
      actionStartTs?: string,
      actionEndTs?: string,
      actionStatus?: UnifiedFlowItem['status']
    ) => {
      const before: UnifiedFlowItem[] = []
      const inside: UnifiedFlowItem[] = []
      const after: UnifiedFlowItem[] = []
      const startMs = toTimestampMs(actionStartTs)
      const endMs = actionStatus === 'running'
        ? Number.POSITIVE_INFINITY
        : toTimestampMs(actionEndTs)
      const hasActionWindow = Number.isFinite(startMs) || Number.isFinite(endMs)

      for (const item of waitFreezesItems) {
        const itemMs = toTimestampMs(item.ts || item.end_ts)

        // No active action window: keep WF at outer timeline level.
        if (!hasActionWindow) {
          before.push(item)
          continue
        }

        if (Number.isFinite(startMs) && itemMs < startMs) {
          before.push(item)
          continue
        }
        if (Number.isFinite(endMs) && itemMs > endMs + 1) {
          after.push(item)
          continue
        }
        inside.push(item)
      }

      return {
        before: sortFlowItemsByTimestamp(before),
        inside: sortFlowItemsByTimestamp(inside),
        after: sortFlowItemsByTimestamp(after),
      }
    }
    const buildWaitFreezesFlowItems = (): UnifiedFlowItem[] => {
      return Array.from(waitFreezesRuntimeStates.values())
        .sort((a, b) => {
          const delta = a.order - b.order
          if (delta !== 0) return delta
          return a.wf_id - b.wf_id
        })
        .map(toWaitFreezesFlowItem)
    }
    const upsertWaitFreezesState = (
      details: Record<string, any>,
      timestamp: string,
      status: 'running' | 'success' | 'failed',
      eventOrder: number
    ) => {
      const wfId = normalizeWaitFreezesId(details.wf_id)
      if (wfId == null) return

      const existing = waitFreezesRuntimeStates.get(wfId)
      const nowTs = this.stringPool.intern(timestamp)
      const fallbackName = (typeof details.name === 'string' && details.name.trim())
        ? details.name
        : existing?.name
      const activeNodeName = getActivePipelineNode()?.name
      const name = this.stringPool.intern(fallbackName || activeNodeName || 'WaitFreezes')
      const rawPhase = typeof details.phase === 'string' ? details.phase.trim() : ''
      const phase = rawPhase ? this.stringPool.intern(rawPhase) : existing?.phase
      const elapsed = typeof details.elapsed === 'number' ? details.elapsed : existing?.elapsed
      const recoIds = normalizeNumericArray(details.reco_ids) ?? existing?.reco_ids
      const roi = parseWaitFreezesRoi(details.roi) ?? existing?.roi
      const param = parseWaitFreezesParam(details.param) ?? existing?.param
      const focus = resolveEventFocus(details, existing?.focus)
      const images = this.findWaitFreezesImages(timestamp, name) ?? existing?.images

      waitFreezesRuntimeStates.set(wfId, {
        wf_id: wfId,
        name,
        phase,
        ts: existing?.ts || nowTs,
        end_ts: status === 'running' ? (existing?.end_ts || nowTs) : nowTs,
        status,
        elapsed,
        reco_ids: recoIds,
        roi,
        param,
        focus,
        images,
        order: existing?.order ?? eventOrder,
      })
    }
    const markRawTaskDetails = (details: Record<string, any> | undefined): Record<string, any> | undefined => {
      if (!details) return undefined
      return markRaw({ ...details })
    }
    const getOrCreateSubTaskSnapshot = (taskId: number): SubTaskSnapshot => {
      const existing = subTaskSnapshots.get(taskId)
      if (existing) return existing
      const created: SubTaskSnapshot = {
        task_id: taskId,
        status: 'running'
      }
      subTaskSnapshots.set(taskId, created)
      return created
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
    const completeRecognitionNodeAttempt = (params: {
      attempt: RecognitionAttempt
      recoId: number
      details: Record<string, any>
      timestamp: string
      status: 'success' | 'failed'
      eventOrder: number
      startTimestamp: string
    }) => {
      const { attempt, recoId, details, timestamp, status, eventOrder, startTimestamp } = params
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
      onAttempt?: (attempt: RecognitionAttempt) => void
    ) => {
      const attempt = startRecognitionAttempt(taskId, details, timestamp, eventOrder)
      if (attempt && onAttempt) {
        onAttempt(attempt)
      }
    }
    const handleRecognitionFinishEvent = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      status: 'success' | 'failed',
      eventOrder: number,
      onAttempt?: (attempt: RecognitionAttempt) => void
    ) => {
      const attempt = finishRecognitionAttempt(taskId, details, timestamp, status, eventOrder)
      if (attempt && onAttempt) {
        onAttempt(attempt)
      }
    }
    const applyCurrentNextList = (list: any[]) => {
      currentNextList = list
      const activeNode = getActivePipelineNode()
      if (activeNode) {
        activeNode.next_list = toNextListItems(currentNextList)
      }
    }
    const mergeRecognitionOrderMeta = (target: RecognitionAttempt, source: RecognitionAttempt) => {
      const targetMeta = recognitionOrderMeta.get(target)
      const sourceMeta = recognitionOrderMeta.get(source)
      if (!targetMeta && !sourceMeta) return
      recognitionOrderMeta.set(target, {
        startSeq:
          targetMeta && sourceMeta
            ? Math.min(targetMeta.startSeq, sourceMeta.startSeq)
            : (targetMeta?.startSeq ?? sourceMeta!.startSeq),
        endSeq:
          targetMeta && sourceMeta
            ? Math.max(targetMeta.endSeq, sourceMeta.endSeq)
            : (targetMeta?.endSeq ?? sourceMeta!.endSeq)
      })
    }
    const mergeRecognitionAttempts = (
      left: RecognitionAttempt,
      right: RecognitionAttempt
    ): RecognitionAttempt => {
      const leftEnded = left.status !== 'running'
      const rightEnded = right.status !== 'running'
      const leftEndTs = left.end_ts ?? ''
      const rightEndTs = right.end_ts ?? ''

      let preferred = left
      let secondary = right

      if (rightEnded && !leftEnded) {
        preferred = right
        secondary = left
      } else if (rightEnded === leftEnded && rightEndTs > leftEndTs) {
        preferred = right
        secondary = left
      }

      if (!preferred.name && secondary.name) {
        preferred.name = secondary.name
      }
      if (!preferred.ts && secondary.ts) {
        preferred.ts = secondary.ts
      }
      if (secondary.end_ts && (!preferred.end_ts || secondary.end_ts > preferred.end_ts)) {
        preferred.end_ts = secondary.end_ts
      }
      if (preferred.status === 'running' && secondary.status !== 'running') {
        preferred.status = secondary.status
      }
      if (!preferred.reco_details && secondary.reco_details) {
        preferred.reco_details = secondary.reco_details
      }
      if (!preferred.anchor_name && secondary.anchor_name) {
        preferred.anchor_name = secondary.anchor_name
      }
      if (!preferred.error_image && secondary.error_image) {
        preferred.error_image = secondary.error_image
      }
      if (!preferred.vision_image && secondary.vision_image) {
        preferred.vision_image = secondary.vision_image
      }

      const mergedNestedNodes = [
        ...(preferred.nested_nodes ?? []),
        ...(secondary.nested_nodes ?? [])
      ]
      preferred.nested_nodes = mergedNestedNodes.length > 0
        ? dedupeRecognitionAttempts(mergedNestedNodes)
        : undefined

      mergeRecognitionOrderMeta(preferred, secondary)
      return preferred
    }
    const dedupeRecognitionAttempts = (items: RecognitionAttempt[]) => {
      const mergedByRecoId = new Map<number, RecognitionAttempt>()
      const order: number[] = []
      for (const item of items) {
        const existing = mergedByRecoId.get(item.reco_id)
        if (!existing) {
          mergedByRecoId.set(item.reco_id, item)
          order.push(item.reco_id)
          continue
        }
        mergedByRecoId.set(item.reco_id, mergeRecognitionAttempts(existing, item))
      }
      return order
        .map((recoId) => mergedByRecoId.get(recoId))
        .filter((item): item is RecognitionAttempt => !!item)
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
    const sortByParseOrderThenRecoId = (items: RecognitionAttempt[]) => {
      return [...items].sort((a, b) => {
        const am = recognitionOrderMeta.get(a)
        const bm = recognitionOrderMeta.get(b)
        const aEnd = am?.endSeq ?? Number.POSITIVE_INFINITY
        const bEnd = bm?.endSeq ?? Number.POSITIVE_INFINITY
        if (aEnd !== bEnd) return aEnd - bEnd
        const aStart = am?.startSeq ?? Number.POSITIVE_INFINITY
        const bStart = bm?.startSeq ?? Number.POSITIVE_INFINITY
        if (aStart !== bStart) return aStart - bStart
        return a.reco_id - b.reco_id
      })
    }
    const pickBestAttemptIndex = (attempts: RecognitionAttempt[], node: RecognitionAttempt): number => {
      const nodeMeta = recognitionOrderMeta.get(node)
      if (!nodeMeta) {
        return attempts.length === 1 ? 0 : -1
      }
      const nodeStartSeq = nodeMeta.startSeq

      type Candidate = {
        idx: number
        bucket: number
        startSeq: number
        endSeq: number
        distance: number
      }

      let best: Candidate | null = null

      for (let i = 0; i < attempts.length; i++) {
        const attempt = attempts[i]
        const meta = recognitionOrderMeta.get(attempt)
        if (!meta) continue
        const startSeq = meta.startSeq
        const endSeq = Math.max(meta.startSeq, meta.endSeq)

        let bucket = Number.POSITIVE_INFINITY
        let distance = Number.POSITIVE_INFINITY

        // bucket 0: 节点顺序落在识别尝试区间内
        if (nodeStartSeq >= startSeq && nodeStartSeq <= endSeq) {
          bucket = 0
          distance = 0
        }
        // bucket 1: 节点出现在识别尝试之后，优先挂到最近结束的尝试
        else if (nodeStartSeq >= endSeq) {
          bucket = 1
          distance = nodeStartSeq - endSeq
        }
        else {
          continue
        }

        const current: Candidate = { idx: i, bucket, startSeq, endSeq, distance }
        if (!best) {
          best = current
          continue
        }

        if (current.bucket < best.bucket) {
          best = current
          continue
        }
        if (current.bucket > best.bucket) continue

        // 同一 bucket 下优先归属到更晚开始的尝试，避免挂到上一轮节点
        if (current.startSeq > best.startSeq) {
          best = current
          continue
        }
        if (current.startSeq < best.startSeq) continue

        if (current.distance < best.distance) {
          best = current
          continue
        }
        if (current.distance > best.distance) continue

        if (current.endSeq > best.endSeq) {
          best = current
        }
      }

      return best?.idx ?? -1
    }
    const attachRecognitionNodesToAttempts = (
      attempts: RecognitionAttempt[],
      recognitionNodes: RecognitionAttempt[]
    ) => {
      if (attempts.length === 0) {
        return {
          attempts: [] as RecognitionAttempt[],
          orphans: recognitionNodes
        }
      }

      const mergedAttempts = attempts.map((attempt) => {
        const cloned: RecognitionAttempt = {
          ...attempt,
          nested_nodes: attempt.nested_nodes ? [...attempt.nested_nodes] : undefined
        }
        const meta = recognitionOrderMeta.get(attempt)
        if (meta) {
          recognitionOrderMeta.set(cloned, { ...meta })
        }
        return cloned
      })
      const sortedNodes = sortByParseOrderThenRecoId(recognitionNodes)
      const orphans: RecognitionAttempt[] = []

      for (const node of sortedNodes) {
        let targetIdx = pickBestAttemptIndex(mergedAttempts, node)

        if (targetIdx < 0) {
          orphans.push(node)
          continue
        }

        const target = mergedAttempts[targetIdx]
        const mergedNested = dedupeRecognitionAttempts([
          ...(target.nested_nodes ?? []),
          node
        ])
        target.nested_nodes = mergedNested
      }

      return {
        attempts: mergedAttempts,
        orphans
      }
    }
    const cloneRecognitionAttempt = (attempt: RecognitionAttempt): RecognitionAttempt => {
      const cloned: RecognitionAttempt = {
        ...attempt,
        nested_nodes: attempt.nested_nodes ? dedupeRecognitionAttempts([...attempt.nested_nodes]) : undefined
      }
      const meta = recognitionOrderMeta.get(attempt)
      if (meta) {
        recognitionOrderMeta.set(cloned, { ...meta })
      }
      return cloned
    }
    const attachNodeToAttempt = (attempt: RecognitionAttempt, node: RecognitionAttempt) => {
      const mergedNested = dedupeRecognitionAttempts([
        ...(attempt.nested_nodes ?? []),
        node
      ])
      attempt.nested_nodes = mergedNested
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
    const cloneNestedActionGroup = (group: NestedActionGroup): NestedActionGroup => {
      return {
        ...group,
        nested_actions: (group.nested_actions ?? []).map((action) => ({
          ...action,
          recognitions: (action.recognitions ?? []).map(cloneRecognitionAttempt),
          child_tasks: action.child_tasks?.map(cloneNestedActionGroup),
        })),
      }
    }
    const traverseNestedActionNodes = (
      groups: NestedActionGroup[],
      visitor: (action: NestedActionNode) => boolean
    ): boolean => {
      for (const group of groups) {
        for (const action of group.nested_actions ?? []) {
          if (visitor(action)) return true
          if (action.child_tasks && action.child_tasks.length > 0) {
            if (traverseNestedActionNodes(action.child_tasks, visitor)) return true
          }
        }
      }
      return false
    }
    const attachActionLevelRecognitionAcrossScopes = (
      topLevelAttempts: RecognitionAttempt[],
      nestedActionGroups: NestedActionGroup[],
      actionLevelNodes: RecognitionAttempt[],
      actionStartOrder?: number
    ) => {
      const mergedTopLevelAttempts = topLevelAttempts.map(cloneRecognitionAttempt)
      const mergedNestedGroups = nestedActionGroups.map(cloneNestedActionGroup)
      const remaining: RecognitionAttempt[] = []
      const orderedNodes = sortByParseOrderThenRecoId(actionLevelNodes)

      for (const node of orderedNodes) {
        // 1) 优先挂到 nested action 的识别尝试（如 CCUpdate 下的 count_xxx）
        let attached = traverseNestedActionNodes(mergedNestedGroups, (action) => {
          const attempts: RecognitionAttempt[] = action.recognitions ?? []
          if (!attempts.length) return false
          const idx = pickBestAttemptIndex(attempts, node)
          if (idx < 0) return false
          attachNodeToAttempt(attempts[idx], node)
          return true
        })
        if (attached) continue

        // 2) 再挂到顶层识别尝试（如 CCBuyCard 的 custom rec）
        // 仅允许挂载 action 开始前产生的节点，action 期内节点应保持在 action 作用域
        const nodeMeta = recognitionOrderMeta.get(node)
        const canAttachToTopLevel = mergedTopLevelAttempts.length > 0 && (
          actionStartOrder == null ||
          (nodeMeta != null && nodeMeta.startSeq < actionStartOrder)
        )
        if (canAttachToTopLevel) {
          const idx = pickBestAttemptIndex(mergedTopLevelAttempts, node)
          if (idx >= 0) {
            attachNodeToAttempt(mergedTopLevelAttempts[idx], node)
            attached = true
          }
        }

        if (!attached) {
          remaining.push(node)
        }
      }

      return {
        topLevelAttempts: mergedTopLevelAttempts,
        nestedActionGroups: mergedNestedGroups,
        remaining: dedupeRecognitionAttempts(remaining)
      }
    }
    const pickParentActionNodeForSubTask = (
      parentGroup: NestedActionGroup,
      childGroup: NestedActionGroup
    ): NestedActionNode | null => {
      const childStartMs = toTimestampMs(childGroup.ts)
      type Candidate = {
        node: NestedActionNode
        bucket: number
        customPenalty: number
        distance: number
        startMs: number
      }
      let best: Candidate | null = null

      for (const node of parentGroup.nested_actions ?? []) {
        const startMs = toTimestampMs(node.action_details?.ts || node.ts)
        const endMs = toTimestampMs(node.action_details?.end_ts || node.end_ts || node.ts)
        const inRange = Number.isFinite(childStartMs) &&
          Number.isFinite(startMs) &&
          childStartMs >= startMs &&
          (!Number.isFinite(endMs) || childStartMs <= endMs + 1)
        const bucket = inRange ? 0 : 1
        const customPenalty = node.action_details?.action === 'Custom' ? 0 : 1
        const distance = Number.isFinite(childStartMs) && Number.isFinite(endMs)
          ? Math.abs(childStartMs - endMs)
          : Number.POSITIVE_INFINITY
        const candidate: Candidate = {
          node,
          bucket,
          customPenalty,
          distance,
          startMs,
        }

        if (!best) {
          best = candidate
          continue
        }
        if (candidate.bucket !== best.bucket) {
          if (candidate.bucket < best.bucket) best = candidate
          continue
        }
        if (candidate.customPenalty !== best.customPenalty) {
          if (candidate.customPenalty < best.customPenalty) best = candidate
          continue
        }
        if (candidate.distance !== best.distance) {
          if (candidate.distance < best.distance) best = candidate
          continue
        }
        if (candidate.startMs > best.startMs) {
          best = candidate
        }
      }

      if (best == null) return null
      return best.node
    }
    const pickParentActionNodeByTimeline = (
      groups: NestedActionGroup[],
      childGroup: NestedActionGroup
    ): NestedActionNode | null => {
      const childStartMs = toTimestampMs(childGroup.ts)
      if (!Number.isFinite(childStartMs)) return null

      let bestNode: NestedActionNode | null = null
      let bestBucket = Number.POSITIVE_INFINITY
      let bestCustomPenalty = Number.POSITIVE_INFINITY
      let bestStartMs = Number.NEGATIVE_INFINITY

      const scanGroup = (group: NestedActionGroup) => {
        for (const node of group.nested_actions ?? []) {
          const actionStartMs = toTimestampMs(node.action_details?.ts || node.ts)
          const actionEndMs = toTimestampMs(node.action_details?.end_ts || node.end_ts || node.ts)
          const contains =
            Number.isFinite(actionStartMs) &&
            childStartMs >= actionStartMs &&
            (!Number.isFinite(actionEndMs) || childStartMs <= actionEndMs + 1)
          if (contains) {
            const bucket = 0
            const customPenalty = node.action_details?.action === 'Custom' ? 0 : 1
            const isBetter =
              bucket < bestBucket ||
              (bucket === bestBucket && customPenalty < bestCustomPenalty) ||
              (bucket === bestBucket && customPenalty === bestCustomPenalty && actionStartMs > bestStartMs)
            if (isBetter) {
              bestNode = node
              bestBucket = bucket
              bestCustomPenalty = customPenalty
              bestStartMs = actionStartMs
            }
          }

          if (node.child_tasks && node.child_tasks.length > 0) {
            for (const childTask of node.child_tasks) {
              scanGroup(childTask)
            }
          }
        }
      }

      for (const group of groups) {
        if (group.task_id === childGroup.task_id) continue
        scanGroup(group)
      }

      return bestNode
    }
    const sortNestedTaskGroupTree = (group: NestedActionGroup) => {
      for (const action of group.nested_actions ?? []) {
        if (action.child_tasks && action.child_tasks.length > 0) {
          action.child_tasks.sort((a, b) => toTimestampMs(a.ts) - toTimestampMs(b.ts))
          for (const child of action.child_tasks) {
            sortNestedTaskGroupTree(child)
          }
        }
      }
    }
    const nestSubTaskActionGroups = (groups: NestedActionGroup[]): NestedActionGroup[] => {
      if (groups.length <= 1) return groups

      const clonedGroups = groups.map(cloneNestedActionGroup)
      const groupByTaskId = new Map<number, NestedActionGroup>()
      for (const group of clonedGroups) {
        groupByTaskId.set(group.task_id, group)
      }

      const roots: NestedActionGroup[] = []
      const orderedGroups = [...clonedGroups].sort((a, b) => toTimestampMs(a.ts) - toTimestampMs(b.ts))

      for (const group of orderedGroups) {
        const parentTaskId = subTaskParentByTaskId.get(group.task_id)
        const parentGroup = (
          parentTaskId != null &&
          parentTaskId !== task.task_id &&
          parentTaskId !== group.task_id
        ) ? groupByTaskId.get(parentTaskId) : undefined
        const parentActionNode = parentGroup
          ? pickParentActionNodeForSubTask(parentGroup, group)
          : pickParentActionNodeByTimeline(clonedGroups, group)
        if (!parentActionNode) {
          roots.push(group)
          continue
        }

        const existing = parentActionNode.child_tasks ?? []
        parentActionNode.child_tasks = [...existing, group]
      }

      roots.sort((a, b) => toTimestampMs(a.ts) - toTimestampMs(b.ts))
      for (const root of roots) {
        sortNestedTaskGroupTree(root)
      }
      return roots
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
    const summarizeActionFlowStatus = (
      items: UnifiedFlowItem[]
    ): 'success' | 'failed' | 'running' | null => {
      if (items.length === 0) return null
      if (items.some(item => item.status === 'failed')) return 'failed'
      if (items.some(item => item.status === 'running')) return 'running'
      return 'success'
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
      } = splitAndAttachWaitFreezesFlowItems(
        recognitionFlow,
        actionFlow,
        params.waitFreezesFlow
      )
      const actionScopeWaitFreezesAll = [...actionScopeWaitFreezes, ...unassignedContextWaitFreezes]

      const actionRootBase = params.createActionRoot(actionFlow)
      const actionRoot: UnifiedFlowItem | null = actionRootBase
        ? {
            ...actionRootBase,
            children: scopedActionFlow.length > 0
              ? sortFlowItemsByTimestamp([
                  ...(actionRootBase.children ?? []),
                  ...scopedActionFlow,
                ])
              : actionRootBase.children,
          }
        : null

      const waitFreezesPlacement = partitionActionScopeWaitFreezes(
        actionScopeWaitFreezesAll,
        actionRoot?.ts,
        actionRoot?.end_ts,
        actionRoot?.status,
      )
      if (actionRoot && waitFreezesPlacement.inside.length > 0) {
        actionRoot.children = sortFlowItemsByTimestamp([
          ...(actionRoot.children ?? []),
          ...waitFreezesPlacement.inside,
        ])
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
      activeNode.next_list = toNextListItems(currentNextList)

      const topLevelRecognitions = dedupeRecognitionAttempts(currentTaskRecognitions)
      const actionRecognitions = dedupeRecognitionAttempts(actionLevelRecognitionNodes)
      const runtimeNestedActionNodes = dedupeNestedActionNodes([
        ...nestedActionNodes,
        ...activeSubTaskActionNodes.values(),
      ])

      const runtimeNestedActionGroups: NestedActionGroup[] = runtimeNestedActionNodes.length > 0
        ? [{
            task_id: task.task_id,
            name: this.stringPool.intern('ActionNode'),
            ts: activeNode.ts,
            end_ts: nowTimestamp,
            status: runtimeNestedActionNodes.some(item => item.status === 'failed')
              ? 'failed'
              : runtimeNestedActionNodes.some(item => item.status === 'running')
                ? 'running'
                : 'success',
            nested_actions: runtimeNestedActionNodes,
          }]
        : []

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
        waitFreezesFlow: buildWaitFreezesFlowItems(),
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
    const getActivePipelineNode = (): NodeInfo | null => {
      if (activePipelineNodeId == null) return null
      const node = pipelineNodesById.get(activePipelineNodeId)
      if (!node || node.status !== 'running') return null
      return node
    }
    const resetCurrentNodeAggregation = () => {
      currentNextList = []
      currentTaskRecognitions.length = 0
      nestedActionNodes.length = 0
      actionLevelRecognitionNodes.length = 0
      activeRecognitionNodeAttempts.clear()
      actionRuntimeStates.clear()
      waitFreezesRuntimeStates.clear()
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
      for (const state of waitFreezesRuntimeStates.values()) {
        if (state.status !== 'running') continue
        state.status = fallbackStatus
        state.end_ts = endTimestamp
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

    for (let eventIndex = 0; eventIndex < taskEvents.length; eventIndex++) {
      const event = taskEvents[eventIndex]
      const eventOrder = eventIndex
      const { message, details } = event
      const messageMeta = parseMaaMessageMeta(message)

      if (
        messageMeta.domain === 'Tasker' &&
        messageMeta.taskerKind === 'Task' &&
        details.task_id != null
      ) {
        const eventTaskId = details.task_id as number

        if (messageMeta.phase === 'Starting') {
          const parentTaskId = peekActiveTask()
          if (eventTaskId !== task.task_id && parentTaskId !== eventTaskId) {
            subTaskParentByTaskId.set(eventTaskId, parentTaskId)
          }
          pushActiveTask(eventTaskId)
        } else if (messageMeta.phase === 'Succeeded' || messageMeta.phase === 'Failed') {
          popActiveTask(eventTaskId)
        }

        if (eventTaskId !== task.task_id) {
          const snapshot = getOrCreateSubTaskSnapshot(eventTaskId)
          if (messageMeta.phase === 'Starting') {
            snapshot.entry = this.stringPool.intern(details.entry || '')
            snapshot.hash = this.stringPool.intern(details.hash || '')
            snapshot.uuid = this.stringPool.intern(details.uuid || '')
            snapshot.status = 'running'
            snapshot.ts = this.stringPool.intern(event.timestamp)
            snapshot.start_message = this.stringPool.intern(message)
            snapshot.start_details = markRawTaskDetails(details)
          } else if (messageMeta.phase === 'Succeeded' || messageMeta.phase === 'Failed') {
            snapshot.status = messageMeta.phase === 'Succeeded' ? 'succeeded' : 'failed'
            snapshot.end_ts = this.stringPool.intern(event.timestamp)
            snapshot.end_message = this.stringPool.intern(message)
            snapshot.end_details = markRawTaskDetails(details)
          }
        }
      }

      if (messageMeta.domain !== 'Node') continue
      const isCurrentTask = details.task_id === task.task_id

      // === 当前任务的事件 ===
      if (isCurrentTask) {
        switch (message) {
          case 'Node.PipelineNode.Starting':
            if (details.node_id) {
              const nodeId = details.node_id as number
              const startTimestamp = this.stringPool.intern(event.timestamp)
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
              refreshActivePipelineNodePreview(event.timestamp)
            }
            break

          case 'Node.NextList.Starting':
          case 'Node.NextList.Succeeded':
            applyCurrentNextList(details.list || [])
            refreshActivePipelineNodePreview(event.timestamp)
            break

          case 'Node.NextList.Failed':
            applyCurrentNextList([])
            refreshActivePipelineNodePreview(event.timestamp)
            break

          case 'Node.Recognition.Starting':
            {
              handleRecognitionStartEvent(
                task.task_id,
                details,
                event.timestamp,
                eventOrder,
                pushCurrentTaskRecognitionAttempt
              )
              refreshActivePipelineNodePreview(event.timestamp)
            }
            break

          case 'Node.Recognition.Succeeded':
          case 'Node.Recognition.Failed': {
            handleRecognitionFinishEvent(
              task.task_id,
              details,
              event.timestamp,
              message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
              eventOrder,
              pushCurrentTaskRecognitionAttempt
            )
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.RecognitionNode.Starting': {
            const recoId = resolveRecognitionNodeRecoId(details)
            if (recoId != null) {
              const startTimestamp = this.stringPool.intern(event.timestamp)
              recognitionNodeStartTimes.set(recoId, startTimestamp)
              const recoNodeAttempt = ensureRecognitionNodeAttempt(
                task.task_id,
                recoId,
                details,
                startTimestamp,
                eventOrder
              )
              const parentRecognition = findActiveParentRecognition()
              if (parentRecognition && parentRecognition.reco_id !== recoId) {
                attachNodeToAttempt(parentRecognition, recoNodeAttempt)
              } else if (!isKnownRecognitionRecoId(recoId)) {
                pushActionLevelRecognition(recoNodeAttempt)
              }
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.RecognitionNode.Succeeded':
          case 'Node.RecognitionNode.Failed': {
            // 当前 task 的 RecognitionNode 也可能承载 action 期内识别，不能直接忽略。
            const parentRecognition = findActiveParentRecognition()
            const normalizedPendingRecognitions = dedupeRecognitionAttempts(
              subTasks.consumeRecognitions(task.task_id)
            )
            if (normalizedPendingRecognitions.length > 0) {
              const pendingRecoId = resolveRecognitionNodeRecoId(details)
              const pendingNodeKey = pendingRecoId != null
                ? scopedKey(task.task_id, pendingRecoId)
                : null
              const pendingRecoNodeAttempt = pendingNodeKey
                ? activeRecognitionNodeAttempts.get(pendingNodeKey)
                : undefined
              if (pendingRecoNodeAttempt && pendingRecoId != null) {
                const fallbackStartTimestamp = this.stringPool.intern(event.timestamp)
                const startTimestamp = recognitionNodeStartTimes.get(pendingRecoId) || fallbackStartTimestamp
                completeRecognitionNodeAttempt({
                  attempt: pendingRecoNodeAttempt,
                  recoId: pendingRecoId,
                  details,
                  timestamp: event.timestamp,
                  status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
                  eventOrder,
                  startTimestamp,
                })
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
                if (!isKnownRecognitionRecoId(resolvedRecognition.reco_id)) {
                  pushActionLevelRecognition(resolvedRecognition)
                }
              }
              if (pendingRecoId != null) {
                activeRecognitionNodeAttempts.delete(scopedKey(task.task_id, pendingRecoId))
                recognitionNodeStartTimes.delete(pendingRecoId)
              }
              refreshActivePipelineNodePreview(event.timestamp)
              break
            }

            const recoId = resolveRecognitionNodeRecoId(details)
            if (recoId == null) {
              break
            }

            const timestamp = this.stringPool.intern(event.timestamp)
            const startTimestamp = recognitionNodeStartTimes.get(recoId) || timestamp
            const nodeKey = scopedKey(task.task_id, recoId)
            const recoNodeAttempt: RecognitionAttempt = activeRecognitionNodeAttempts.get(nodeKey) ?? {
              reco_id: recoId,
              name: this.stringPool.intern(details.name || ''),
              ts: startTimestamp,
              end_ts: startTimestamp,
              status: 'running',
            }
            completeRecognitionNodeAttempt({
              attempt: recoNodeAttempt,
              recoId,
              details,
              timestamp: event.timestamp,
              status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
              eventOrder,
              startTimestamp,
            })
            recognitionNodeStartTimes.delete(recoId)
            activeRecognitionNodeAttempts.delete(nodeKey)
            if (parentRecognition && parentRecognition.reco_id !== recoId) {
              attachNodeToAttempt(parentRecognition, recoNodeAttempt)
              refreshActivePipelineNodePreview(event.timestamp)
              break
            }
            if (!isKnownRecognitionRecoId(recoId)) {
              pushActionLevelRecognition(recoNodeAttempt)
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.Action.Starting':
            if (details.action_id != null) {
              const actionId = details.action_id as number
              const startTimestamp = this.stringPool.intern(event.timestamp)
              actionStartTimes.set(actionId, startTimestamp)
              actionStartOrders.set(actionId, eventOrder)
              actionRuntimeStates.set(actionId, {
                action_id: actionId,
                name: this.stringPool.intern(details.name || details.action_details?.name || ''),
                ts: startTimestamp,
                end_ts: startTimestamp,
                status: 'running',
                order: eventOrder,
              })
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break

          case 'Node.Action.Succeeded':
          case 'Node.Action.Failed':
            if (details.action_id != null) {
              const actionId = details.action_id as number
              const endTimestamp = this.stringPool.intern(event.timestamp)
              actionEndTimes.set(actionId, endTimestamp)
              actionEndOrders.set(actionId, eventOrder)
              const existing = actionRuntimeStates.get(actionId)
              if (existing) {
                existing.status = message === 'Node.Action.Succeeded' ? 'success' : 'failed'
                existing.end_ts = endTimestamp
                existing.name = this.stringPool.intern(details.name || details.action_details?.name || existing.name || '')
              } else {
                actionRuntimeStates.set(actionId, {
                  action_id: actionId,
                  name: this.stringPool.intern(details.name || details.action_details?.name || ''),
                  ts: endTimestamp,
                  end_ts: endTimestamp,
                  status: message === 'Node.Action.Succeeded' ? 'success' : 'failed',
                  order: eventOrder,
                })
              }
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break

          case 'Node.WaitFreezes.Starting':
          case 'Node.WaitFreezes.Succeeded':
          case 'Node.WaitFreezes.Failed': {
            const waitFreezesStatus: 'running' | 'success' | 'failed' =
              message === 'Node.WaitFreezes.Starting'
                ? 'running'
                : (message === 'Node.WaitFreezes.Succeeded' ? 'success' : 'failed')
            upsertWaitFreezesState(details, event.timestamp, waitFreezesStatus, eventOrder)
            const activeNode = getActivePipelineNode()
            if (activeNode) {
              activeNode.focus = resolveEventFocus(details, activeNode.focus)
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.ActionNode.Starting': {
            const actionId = details.action_details?.action_id ?? details.action_id ?? details.node_id
            if (actionId != null) {
              actionNodeStartTimes.set(actionId, this.stringPool.intern(event.timestamp))
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.ActionNode.Succeeded':
          case 'Node.ActionNode.Failed': {
            const actionId = details.action_details?.action_id ?? details.action_id ?? details.node_id
            if (actionId != null) {
              actionNodeStartTimes.delete(actionId)
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }

          case 'Node.PipelineNode.Succeeded':
          case 'Node.PipelineNode.Failed': {
            const nodeId = details.node_id
            if (!nodeId) break
            const pipelineStatus: 'success' | 'failed' = message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed'
            settleCurrentNodeRuntimeStates(pipelineStatus, event.timestamp)

            const existingNode = pipelineNodesById.get(nodeId)
            const nodeName = details.name || ''
            const startTimestamp = pipelineNodeStartTimes.get(nodeId) || this.stringPool.intern(event.timestamp)
            const endTimestamp = this.stringPool.intern(event.timestamp)
            const actionId = details.action_details?.action_id ?? details.node_details?.action_id
            const actionStartTimestamp = actionId != null ? actionStartTimes.get(actionId) : undefined
            const actionEndTimestamp = actionId != null ? actionEndTimes.get(actionId) : undefined
            const actionStartOrder = actionId != null ? actionStartOrders.get(actionId) : undefined
            const actionEndOrder = actionId != null ? actionEndOrders.get(actionId) : undefined
            const currentTaskRecognitionAttempts = dedupeRecognitionAttempts(currentTaskRecognitions)
            const scopedTopLevelRecognitions: RecognitionAttempt[] = []
            const scopedActionRecognitions: RecognitionAttempt[] = []
            for (const attempt of currentTaskRecognitionAttempts) {
              const attemptMeta = recognitionOrderMeta.get(attempt)
              if (
                actionStartOrder != null &&
                attemptMeta &&
                attemptMeta.endSeq >= actionStartOrder &&
                (actionEndOrder == null || attemptMeta.startSeq <= actionEndOrder)
              ) {
                scopedActionRecognitions.push(attempt)
              } else {
                scopedTopLevelRecognitions.push(attempt)
              }
            }
            const subTaskActionGroups: NestedActionGroup[] = subTasks.consumeAsNestedActionGroups(this.stringPool).map((group: any) => {
              const snapshot = subTaskSnapshots.get(group.task_id)
              if (!snapshot) {
                return group
              }

              const snapshotStatus: 'success' | 'failed' | 'running' =
                snapshot.status === 'failed'
                  ? 'failed'
                  : snapshot.status === 'running'
                    ? 'running'
                    : 'success'
              const mergedStatus: 'success' | 'failed' | 'running' =
                group.status === 'failed' || snapshotStatus === 'failed'
                  ? 'failed'
                  : group.status === 'running' || snapshotStatus === 'running'
                    ? 'running'
                    : 'success'
              const startTimestamp = snapshot.ts || group.ts
              const endTimestamp = snapshot.end_ts

              return {
                ...group,
                name: this.stringPool.intern(snapshot.entry || group.name),
                ts: this.stringPool.intern(startTimestamp || group.ts),
                end_ts: endTimestamp ? this.stringPool.intern(endTimestamp) : undefined,
                status: mergedStatus,
                task_details: markRaw({
                  task_id: snapshot.task_id,
                  entry: snapshot.entry || '',
                  hash: snapshot.hash || '',
                  uuid: snapshot.uuid || '',
                  status: snapshot.status,
                  ts: snapshot.ts,
                  end_ts: snapshot.end_ts,
                  start_message: snapshot.start_message,
                  end_message: snapshot.end_message,
                  start_details: snapshot.start_details,
                  end_details: snapshot.end_details
                })
              }
            })
            const subTaskOrphanRecognitionAttempts = subTasks.consumeOrphanRecognitions()
            const subTaskOrphanRecognitionNodes = subTasks.consumeOrphanRecognitionNodes()
            const pendingActionLevelRecognitions = dedupeRecognitionAttempts([
              ...actionLevelRecognitionNodes,
              ...scopedActionRecognitions,
              ...subTaskOrphanRecognitionAttempts,
              ...subTaskOrphanRecognitionNodes
            ])
            const scopedAttachResult = attachActionLevelRecognitionAcrossScopes(
              scopedTopLevelRecognitions,
              subTaskActionGroups,
              pendingActionLevelRecognitions,
              actionStartOrder
            )
            const nestedRecognitionInAction = scopedAttachResult.remaining
            const nestedSubTaskGroups = nestSubTaskActionGroups(scopedAttachResult.nestedActionGroups)
            const resolvedNestedActionGroups: NestedActionGroup[] =
              nestedSubTaskGroups.length > 0
                ? nestedSubTaskGroups
                : (
                  nestedActionNodes.length > 0
                    ? [
                        {
                          task_id: task.task_id,
                          name: this.stringPool.intern('ActionNode'),
                          ts: startTimestamp,
                          end_ts: endTimestamp,
                          status: nestedActionNodes.some(item => item.status === 'failed')
                            ? 'failed'
                            : nestedActionNodes.some(item => item.status === 'running')
                              ? 'running'
                              : 'success',
                          nested_actions: nestedActionNodes.slice(),
                        },
                      ]
                    : []
                )
            const fallbackRecoDetails =
              details.reco_details ||
              (scopedAttachResult.topLevelAttempts.length > 0
                ? scopedAttachResult.topLevelAttempts[scopedAttachResult.topLevelAttempts.length - 1].reco_details
                : undefined)
            const mergedActionDetails = withActionTimestamps(details.action_details, actionStartTimestamp, actionEndTimestamp, endTimestamp)
            const resolvedActionId = mergedActionDetails?.action_id ?? actionId ?? nodeId
            const composedFlow = composePipelineNodeFlow({
              topLevelRecognitions: scopedAttachResult.topLevelAttempts,
              actionLevelRecognitions: nestedRecognitionInAction,
              nestedActionGroups: resolvedNestedActionGroups,
              waitFreezesFlow: buildWaitFreezesFlowItems(),
              createActionRoot: (actionFlow) => {
                const hasActionRoot = !!mergedActionDetails || actionFlow.length > 0
                if (!hasActionRoot) return null

                const actionStatus: 'success' | 'failed' = mergedActionDetails
                  ? (mergedActionDetails.success ? 'success' : 'failed')
                  : (message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed')
                const resolvedActionErrorImage = actionStatus === 'failed'
                  ? this.findErrorImageByNames(event.timestamp, [
                      mergedActionDetails?.name,
                      details.action_details?.name,
                      details.node_details?.name,
                      details.reco_details?.name,
                      nodeName,
                    ])
                  : undefined

                return createActionRootFlowItem({
                  actionId: resolvedActionId,
                  name: mergedActionDetails?.name || this.stringPool.intern(nodeName),
                  status: actionStatus,
                  ts: mergedActionDetails?.ts || mergedActionDetails?.end_ts || endTimestamp,
                  endTs: mergedActionDetails?.end_ts,
                  actionDetails: mergedActionDetails,
                  errorImage: resolvedActionErrorImage,
                })
              },
            })
            const nodeFlow = composedFlow.nodeFlow
            const actionFlow = composedFlow.actionFlow

            const resolvedNextList = toNextListItems(currentNextList)
            let nodeStatus: NodeInfo['status'] = pipelineStatus
            if (nodeStatus === 'success' && actionFlow.some(item => item.type === 'task' && item.status === 'failed')) {
              nodeStatus = 'failed'
            }

            const resolvedName = this.stringPool.intern(nodeName)
            const resolvedRecoDetails = fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined
            const resolvedFocus = resolveEventFocus(details, existingNode?.focus)
            const resolvedNodeDetails = details.node_details ? markRaw(details.node_details) : undefined
            const resolvedNodeFlow = nodeFlow.length > 0 ? nodeFlow : undefined
            const resolvedErrorImage = this.findErrorImageByNames(event.timestamp, [
              details.action_details?.name,
              details.node_details?.name,
              details.reco_details?.name,
              nodeName,
            ])

            if (existingNode) {
              existingNode.name = resolvedName
              existingNode.ts = startTimestamp
              existingNode.end_ts = endTimestamp
              existingNode.status = nodeStatus
              existingNode.task_id = task.task_id
              existingNode.reco_details = resolvedRecoDetails
              existingNode.action_details = mergedActionDetails
              existingNode.focus = resolvedFocus
              existingNode.next_list = resolvedNextList
              existingNode.node_flow = resolvedNodeFlow
              existingNode.node_details = resolvedNodeDetails
              existingNode.error_image = resolvedErrorImage
            } else {
              const node: NodeInfo = {
                node_id: nodeId,
                name: resolvedName,
                ts: startTimestamp,
                end_ts: endTimestamp,
                status: nodeStatus,
                task_id: task.task_id,
                reco_details: resolvedRecoDetails,
                action_details: mergedActionDetails,
                focus: resolvedFocus,
                next_list: resolvedNextList,
                node_flow: resolvedNodeFlow,
                node_details: resolvedNodeDetails,
                error_image: resolvedErrorImage
              }
              nodes.push(node)
              pipelineNodesById.set(nodeId, node)
            }

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
            break
          }
        }
        continue
      }

      // === 子任务的事件（task_id !== 当前任务） ===
      const subTaskId = details.task_id
      switch (message) {
        case 'Node.PipelineNode.Starting':
          if (subTaskId != null && details.node_id != null) {
            subTaskPipelineNodeStartTimes.set(scopedKey(subTaskId, details.node_id), this.stringPool.intern(event.timestamp))
          }
          refreshActivePipelineNodePreview(event.timestamp)
          break

        case 'Node.NextList.Starting':
        case 'Node.NextList.Succeeded':
        case 'Node.NextList.Failed':
          break

        case 'Node.WaitFreezes.Starting':
        case 'Node.WaitFreezes.Succeeded':
        case 'Node.WaitFreezes.Failed':
          break

        case 'Node.Recognition.Starting':
          if (subTaskId != null) {
            handleRecognitionStartEvent(subTaskId, details, event.timestamp, eventOrder)
          }
          refreshActivePipelineNodePreview(event.timestamp)
          break

        case 'Node.Recognition.Succeeded':
        case 'Node.Recognition.Failed': {
          if (subTaskId == null) break
          handleRecognitionFinishEvent(
            subTaskId,
            details,
            event.timestamp,
            message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
            eventOrder,
            (attempt) => {
              subTasks.addRecognition(subTaskId, attempt)
            }
          )
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.Action.Starting':
          if (subTaskId != null && details.action_id != null) {
            const actionKey = scopedKey(subTaskId, details.action_id)
            subTaskActionStartTimes.set(actionKey, this.stringPool.intern(event.timestamp))
            subTaskActionStartOrders.set(actionKey, eventOrder)
          }
          refreshActivePipelineNodePreview(event.timestamp)
          break

        case 'Node.Action.Succeeded':
        case 'Node.Action.Failed': {
          if (subTaskId == null) break
          const actionId = details.action_id
          const actionKey = actionId != null ? scopedKey(subTaskId, actionId) : null
          const endTimestamp = this.stringPool.intern(event.timestamp)
          const startTimestamp = actionKey
            ? (subTaskActionStartTimes.get(actionKey) || endTimestamp)
            : endTimestamp
          if (actionKey) {
            subTaskActionEndTimes.set(actionKey, endTimestamp)
            subTaskActionEndOrders.set(actionKey, eventOrder)
          }
          subTasks.addAction(subTaskId, {
            action_id: details.action_id,
            name: this.stringPool.intern(details.name || ''),
            ts: startTimestamp,
            end_ts: endTimestamp,
            status: message === 'Node.Action.Succeeded' ? 'success' : 'failed',
            action_details: withActionTimestamps(details.action_details, startTimestamp, endTimestamp, endTimestamp)
          })
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.RecognitionNode.Starting': {
          if (subTaskId == null) break
          const recoId = resolveRecognitionNodeRecoId(details)
          if (recoId != null) {
            const startTimestamp = this.stringPool.intern(event.timestamp)
            const nodeKey = scopedKey(subTaskId, recoId)
            subTaskRecognitionNodeStartTimes.set(nodeKey, startTimestamp)
            const recoNodeAttempt = ensureRecognitionNodeAttempt(
              subTaskId,
              recoId,
              details,
              startTimestamp,
              eventOrder
            )
            const parentRecognition = findActiveParentRecognition(subTaskId)
            if (parentRecognition && parentRecognition.reco_id !== recoId) {
              attachNodeToAttempt(parentRecognition, recoNodeAttempt)
            }
          }
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.RecognitionNode.Succeeded':
        case 'Node.RecognitionNode.Failed': {
          if (subTaskId == null) break
          const nestedRecognitions = subTasks.consumeRecognitions(subTaskId)
          const normalizedNestedRecognitions = dedupeRecognitionAttempts(nestedRecognitions)
          const parentRecognition = findActiveParentRecognition(subTaskId)
          if (normalizedNestedRecognitions.length > 0) {
            const pendingRecoId = resolveRecognitionNodeRecoId(details)
            const pendingNodeKey = pendingRecoId != null ? scopedKey(subTaskId, pendingRecoId) : null
            const pendingRecoNodeAttempt = pendingNodeKey
              ? activeRecognitionNodeAttempts.get(pendingNodeKey)
              : undefined
            if (pendingRecoNodeAttempt && pendingNodeKey) {
              const fallbackStartTimestamp = this.stringPool.intern(event.timestamp)
              const startTimestamp = subTaskRecognitionNodeStartTimes.get(pendingNodeKey) || fallbackStartTimestamp
              completeRecognitionNodeAttempt({
                attempt: pendingRecoNodeAttempt,
                recoId: pendingRecoId ?? pendingRecoNodeAttempt.reco_id,
                details,
                timestamp: event.timestamp,
                status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
                eventOrder,
                startTimestamp,
              })
            }
            for (const recognition of normalizedNestedRecognitions) {
              const resolvedRecognition = (
                pendingRecoId != null &&
                pendingRecoNodeAttempt &&
                recognition.reco_id === pendingRecoId
              ) ? pendingRecoNodeAttempt : recognition
              if (parentRecognition && parentRecognition.reco_id !== recognition.reco_id) {
                attachNodeToAttempt(parentRecognition, resolvedRecognition)
                continue
              }
              subTasks.addRecognition(subTaskId, resolvedRecognition)
            }
            if (pendingRecoId != null) {
              const nodeKey = scopedKey(subTaskId, pendingRecoId)
              activeRecognitionNodeAttempts.delete(nodeKey)
              subTaskRecognitionNodeStartTimes.delete(nodeKey)
            }
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }
          const recoId = resolveRecognitionNodeRecoId(details)
          if (recoId == null) break
          const timestamp = this.stringPool.intern(event.timestamp)
          const nodeKey = scopedKey(subTaskId, recoId)
          const startTimestamp = subTaskRecognitionNodeStartTimes.get(nodeKey) || timestamp
          const recoNodeAttempt: RecognitionAttempt = activeRecognitionNodeAttempts.get(nodeKey) ?? {
            reco_id: recoId,
            name: this.stringPool.intern(details.name || ''),
            ts: startTimestamp,
            end_ts: startTimestamp,
            status: 'running',
          }
          completeRecognitionNodeAttempt({
            attempt: recoNodeAttempt,
            recoId,
            details,
            timestamp: event.timestamp,
            status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
            eventOrder,
            startTimestamp,
          })
          subTaskRecognitionNodeStartTimes.delete(nodeKey)
          activeRecognitionNodeAttempts.delete(nodeKey)
          if (parentRecognition && parentRecognition.reco_id !== recoNodeAttempt.reco_id) {
            attachNodeToAttempt(parentRecognition, recoNodeAttempt)
            refreshActivePipelineNodePreview(event.timestamp)
            break
          }
          subTasks.addRecognitionNode(subTaskId, recoNodeAttempt)
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.ActionNode.Starting': {
          if (subTaskId == null) break
          const actionId = details.action_details?.action_id ?? details.action_id ?? details.node_id
          if (actionId != null) {
            const actionKey = scopedKey(subTaskId, actionId)
            const startTimestamp = this.stringPool.intern(event.timestamp)
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
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.ActionNode.Succeeded':
        case 'Node.ActionNode.Failed': {
          if (subTaskId == null) break
          const actionId = details.action_details?.action_id ?? details.action_id ?? details.node_id
          const actionKey = actionId != null ? scopedKey(subTaskId, actionId) : null
          const actionNodeStartTimestamp = actionKey ? subTaskActionNodeStartTimes.get(actionKey) : undefined
          const actionStartTimestamp = actionKey ? subTaskActionStartTimes.get(actionKey) : undefined
          const actionEndTimestamp = actionKey ? subTaskActionEndTimes.get(actionKey) : undefined
          const nowTimestamp = this.stringPool.intern(event.timestamp)
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
          resolvedActionNode.status = message === 'Node.ActionNode.Succeeded' ? 'success' : 'failed'
          resolvedActionNode.action_details = withActionTimestamps(
            details.action_details,
            actionStartTimestamp || actionNodeStartTimestamp || resolvedActionNode.ts,
            actionEndTimestamp,
            event.timestamp
          )
          nestedActionNodes.push(resolvedActionNode)
          if (actionKey) {
            subTaskActionNodeStartTimes.delete(actionKey)
            activeSubTaskActionNodes.delete(actionKey)
          }
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }

        case 'Node.PipelineNode.Succeeded':
        case 'Node.PipelineNode.Failed': {
          if (subTaskId == null) break
          const nodeId = details.node_id
          const endTimestamp = this.stringPool.intern(event.timestamp)
          const startTimestamp = nodeId != null
            ? (subTaskPipelineNodeStartTimes.get(scopedKey(subTaskId, nodeId)) || endTimestamp)
            : endTimestamp
          const actionId = details.action_details?.action_id ?? details.node_details?.action_id
          const actionKey = actionId != null ? scopedKey(subTaskId, actionId) : null
          const actionStartTimestamp = actionKey ? subTaskActionStartTimes.get(actionKey) : undefined
          const actionEndTimestamp = actionKey ? subTaskActionEndTimes.get(actionKey) : undefined
          const taskActions = subTasks.consumeActions(subTaskId)
          let matchedTaskAction: any | undefined
          let matchedTaskActionIndex = -1
          if (taskActions.length > 0) {
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
          }
          const mergedActionDetails = details.action_details || matchedTaskAction?.action_details
          const mergedActionStartTimestamp = actionStartTimestamp || matchedTaskAction?.ts
          const mergedActionEndTimestamp = actionEndTimestamp || matchedTaskAction?.end_ts
          const taskRecognitions = dedupeRecognitionAttempts(subTasks.consumeRecognitions(subTaskId))
          const recognitionNodes = dedupeRecognitionAttempts(subTasks.consumeRecognitionNodes(subTaskId))
          const attachedRecognitions = attachRecognitionNodesToAttempts(taskRecognitions, recognitionNodes)
          const fallbackRecoDetails =
            details.reco_details ||
            (attachedRecognitions.attempts.length > 0
              ? attachedRecognitions.attempts[attachedRecognitions.attempts.length - 1].reco_details
              : undefined)
          subTasks.addPipelineNode(subTaskId, {
            node_id: nodeId,
            name: this.stringPool.intern(details.reco_details?.name || details.action_details?.name || details.name || ''),
            ts: startTimestamp,
            end_ts: endTimestamp,
            status: message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed',
            reco_details: fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined,
            action_details: withActionTimestamps(mergedActionDetails, mergedActionStartTimestamp, mergedActionEndTimestamp, endTimestamp),
            recognitions: attachedRecognitions.attempts.length > 0
              ? attachedRecognitions.attempts
              : (attachedRecognitions.orphans.length > 0 ? attachedRecognitions.orphans : undefined)
          })
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
          refreshActivePipelineNodePreview(event.timestamp)
          break
        }
      }
    }

    return nodes
  }

  /**
   * 查找识别尝试的截图（匹配到秒级别）
   */
  findRecognitionImage(timestamp: string, nodeName: string): string | undefined {
    if (this.errorImages.size === 0) return undefined

    // 2026-03-09 19:46:35.xxx -> 2026.03.09-19.46.35
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}`

    for (const [key, path] of this.errorImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
  }

  /**
   * 查找错误截图（匹配到秒级别 + 节点名）
   */
  findErrorImage(timestamp: string, nodeName: string): string | undefined {
    if (this.errorImages.size === 0) return undefined

    // 2026-03-08 13:12:30.216 -> 2026.03.08-13.12.30
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}`

    for (const [key, path] of this.errorImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
        return path
      }
    }
    return undefined
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
    if (this.visionImages.size === 0) return undefined

    // 2026-03-08 13:12:30.216 -> 2026.03.08-13.12.30
    const secondsOnly = timestamp.replace(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\..*/, '$1.$2.$3-$4.$5.$6')
    const suffix = `_${nodeName}_${recoId}`

    for (const [key, path] of this.visionImages.entries()) {
      if (key.includes(`${secondsOnly}.`) && key.endsWith(suffix)) {
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
