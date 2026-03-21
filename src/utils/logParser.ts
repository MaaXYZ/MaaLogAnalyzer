import { markRaw } from 'vue'
import type { EventNotification, TaskInfo, NodeInfo, RecognitionAttempt } from '../types'
import { StringPool } from './stringPool'
import { buildNodeFlowItems } from './nodeFlow'

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
      timestamp: stringPool.intern(nodes[0]?.timestamp || ''),
      status: nodes.every((n: any) => n.status === 'success') ? 'success' : 'failed',
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
  private taskProcessMap = new Map<number, string>()
  private taskThreadMap = new Map<number, string>()
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

  /**
   * 解析日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void
  ): Promise<void> {
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()

    const rawLines = content.split('\n')
    const events: EventNotification[] = []
    const lastEventBySignature = new Map<string, {
      timestampMs: number
      processId: string
      threadId: string
    }>()
    const dedupWindowMs = 10
    const totalLines = rawLines.length
    const chunkSize = 1000

    for (let startIdx = 0; startIdx < totalLines; startIdx += chunkSize) {
      await new Promise(resolve => setTimeout(resolve, 0))

      const endIdx = Math.min(startIdx + chunkSize, totalLines)

      for (let lineNum = startIdx + 1; lineNum <= endIdx; lineNum++) {
        const rawLine = rawLines[lineNum - 1]
        if (!rawLine || !rawLine.includes('!!!OnEventNotify!!!')) continue

        try {
          const event = this.parseEventLine(rawLine.trim(), lineNum)
          if (!event) continue

          // IPC 去重：
          // 同 msg+details 指纹在短时间窗口内由不同 process/thread 重复上报时，视作同一事件。
          const previous = lastEventBySignature.get(event._dedupSignature)
          const eventMs = event._timestampMs
          const nearInTime = previous && Number.isFinite(previous.timestampMs) && Number.isFinite(eventMs)
            ? Math.abs(eventMs - previous.timestampMs) <= dedupWindowMs
            : false
          const fromDifferentSource = previous
            ? previous.processId !== event.processId || previous.threadId !== event.threadId
            : false
          const isDuplicate = !!(previous && nearInTime && fromDifferentSource)

          if (!isDuplicate) {
            events.push(event)
            lastEventBySignature.set(event._dedupSignature, {
              timestampMs: eventMs,
              processId: event.processId,
              threadId: event.threadId,
            })

            // 记录任务的进程和线程信息（只记录首次出现，避免 IPC 覆盖）
            if (event.message === 'Tasker.Task.Starting' && event.details.task_id) {
              if (!this.taskProcessMap.has(event.details.task_id)) {
                this.taskProcessMap.set(event.details.task_id, event.processId)
                this.taskThreadMap.set(event.details.task_id, event.threadId)
              }
            }
          }
        } catch (e) {
          console.warn(`解析第 ${lineNum} 行失败:`, e)
        }
      }

      if (onProgress) {
        onProgress({
          current: endIdx,
          total: totalLines,
          percentage: Math.round((endIdx / totalLines) * 100)
        })
      }
    }

    this.events = events
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
    const level = forceCopyString(rawLevel)
    const processId = forceCopyString(rawProcessId)
    const threadId = forceCopyString(rawThreadId)
    const msg = forceCopyString(rawMsg)

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

  /**
   * 获取所有任务
   */
  getTasks(): TaskInfo[] {
    const tasks: TaskInfo[] = []

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]
      const { message, details } = event

      if (message === 'Tasker.Task.Starting') {
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
      } else if (message === 'Tasker.Task.Succeeded' || message === 'Tasker.Task.Failed') {
        const taskId = details.task_id
        const uuid = details.uuid

        let matchedTask = null
        if (uuid && uuid.trim() !== '') {
          matchedTask = tasks.find(t => t.uuid === uuid && !t.end_time)
        } else {
          matchedTask = tasks.find(t => t.task_id === taskId && !t.end_time)
        }

        if (matchedTask) {
          matchedTask.status = message === 'Tasker.Task.Succeeded' ? 'succeeded' : 'failed'
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
      const taskStartIndex = task._startEventIndex ?? -1
      const taskEndIndex = task._endEventIndex ?? this.events.length - 1
      if (taskStartIndex >= 0) {
        task.events = this.events
          .slice(taskStartIndex, taskEndIndex + 1)
          .filter(event => event.details?.task_id === task.task_id)
      }

      if (task.status === 'running' && task.nodes.length > 0) {
        const lastNode = task.nodes[task.nodes.length - 1]
        const start = new Date(task.start_time).getTime()
        const end = new Date(lastNode.end_timestamp || lastNode.timestamp).getTime()
        task.duration = end - start
      }
    }

    this.events = []
    console.log(`字符串池统计: ${this.stringPool.size()} 个唯一字符串`)
    this.stringPool.clear()

    return tasks.filter(task => task.entry !== 'MaaTaskerPostStop')
  }

  /**
   * 获取任务的所有节点
   */
  private getTaskNodes(task: TaskInfo): NodeInfo[] {
    const nodes: NodeInfo[] = []
    const nodeIdSet = new Set<number>()

    const taskStartIndex = task._startEventIndex ?? -1
    const taskEndIndex = task._endEventIndex ?? this.events.length - 1
    if (taskStartIndex === -1) return []

    const taskEvents = this.events.slice(taskStartIndex, taskEndIndex + 1)

    // 当前节点的累积状态
    let currentNextList: any[] = []
    const currentTaskRecognitions: RecognitionAttempt[] = []
    const actionLevelRecognitionNodes: RecognitionAttempt[] = []
    const nestedActionNodes: any[] = []
    const pipelineNodeStartTimes = new Map<number, string>()
    const actionStartTimes = new Map<number, string>()
    const actionEndTimes = new Map<number, string>()
    const actionStartOrders = new Map<number, number>()
    const actionEndOrders = new Map<number, number>()
    const subTaskPipelineNodeStartTimes = new Map<string, string>()
    const subTaskActionStartTimes = new Map<string, string>()
    const subTaskActionEndTimes = new Map<string, string>()
    const subTaskActionStartOrders = new Map<string, number>()
    const subTaskActionEndOrders = new Map<string, number>()
    const activeRecognitionAttempts = new Map<string, RecognitionAttempt>()
    const activeRecognitionStack: Array<{ taskId: number; recoId: number }> = []
    const finishedRecognitionKeys = new Set<string>()
    const recognitionOrderMeta = new WeakMap<RecognitionAttempt, { startSeq: number; endSeq: number }>()

    const scopedKey = (taskId: number, id: number): string => `${taskId}:${id}`
    const withActionTimestamps = (
      actionDetails: any,
      startTimestamp?: string,
      endTimestamp?: string,
      fallbackEndTimestamp?: string
    ) => {
      if (!actionDetails) return undefined
      const resolvedEnd = endTimestamp ?? actionDetails.end_timestamp ?? fallbackEndTimestamp
      const resolvedStart = startTimestamp ?? actionDetails.start_timestamp ?? resolvedEnd
      return markRaw({
        ...actionDetails,
        ...(resolvedStart ? { start_timestamp: this.stringPool.intern(resolvedStart) } : {}),
        ...(resolvedEnd ? { end_timestamp: this.stringPool.intern(resolvedEnd) } : {})
      })
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
    const startRecognitionAttempt = (
      taskId: number,
      details: Record<string, any>,
      timestamp: string,
      eventOrder: number
    ) => {
      const recoId = normalizeRecoId(details.reco_id)
      if (recoId == null) return
      const key = scopedKey(taskId, recoId)
      if (finishedRecognitionKeys.has(key) || activeRecognitionAttempts.has(key)) return

      const startTimestamp = this.stringPool.intern(timestamp)
      const attempt: RecognitionAttempt = {
        reco_id: recoId,
        name: this.stringPool.intern(details.name || ''),
        timestamp: startTimestamp,
        start_timestamp: startTimestamp,
        end_timestamp: startTimestamp,
        status: 'failed',
      }
      recognitionOrderMeta.set(attempt, { startSeq: eventOrder, endSeq: eventOrder })
      activeRecognitionAttempts.set(key, attempt)
      activeRecognitionStack.push({ taskId, recoId })
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
        timestamp: endTimestamp,
        start_timestamp: endTimestamp,
        end_timestamp: endTimestamp,
        status,
      }

      attempt.status = status
      attempt.name = attempt.name || this.stringPool.intern(details.name || '')
      attempt.start_timestamp = attempt.start_timestamp || attempt.timestamp || endTimestamp
      attempt.end_timestamp = endTimestamp
      attempt.timestamp = attempt.start_timestamp || endTimestamp
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
    const dedupeRecognitionAttempts = (items: RecognitionAttempt[]) => {
      const seen = new Set<string>()
      const result: RecognitionAttempt[] = []
      for (const item of items) {
        const key = `${item.reco_id}|${item.name}|${item.timestamp}|${item.status}`
        if (seen.has(key)) continue
        seen.add(key)
        result.push(item)
      }
      return result
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
    const attachActionLevelRecognitionAcrossScopes = (
      topLevelAttempts: RecognitionAttempt[],
      nestedActionGroups: any[],
      actionLevelNodes: RecognitionAttempt[],
      actionStartOrder?: number
    ) => {
      const mergedTopLevelAttempts = topLevelAttempts.map(cloneRecognitionAttempt)
      const mergedNestedGroups = nestedActionGroups.map((group: any) => ({
        ...group,
        nested_actions: (group.nested_actions ?? []).map((action: any) => ({
          ...action,
          recognition_attempts: (action.recognition_attempts ?? []).map(cloneRecognitionAttempt)
        }))
      }))
      const remaining: RecognitionAttempt[] = []
      const orderedNodes = sortByParseOrderThenRecoId(actionLevelNodes)

      for (const node of orderedNodes) {
        let attached = false

        // 1) 优先挂到 nested action 的识别尝试（如 CCUpdate 下的 count_xxx）
        for (const group of mergedNestedGroups) {
          for (const action of group.nested_actions ?? []) {
            const attempts: RecognitionAttempt[] = action.recognition_attempts ?? []
            if (!attempts.length) continue
            const idx = pickBestAttemptIndex(attempts, node)
            if (idx < 0) continue
            attachNodeToAttempt(attempts[idx], node)
            attached = true
            break
          }
          if (attached) break
        }
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

    // 子任务事件收集器
    const subTasks = new SubTaskCollector()

    for (let eventIndex = 0; eventIndex < taskEvents.length; eventIndex++) {
      const event = taskEvents[eventIndex]
      const eventOrder = eventIndex
      const { message, details } = event
      const isCurrentTask = details.task_id === task.task_id

      // === 当前任务的事件 ===
      if (isCurrentTask) {
        switch (message) {
          case 'Node.PipelineNode.Starting':
            if (details.node_id) {
              pipelineNodeStartTimes.set(details.node_id, this.stringPool.intern(event.timestamp))
            }
            break

          case 'Node.NextList.Starting':
            currentNextList = details.list || []
            break

          case 'Node.Recognition.Starting':
            startRecognitionAttempt(task.task_id, details, event.timestamp, eventOrder)
            break

          case 'Node.Recognition.Succeeded':
          case 'Node.Recognition.Failed': {
            const attempt = finishRecognitionAttempt(
              task.task_id,
              details,
              event.timestamp,
              message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
              eventOrder
            )
            if (attempt) {
              currentTaskRecognitions.push(attempt)
            }
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
              for (const recognition of normalizedPendingRecognitions) {
                if (parentRecognition && parentRecognition.reco_id !== recognition.reco_id) {
                  attachNodeToAttempt(parentRecognition, recognition)
                  continue
                }
                if (!isKnownRecognitionRecoId(recognition.reco_id)) {
                  pushActionLevelRecognition(recognition)
                }
              }
              break
            }

            const recoId = normalizeRecoId(
              details.reco_details?.reco_id ?? details.reco_id ?? details.node_id
            )
            if (recoId == null) {
              break
            }

            const timestamp = this.stringPool.intern(event.timestamp)
            const recoNodeAttempt: RecognitionAttempt = {
              reco_id: recoId,
              name: this.stringPool.intern(details.name || ''),
              timestamp,
              start_timestamp: timestamp,
              end_timestamp: timestamp,
              status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
              reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
              error_image: this.findRecognitionImage(event.timestamp, details.name || ''),
              vision_image: this.findVisionImage(event.timestamp, details.name || '', recoId)
            }
            recognitionOrderMeta.set(recoNodeAttempt, { startSeq: eventOrder, endSeq: eventOrder })
            if (parentRecognition && parentRecognition.reco_id !== recoId) {
              attachNodeToAttempt(parentRecognition, recoNodeAttempt)
              break
            }
            if (!isKnownRecognitionRecoId(recoId)) {
              pushActionLevelRecognition(recoNodeAttempt)
            }
            break
          }

          case 'Node.Action.Starting':
            if (details.action_id != null) {
              actionStartTimes.set(details.action_id, this.stringPool.intern(event.timestamp))
              actionStartOrders.set(details.action_id, eventOrder)
            }
            break

          case 'Node.Action.Succeeded':
          case 'Node.Action.Failed':
            if (details.action_id != null) {
              actionEndTimes.set(details.action_id, this.stringPool.intern(event.timestamp))
              actionEndOrders.set(details.action_id, eventOrder)
            }
            break

          case 'Node.PipelineNode.Succeeded':
          case 'Node.PipelineNode.Failed': {
            const nodeId = details.node_id
            if (!nodeId || nodeIdSet.has(nodeId)) break

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
            const subTaskActionGroups = subTasks.consumeAsNestedActionGroups(this.stringPool)
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
            const fallbackRecoDetails =
              details.reco_details ||
              (scopedAttachResult.topLevelAttempts.length > 0
                ? scopedAttachResult.topLevelAttempts[scopedAttachResult.topLevelAttempts.length - 1].reco_details
                : undefined)

            const node: NodeInfo = {
              node_id: nodeId,
              name: this.stringPool.intern(nodeName),
              timestamp: startTimestamp,
              start_timestamp: startTimestamp,
              end_timestamp: endTimestamp,
              status: message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed',
              task_id: task.task_id,
              reco_details: fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined,
              action_details: withActionTimestamps(details.action_details, actionStartTimestamp, actionEndTimestamp, endTimestamp),
              focus: details.focus ? markRaw(details.focus) : undefined,
              next_list: currentNextList.map((item: any) => ({
                name: this.stringPool.intern(item.name || ''),
                anchor: item.anchor || false,
                jump_back: item.jump_back || false
              })),
              recognition_attempts: scopedAttachResult.topLevelAttempts,
              nested_recognition_in_action: nestedRecognitionInAction.length > 0
                ? nestedRecognitionInAction
                : undefined,
              nested_action_nodes: scopedAttachResult.nestedActionGroups.length > 0
                ? scopedAttachResult.nestedActionGroups
                : (nestedActionNodes.length > 0 ? nestedActionNodes.slice() : undefined),
              node_details: details.node_details ? markRaw(details.node_details) : undefined,
              error_image: this.findErrorImage(event.timestamp, nodeName),
              wait_freezes_images: this.findWaitFreezesImages(event.timestamp, details.action_details?.name || details.node_details?.name || nodeName)
            }
            node.flow_items = buildNodeFlowItems(node)
            nodes.push(node)
            nodeIdSet.add(nodeId)
            pipelineNodeStartTimes.delete(nodeId)
            if (actionId != null) {
              actionStartTimes.delete(actionId)
              actionEndTimes.delete(actionId)
              actionStartOrders.delete(actionId)
              actionEndOrders.delete(actionId)
            }

            // 如果嵌套动作组中有失败的，节点整体标记为失败
            if (node.status === 'success' && node.nested_action_nodes?.some(g => g.status === 'failed')) {
              node.status = 'failed'
            }

            // 重置当前节点状态
            currentNextList = []
            currentTaskRecognitions.length = 0
            nestedActionNodes.length = 0
            actionLevelRecognitionNodes.length = 0
            subTasks.clear()
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
          break

        case 'Node.Recognition.Starting':
          if (subTaskId != null) {
            startRecognitionAttempt(subTaskId, details, event.timestamp, eventOrder)
          }
          break

        case 'Node.Recognition.Succeeded':
        case 'Node.Recognition.Failed': {
          if (subTaskId == null) break
          const attempt = finishRecognitionAttempt(
            subTaskId,
            details,
            event.timestamp,
            message === 'Node.Recognition.Succeeded' ? 'success' : 'failed',
            eventOrder
          )
          if (attempt) {
            subTasks.addRecognition(subTaskId, attempt)
          }
          break
        }

        case 'Node.Action.Starting':
          if (subTaskId != null && details.action_id != null) {
            const actionKey = scopedKey(subTaskId, details.action_id)
            subTaskActionStartTimes.set(actionKey, this.stringPool.intern(event.timestamp))
            subTaskActionStartOrders.set(actionKey, eventOrder)
          }
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
            timestamp: startTimestamp,
            start_timestamp: startTimestamp,
            end_timestamp: endTimestamp,
            status: message === 'Node.Action.Succeeded' ? 'success' : 'failed',
            action_details: withActionTimestamps(details.action_details, startTimestamp, endTimestamp, endTimestamp)
          })
          break
        }

        case 'Node.RecognitionNode.Succeeded':
        case 'Node.RecognitionNode.Failed': {
          if (subTaskId == null) break
          const nestedRecognitions = subTasks.consumeRecognitions(subTaskId)
          const normalizedNestedRecognitions = dedupeRecognitionAttempts(nestedRecognitions)
          const parentRecognition = findActiveParentRecognition(subTaskId)
          if (normalizedNestedRecognitions.length > 0) {
            for (const recognition of normalizedNestedRecognitions) {
              if (parentRecognition && parentRecognition.reco_id !== recognition.reco_id) {
                attachNodeToAttempt(parentRecognition, recognition)
                continue
              }
              subTasks.addRecognition(subTaskId, recognition)
            }
            break
          }
          const timestamp = this.stringPool.intern(event.timestamp)
          const recoNodeAttempt: RecognitionAttempt = {
            reco_id: details.reco_details?.reco_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp,
            start_timestamp: timestamp,
            end_timestamp: timestamp,
            status: message === 'Node.RecognitionNode.Succeeded' ? 'success' : 'failed',
            reco_details: details.reco_details ? markRaw(details.reco_details) : undefined,
            error_image: this.findRecognitionImage(event.timestamp, details.name || ''),
            vision_image: this.findVisionImage(event.timestamp, details.name || '', details.reco_details?.reco_id || details.node_id)
          }
          recognitionOrderMeta.set(recoNodeAttempt, { startSeq: eventOrder, endSeq: eventOrder })
          if (parentRecognition && parentRecognition.reco_id !== recoNodeAttempt.reco_id) {
            attachNodeToAttempt(parentRecognition, recoNodeAttempt)
            break
          }
          subTasks.addRecognitionNode(subTaskId, recoNodeAttempt)
          break
        }

        case 'Node.ActionNode.Succeeded':
        case 'Node.ActionNode.Failed': {
          const nestedActions = subTasks.peekActions(subTaskId)
          const actionId = details.action_details?.action_id
          const actionKey = subTaskId != null && actionId != null ? scopedKey(subTaskId, actionId) : null
          const actionStartTimestamp = actionKey ? subTaskActionStartTimes.get(actionKey) : undefined
          const actionEndTimestamp = actionKey ? subTaskActionEndTimes.get(actionKey) : undefined
          nestedActionNodes.push({
            action_id: details.action_details?.action_id || details.node_id,
            name: this.stringPool.intern(details.name || ''),
            timestamp: this.stringPool.intern(event.timestamp),
            status: message === 'Node.ActionNode.Succeeded' ? 'success' : 'failed',
            action_details: withActionTimestamps(details.action_details, actionStartTimestamp, actionEndTimestamp, event.timestamp),
            nested_actions: nestedActions.length > 0 ? nestedActions : undefined
          })
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
          const actionStartOrder = actionKey ? subTaskActionStartOrders.get(actionKey) : undefined
          const actionEndOrder = actionKey ? subTaskActionEndOrders.get(actionKey) : undefined
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
          const mergedActionStartTimestamp = actionStartTimestamp || matchedTaskAction?.start_timestamp
          const mergedActionEndTimestamp = actionEndTimestamp || matchedTaskAction?.end_timestamp
          const taskRecognitions = dedupeRecognitionAttempts(subTasks.consumeRecognitions(subTaskId))
          const recognitionNodes = dedupeRecognitionAttempts(subTasks.consumeRecognitionNodes(subTaskId))
          const scopedTaskRecognitions: RecognitionAttempt[] = []
          const scopedRecognitionNodes: RecognitionAttempt[] = []
          const outOfScopeActionRecognitions: RecognitionAttempt[] = []

          const isInActionScope = (attempt: RecognitionAttempt): boolean => {
            if (actionStartOrder == null) return true
            const meta = recognitionOrderMeta.get(attempt)
            if (!meta) return true
            if (meta.endSeq < actionStartOrder) return false
            if (actionEndOrder != null && meta.startSeq > actionEndOrder) return false
            return true
          }

          for (const attempt of taskRecognitions) {
            if (isInActionScope(attempt)) {
              scopedTaskRecognitions.push(attempt)
            } else {
              outOfScopeActionRecognitions.push(attempt)
            }
          }
          for (const nodeAttempt of recognitionNodes) {
            if (isInActionScope(nodeAttempt)) {
              scopedRecognitionNodes.push(nodeAttempt)
            } else {
              outOfScopeActionRecognitions.push(nodeAttempt)
            }
          }

          const attachedRecognitions = attachRecognitionNodesToAttempts(scopedTaskRecognitions, scopedRecognitionNodes)
          const escapedActionRecognitions = dedupeRecognitionAttempts([
            ...outOfScopeActionRecognitions,
            ...attachedRecognitions.orphans
          ])
          if (escapedActionRecognitions.length > 0) {
            actionLevelRecognitionNodes.push(...escapedActionRecognitions)
          }
          const fallbackRecoDetails =
            details.reco_details ||
            (attachedRecognitions.attempts.length > 0
              ? attachedRecognitions.attempts[attachedRecognitions.attempts.length - 1].reco_details
              : undefined)
          subTasks.addPipelineNode(subTaskId, {
            node_id: nodeId,
            name: this.stringPool.intern(details.reco_details?.name || details.action_details?.name || details.name || ''),
            timestamp: startTimestamp,
            start_timestamp: startTimestamp,
            end_timestamp: endTimestamp,
            status: message === 'Node.PipelineNode.Succeeded' ? 'success' : 'failed',
            reco_details: fallbackRecoDetails ? markRaw(fallbackRecoDetails) : undefined,
            action_details: withActionTimestamps(mergedActionDetails, mergedActionStartTimestamp, mergedActionEndTimestamp, endTimestamp),
            recognition_attempts: attachedRecognitions.attempts.length > 0 ? attachedRecognitions.attempts : undefined
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
