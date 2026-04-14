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
} from '../shared/types'
import {
  parseMaaMessageMeta,
  resolveTaskLifecyclePhase,
  type MaaMessageMeta,
} from '../event/meta'
import {
  resolveTaskLifecycleEventDetails,
} from '../task/lifecycle'
import { parseEventLine as parseMaaEventLine, type ParsedEventLine } from '../event/line'
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

// Mirrored OnEventNotify lines from agent/server pairs can arrive a few extra
// milliseconds after the primary emitter. Keep the cross-source dedup window
// slightly wider so lone mirrored `starting` events do not leak into the trace.
const CROSS_SOURCE_DUPLICATE_WINDOW_MS = 20

export class LogParser {
  private events: EventNotification[] = []
  private protocolEvents: ProtocolEvent[] = []
  private rawLines: RawLineStore | null = null
  private messageMetaCache = new Map<string, MaaMessageMeta>()
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
      ? Math.abs(eventMs - previous.timestampMs) <= CROSS_SOURCE_DUPLICATE_WINDOW_MS
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

  private clearConsumedParseState(): void {
    this.events = []
    this.protocolEvents = []
    this.rawLines = null
    this.messageMetaCache.clear()
    this.taskProcessMap.clear()
    this.taskThreadMap.clear()
    this.lastEventBySignature.clear()
    this.dedupSignatureTimeline = []
    this.dedupSignatureTimelineHead = 0
    console.log(`事件令牌池统计: ${this.eventTokenPool.size} 个唯一字符串`)
    this.eventTokenPool.clear()
    this.syntheticLineNumber = 1
  }

  private projectTasksSnapshot(consume: boolean): TaskInfo[] {
    const trace = this.getTraceSnapshot()
    const tasks = projectTasksFromTrace(trace, {
      events: this.getEventsSnapshot(),
      errorImages: this.errorImages,
      visionImages: this.visionImages,
      waitFreezesImages: this.waitFreezesImages,
    })

    if (consume) {
      this.clearConsumedParseState()
    }

    return tasks
  }

  /**
   * Project tasks from the current buffered parser state without clearing it.
   *
   * Use this for realtime/incremental consumers that need to read the current
   * task tree repeatedly as new lines arrive.
   */
  getTasksSnapshot(): TaskInfo[] {
    return this.projectTasksSnapshot(false)
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

  /**
   * Project tasks and then clear buffered parser state.
   *
   * Use this for one-shot parse flows where the caller only needs the final
   * projected task list and will not keep querying parser snapshots afterward.
   */
  consumeTasks(): TaskInfo[] {
    return this.projectTasksSnapshot(true)
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
