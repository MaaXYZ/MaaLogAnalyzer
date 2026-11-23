/**
 * Parser entry orchestration file.
 *
 * Architecture guide: ./logParser/README.md
 * Helper modules: ./logParser/
 *
 * Keep this file focused on high-level flow wiring; move detailed domain logic
 * into helper modules under ./logParser/ whenever possible.
 */
import type { EventNotification, EventSourceRef, TaskInfo, TaskSummary } from '../shared/types'
import { parseEventLine as parseMaaEventLine, type ParsedEventLine } from '../event/line'
import { createProtocolEvent } from '../protocol/eventFactory'
import type { ProtocolEvent } from '../protocol/types'
import {
  buildTraceTree,
  createIncrementalTraceReducer,
  type TraceScopePayload,
} from '../trace/reducer'
import type { ScopeNode } from '../trace/scopeTypes'
import { buildTraceIndex, type TraceIndex } from '../query/traceIndex'
import {
  projectTaskFromTrace,
  projectTaskSummariesFromTrace,
  projectTasksFromTrace,
  type ProjectedTaskCacheEntry,
  type SequencedTaskEvent,
} from '../projector/taskProjector'
import {
  adoptRawLineSource,
  cloneRawLineStore,
  createRawLineStore,
  type RawLineStore,
} from '../raw/store'
import { cloneSnapshotData, freezeSnapshotData } from './snapshotIsolation'

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
  /**
   * 每个输入（一份日志文件/分卷）解析完成时回调一次。
   *
   * 用于「边解析边上屏」：调用方可在首卷解析完后立刻读取 `getTaskSummaries()`，
   * 得到截至此刻已归约出的任务清单，而不必等整批解析 + 整树投影完成。
   * 回调抛错不会中断解析（内部吞掉并 warn）。
   */
  onInputParsed?: (info: { index: number; total: number }) => void
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

type BatchInput =
  | ParseSourceInput
  | (Omit<ParseSourceInput, 'content'> & {
      size: number
      loadContent: () => Promise<string>
    })

const inputSize = (input: BatchInput) => ('content' in input ? input.content.length : input.size)

const normalizeParseSourceInputs = (inputs: BatchInput[]) => {
  const indexedInputs = inputs.map((input, index) => ({
    ...input,
    inputIndex: input.inputIndex ?? index,
  }))
  const baseKeys = indexedInputs.map((input) => {
    if (input.sourceKey?.trim()) return input.sourceKey
    if (input.sourcePath?.trim()) return input.sourcePath
    return `input:${input.inputIndex}`
  })
  const reservedKeys = new Set(baseKeys)
  const usedKeys = new Set<string>()
  const nextSuffixByBaseKey = new Map<string, number>()

  return indexedInputs.map((input, index) => {
    const baseKey = baseKeys[index]!
    let sourceKey = baseKey

    if (usedKeys.has(sourceKey)) {
      let suffix = nextSuffixByBaseKey.get(baseKey) ?? 2
      do {
        sourceKey = `${baseKey}#${suffix}`
        suffix += 1
      } while (usedKeys.has(sourceKey) || reservedKeys.has(sourceKey))
      nextSuffixByBaseKey.set(baseKey, suffix)
    } else {
      nextSuffixByBaseKey.set(baseKey, 2)
    }

    usedKeys.add(sourceKey)
    return {
      ...input,
      sourceKey,
    }
  })
}

const defaultParseYieldControl = async (): Promise<void> => {
  // 使用 MessageChannel 可以实现比 setTimeout(0) 更快、更高效的宏任务 yield，
  // 将切片时间从平均 ~4ms 降低至 <1ms，从而成倍提升大型日志解析性能
  if (typeof MessageChannel !== 'undefined') {
    await new Promise<void>((resolve) => {
      const channel = new MessageChannel()
      channel.port1.onmessage = () => {
        // 端口是活动句柄：不关掉的话 Node 侧解析完也退不出进程（CLI / 内核服务都会挂住）
        channel.port1.close()
        channel.port2.close()
        resolve()
      }
      channel.port2.postMessage(null)
    })
  } else {
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }
}

/**
 * 强制复制字符串，避免 V8 sliced string 长时间持有整段日志 backing store。
 * 说明：日志很大时，子串若不复制可能导致旧日志内容在多次重载后难以及时释放。
 */
const forceCopyString = (value: string): string => {
  if (!value) return ''
  // 利用现代 V8 的字符串连接机制打断 sliced string 引用，比字符遍历快几个数量级
  return (' ' + value).slice(1)
}

// Mirrored OnEventNotify lines from agent/server pairs can arrive tens of
// milliseconds after the primary emitter. Keep the cross-source dedup window
// wide enough so delayed mirrored terminal events do not create synthetic
// empty scopes after the real scope has already been closed.
const CROSS_SOURCE_DUPLICATE_WINDOW_MS = 1000
/**
 * 实时追加路径的去重历史按**出现次数**封顶（不是按签名个数）。
 *
 * 整批 `parseInputs` 不做这个淘汰，原因见 `LogParser.boundDedupOccurrences`。
 */
const MAX_DEDUP_OCCURRENCES = 16_384

/**
 * 某个签名下、**单个来源**出现过的全部时间戳。
 *
 * 拆到「按来源」这一层是为了让查找不随历史长度退化：
 * `[head, timestamps.length)` 是仍然存活的部分，升序；`head` 之前是已淘汰的前缀（O(1) 摊还）。
 * 单来源是绝大多数情况，查找时整桶直接跳过，连二分都不用做。
 */
interface DedupSourceLog {
  timestamps: number[]
  head: number
}

type DedupBucket = Map<string, DedupSourceLog>

const dedupSourceKey = (processId: string, threadId: string): string =>
  `${processId}\u0000${threadId}`

/** 在 [from, arr.length) 内找第一个 >= value 的下标；找不到返回 arr.length。 */
const lowerBoundTimestamp = (arr: number[], value: number, from: number): number => {
  let low = from
  let high = arr.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if ((arr[mid] as number) < value) low = mid + 1
    else high = mid
  }
  return low
}

/** 该来源在 ±窗口内是否有出现。 */
const sourceLogHasWithin = (log: DedupSourceLog, eventMs: number): boolean => {
  const arr = log.timestamps
  const index = lowerBoundTimestamp(arr, eventMs - CROSS_SOURCE_DUPLICATE_WINDOW_MS, log.head)
  return index < arr.length && (arr[index] as number) <= eventMs + CROSS_SOURCE_DUPLICATE_WINDOW_MS
}

export class LogParser {
  private events: EventNotification[] = []
  private protocolEvents: ProtocolEvent[] = []
  private traceReducer = createIncrementalTraceReducer()
  private sequencedEventsByTaskId = new Map<number, SequencedTaskEvent[]>()
  private completedTaskCache = new Map<string, ProjectedTaskCacheEntry>()
  private rawLines: RawLineStore | null = null
  private eventTokenPool = new Map<string, string>()
  /**
   * 每个签名保留**近窗内的全部出现**，而不是只有最后一次。
   *
   * 签名相同的通知会反复出现（`Node.NextList.*` 在循环里、同一节点反复命中时尤其明显）。
   * 多个输入是逐个文件串行解析的，如果只留"最后一次"，先解析的那份文件里跟镜像成对的那一次
   * 早已被后续同样的通知覆盖掉，后解析的文件就永远配不上。
   */
  private recentEventsBySignature = new Map<string, DedupBucket>()
  private dedupOccurrenceTimeline: Array<{
    signature: string
    sourceKey: string
    timestampMs: number
  }> = []
  private dedupOccurrenceTimelineHead = 0
  /**
   * 已知互为「镜像」的进程对（`PxA|PxB`，字典序）。
   *
   * 只要有一次事件因跨源去重被丢弃，就说明这两个进程在并行写同一份事件流。
   * 投影层用它判定「一个永不闭合的 0 节点任务」是不是另一次任务的镜像副本
   * （进程重启复用 task_id 时不会产生任何跨源去重，因此不会被误合并）。
   */
  private mirroredProcessPairs = new Set<string>()
  private syntheticLineNumber = 1
  private errorImages = new Map<string, string>()
  private visionImages = new Map<string, string>()
  private waitFreezesImages = new Map<string, string>()
  private fullParseInProgress = false
  /**
   * 整批 parseInputs 期间保留全部出现记录，不做容量淘汰。
   *
   * 跨文件镜像要求先解析那份文件的出现一直留到后一份文件解析到它为止。容量淘汰是全局 FIFO，
   * 后一份文件一开始解析，先解析那份文件的**开头**就已经被它的尾部挤出历史，
   * 于是后一份文件从头到尾都配不上镜像（实测 17,000 条事件时 17,000 对镜像全部漏掉）。
   * 实时追加是单来源，跨源查找本来就不会命中，封顶只在那条路径上做内存兜底。
   *
   * 整批解析的内存因此与这一批保留下来的事件同阶（出现记录比事件本身小得多）。
   */
  private boundDedupOccurrences = true

  /**
   * 设置错误截图映射
   */
  setErrorImages(images: Map<string, string>): void {
    this.errorImages = images
    this.completedTaskCache.clear()
  }

  /**
   * 设置 vision 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_RecoId
   */
  setVisionImages(images: Map<string, string>): void {
    this.visionImages = images
    this.completedTaskCache.clear()
  }

  /**
   * 设置 wait_freezes 调试截图映射
   * key 格式: YYYY.MM.DD-HH.MM.SS.ms_NodeName_wait_freezes
   */
  setWaitFreezesImages(images: Map<string, string>): void {
    this.waitFreezesImages = images
    this.completedTaskCache.clear()
  }

  resetParsedEvents(): void {
    this.events = []
    this.protocolEvents = []
    this.traceReducer.reset()
    this.sequencedEventsByTaskId.clear()
    this.completedTaskCache.clear()
    this.rawLines = null
    this.recentEventsBySignature.clear()
    this.dedupOccurrenceTimeline = []
    this.dedupOccurrenceTimelineHead = 0
    this.mirroredProcessPairs.clear()
    this.eventTokenPool.clear()
    this.syntheticLineNumber = 1
  }

  /**
   * 去重历史只按**条数**封顶（时间窗在 lookup 处判断，见 appendEvent 的说明）。
   *
   * 只对实时追加生效：整批 parseInputs 期间历史就是这一批事件本身，淘汰它必然破坏跨文件镜像
   * （见 boundDedupOccurrences）。这里同时负责压实数组，否则 head 一直右移、数组本身会无限增长。
   */
  private pruneDedupOccurrenceCapacity(): void {
    while (
      this.dedupOccurrenceTimeline.length - this.dedupOccurrenceTimelineHead >
      MAX_DEDUP_OCCURRENCES
    ) {
      const item = this.dedupOccurrenceTimeline[this.dedupOccurrenceTimelineHead]
      if (item) this.evictDedupOccurrence(item.signature, item.sourceKey, item.timestampMs)
      this.dedupOccurrenceTimelineHead += 1
    }

    if (
      this.dedupOccurrenceTimelineHead > 4096 &&
      this.dedupOccurrenceTimelineHead * 2 >= this.dedupOccurrenceTimeline.length
    ) {
      this.dedupOccurrenceTimeline = this.dedupOccurrenceTimeline.slice(
        this.dedupOccurrenceTimelineHead,
      )
      this.dedupOccurrenceTimelineHead = 0
    }
  }

  /** 记一次出现（同源内时间基本递增，乱序只会在跨输入时发生）。 */
  private recordDedupOccurrence(signature: string, sourceKey: string, timestampMs: number): void {
    let bucket = this.recentEventsBySignature.get(signature)
    if (!bucket) {
      bucket = new Map()
      this.recentEventsBySignature.set(signature, bucket)
    }
    let log = bucket.get(sourceKey)
    if (!log) {
      log = { timestamps: [], head: 0 }
      bucket.set(sourceKey, log)
    }

    const timestamps = log.timestamps
    if (log.head >= timestamps.length) {
      // 该来源的条目已全部淘汰，直接复用数组
      timestamps.length = 0
      log.head = 0
      timestamps.push(timestampMs)
    } else if (timestampMs >= (timestamps[timestamps.length - 1] as number)) {
      timestamps.push(timestampMs)
    } else {
      timestamps.splice(lowerBoundTimestamp(timestamps, timestampMs, log.head), 0, timestampMs)
    }

    this.dedupOccurrenceTimeline.push({ signature, sourceKey, timestampMs })
  }

  /** 淘汰一条历史出现。正常情况下它就在该来源数组的头部，O(1)。 */
  private evictDedupOccurrence(signature: string, sourceKey: string, timestampMs: number): void {
    const bucket = this.recentEventsBySignature.get(signature)
    const log = bucket?.get(sourceKey)
    if (!bucket || !log) return

    const timestamps = log.timestamps
    if (log.head < timestamps.length && timestamps[log.head] === timestampMs) {
      log.head += 1
    } else {
      const index = timestamps.indexOf(timestampMs, log.head)
      if (index >= 0) timestamps.splice(index, 1)
    }

    if (log.head >= timestamps.length) {
      bucket.delete(sourceKey)
    } else if (log.head > 64 && log.head * 2 >= timestamps.length) {
      log.timestamps = timestamps.slice(log.head)
      log.head = 0
    }
    if (bucket.size === 0) this.recentEventsBySignature.delete(signature)
  }

  private internEventToken(raw: string): string {
    // 先查池再复制：池里命中的绝大多数串（msg / level / Px / Tx）都不必走 forceCopyString 的拷贝。
    const pooled = this.eventTokenPool.get(raw)
    if (pooled) return pooled
    const copied = forceCopyString(raw)
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
    // 这里**不能**按「当前事件时间 - 窗口」去剪裁历史：多个输入是逐个文件串行解析的
    // （客户端 debug/maafw.log + agent debug/agent/maafw.log 就是典型场景），后一份文件的时间戳
    // 往往早于前一份文件末尾的 watermark，一旦剪掉就再也匹配不上，跨文件镜像去重会整体失效。
    // 时间窗口的判断放在 `isMirroredEvent` 里 —— 它按两份事件的真实时间差算，与流的先后无关；
    // 内存则由 pruneDedupOccurrenceCapacity() 在实时追加路径上按出现次数封顶；
    // 整批解析期间不淘汰（boundDedupOccurrences），否则跨文件镜像同样会失效。
    const eventMs = event._timestampMs
    const sourceKey = dedupSourceKey(event.processId, event.threadId)
    const mirroredSource =
      Number.isFinite(eventMs) ? this.findMirroredSource(event, sourceKey) : null
    if (mirroredSource != null) {
      this.recordMirroredProcessPair(event.processId, mirroredSource)
      return
    }

    // 来源信息在这里就绑到事件上，而不是等投影时再反查：
    // 一个事件一旦被接受，它来自哪份文件、第几行就确定了；后面跨源去重、按任务归并
    // 都会改变事件顺序，事后再查就得额外维护一份索引。
    const sourceRef: EventSourceRef = {
      path: sourceOptions?.sourcePath,
      line: event._lineNumber,
      inputIndex: sourceOptions?.inputIndex,
      sourceKey: sourceOptions?.sourceKey,
    }
    const hasSourceRef =
      sourceRef.path != null ||
      sourceRef.line != null ||
      sourceRef.inputIndex != null ||
      sourceRef.sourceKey != null

    const storedEvent: EventNotification = {
      timestamp: event.timestamp,
      level: event.level,
      message: event.message,
      details: event.details,
      _lineNumber: event._lineNumber,
      process_id: event.processId,
      ...(hasSourceRef ? { source: sourceRef } : {}),
    }
    const protocolEvent = createProtocolEvent(event, {
      seq: this.protocolEvents.length + 1,
      sourceKey: sourceOptions?.sourceKey,
      sourcePath: sourceOptions?.sourcePath,
      inputIndex: sourceOptions?.inputIndex,
    })
    this.events.push(storedEvent)
    if (protocolEvent) {
      this.protocolEvents.push(protocolEvent)
      this.traceReducer.append(protocolEvent)
      if ('taskId' in protocolEvent && protocolEvent.taskId != null) {
        const sequencedEvent: SequencedTaskEvent = {
          seq: protocolEvent.seq,
          sourceKey: protocolEvent.source.sourceKey,
          processId: protocolEvent.processId,
          event: storedEvent,
        }
        const taskEvents = this.sequencedEventsByTaskId.get(protocolEvent.taskId)
        if (taskEvents) {
          taskEvents.push(sequencedEvent)
        } else {
          this.sequencedEventsByTaskId.set(protocolEvent.taskId, [sequencedEvent])
        }
      }
    }
    if (Number.isFinite(eventMs)) {
      this.recordDedupOccurrence(event._dedupSignature, sourceKey, eventMs)
      if (this.boundDedupOccurrences) this.pruneDedupOccurrenceCapacity()
    }
  }

  /**
   * 该事件是不是「另一个来源已经写过一遍」的镜像。
   *
   * 只看**别的来源**：单来源是绝大多数情况，整桶直接跳过，不随历史长度退化；
   * 多来源时对每个来源做一次二分，不扫描条目。
   */
  /**
   * 找出与之镜像的那个来源；不是镜像则返回 null。
   *
   * 返回命中的来源（而不是布尔值），是因为上层还要据此记录「镜像进程对」：
   * 投影层要靠它区分「同一次执行的镜像副本」与「进程重启后复用 task_id 的新执行」。
   */
  private findMirroredSource(
    event: { _dedupSignature: string; _timestampMs: number },
    sourceKey: string,
  ): string | null {
    const bucket = this.recentEventsBySignature.get(event._dedupSignature)
    if (!bucket) return null
    // 桶里只有自己这一个来源 → 不可能有跨源重复
    if (bucket.size === 1 && bucket.has(sourceKey)) return null

    const eventMs = event._timestampMs
    for (const [otherSourceKey, log] of bucket) {
      if (otherSourceKey === sourceKey) continue
      if (sourceLogHasWithin(log, eventMs)) return otherSourceKey
    }
    return null
  }

  private recordMirroredProcessPair(processId: string, otherSourceKey: string): void {
    const otherProcessId = otherSourceKey.split('\u0000', 1)[0]
    if (!otherProcessId || otherProcessId === processId) return
    const pair =
      processId < otherProcessId
        ? `${processId}|${otherProcessId}`
        : `${otherProcessId}|${processId}`
    this.mirroredProcessPairs.add(pair)
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
      progressWeight: number
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
    const rawLines = runtime.storeRawLines ? ([] as string[]) : null
    const chunkLineCount = runtime.chunkLineCount
    let cursor = 0
    let lineNum = 0

    if (totalChars === 0) {
      if (rawLines) {
        adoptRawLineSource(this.ensureRawLineStore(), {
          ...sourceMeta,
          lines: rawLines,
        })
      }
      if (runtime.onProgress) {
        const current = Math.min(runtime.progressOffset, runtime.totalChars)
        runtime.onProgress({
          current,
          total: runtime.totalChars,
          percentage:
            runtime.totalChars === 0 ? 100 : Math.round((current / runtime.totalChars) * 100),
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
        const current = Math.min(
          runtime.progressOffset +
            Math.round(runtime.progressWeight * (Math.min(cursor, totalChars) / totalChars)),
          runtime.totalChars,
        )
        runtime.onProgress({
          current,
          total: runtime.totalChars,
          percentage:
            runtime.totalChars === 0 ? 100 : Math.round((current / runtime.totalChars) * 100),
        })
      }
    }

    if (rawLines) {
      adoptRawLineSource(this.ensureRawLineStore(), {
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
    inputs: BatchInput[],
    onProgress?: (progress: ParseProgress) => void,
    options?: ParseFileOptions,
  ): Promise<void> {
    const chunkLineCount = options?.chunkLineCount ?? 1000
    if (!Number.isSafeInteger(chunkLineCount) || chunkLineCount <= 0) {
      throw new RangeError('chunkLineCount must be a positive safe integer')
    }
    if (this.fullParseInProgress) {
      throw new Error('A full parse is already in progress for this LogParser instance')
    }

    this.fullParseInProgress = true
    // 整批解析期间不做去重容量淘汰：后一份输入要配的镜像可能落在先解析那份文件的开头。
    this.boundDedupOccurrences = false
    try {
      this.resetParsedEvents()

      const normalizedInputs = normalizeParseSourceInputs(inputs)
      const totalChars = normalizedInputs.reduce((sum, input) => sum + inputSize(input), 0)
      const yieldControl =
        options?.yieldControl === undefined ? defaultParseYieldControl : options.yieldControl
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
      for (const [currentInputIndex, input] of normalizedInputs.entries()) {
        const content = 'content' in input ? input.content : await input.loadContent()
        const weight = inputSize(input)
        await this.parseSourceContent(
          { ...input, content },
          {
            onProgress,
            chunkLineCount,
            yieldControl,
            progressOffset,
            progressWeight: weight,
            totalChars,
            storeRawLines,
          },
        )
        progressOffset += weight
        if (options?.onInputParsed) {
          try {
            options.onInputParsed({ index: currentInputIndex, total: normalizedInputs.length })
          } catch (error) {
            // 上屏回调属于消费方副作用：它失败不该让整批解析失败。
            console.warn('onInputParsed 回调失败:', error)
          }
        }
      }

      if (onProgress) {
        onProgress({
          current: totalChars,
          total: totalChars,
          percentage: 100,
        })
      }
    } finally {
      this.fullParseInProgress = false
      this.boundDedupOccurrences = true
    }
  }

  /**
   * 解析单个日志文件内容（异步分块处理）
   * 只处理包含 !!!OnEventNotify!!! 的行
   */
  async parseFile(
    content: string,
    onProgress?: (progress: ParseProgress) => void,
    options?: ParseFileOptions,
  ): Promise<void> {
    await this.parseInputs(
      [
        {
          content,
          sourceKey: options?.sourceKey,
          sourcePath: options?.sourcePath,
          inputIndex: options?.inputIndex,
        },
      ],
      onProgress,
      options,
    )
  }

  /**
   * 直接从事件行提取所有需要的字段
   * 格式: [timestamp][level][Pxpid][Txthread][...] !!!OnEventNotify!!! [handle=xxx] [msg=EventName] [details={...json...}]
   */
  private parseEventLine(line: string, lineNum: number): ParsedEventLine | null {
    return parseMaaEventLine(line, lineNum, {
      internEventToken: (raw) => this.internEventToken(raw),
      forceCopyString,
    })
  }

  private clearConsumedParseState(): void {
    this.events = []
    this.protocolEvents = []
    this.traceReducer.reset()
    this.sequencedEventsByTaskId.clear()
    this.completedTaskCache.clear()
    this.rawLines = null
    this.recentEventsBySignature.clear()
    this.dedupOccurrenceTimeline = []
    this.dedupOccurrenceTimelineHead = 0
    console.log(`事件令牌池统计: ${this.eventTokenPool.size} 个唯一字符串`)
    this.eventTokenPool.clear()
    this.syntheticLineNumber = 1
  }

  private projectTasksSnapshot(consume: boolean): TaskInfo[] {
    const trace = this.traceReducer.getTrace()
    const tasks = projectTasksFromTrace(trace, {
      sequencedEventsByTaskId: this.sequencedEventsByTaskId,
      completedTaskCache: this.completedTaskCache,
      errorImages: this.errorImages,
      visionImages: this.visionImages,
      waitFreezesImages: this.waitFreezesImages,
      mirrorProcessPairs: this.mirroredProcessPairs,
    })
    for (const task of tasks) freezeSnapshotData(task)

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

  /**
   * 全部任务的**骨架**（列表/导航可用，不含 node_flow、识别/动作明细与事件）。
   *
   * 与 `consumeTasks()` 的任务集合、顺序、任务级字段一致，但 payload 从 GB 级降到 MB 级；
   * 详情由 `projectTaskDetail()` 按任务取。注意**不能**复用 `completedTaskCache`：
   * 那个缓存存的是完整任务，骨架走它会互相污染。
   */
  getTaskSkeletons(): TaskInfo[] {
    const tasks = projectTasksFromTrace(this.traceReducer.getTrace(), {
      completedTaskCache: new Map(),
      errorImages: this.errorImages,
      visionImages: this.visionImages,
      waitFreezesImages: this.waitFreezesImages,
      mirrorProcessPairs: this.mirroredProcessPairs,
      detail: 'skeleton',
    })
    for (const task of tasks) {
      task._skeleton = true
      freezeSnapshotData(task)
    }
    return tasks
  }

  /**
   * 只投影一个任务（按 `TaskSummary.task_execution_id`）。
   *
   * 大日志上「整树投影」是首屏大头（实测 48.7s / 1.76GB），而多数交互只需要当前选中的任务。
   * 该方法把作用域树裁到目标任务再投影，结果与 `consumeTasks()` 中对应任务逐字段一致。
   */
  projectTaskDetail(
    taskExecutionId: string,
    processIdsOverride?: readonly string[],
  ): TaskInfo | null {
    return projectTaskFromTrace(
      this.traceReducer.getTrace(),
      taskExecutionId,
      {
        sequencedEventsByTaskId: this.sequencedEventsByTaskId,
        completedTaskCache: new Map(),
        errorImages: this.errorImages,
        visionImages: this.visionImages,
        waitFreezesImages: this.waitFreezesImages,
      },
      processIdsOverride,
    )
  }

  /**
   * 当前已归约任务的**瘦摘要**（不展开 nodes/node_flow/events/明细）。
   *
   * 与 `getTasksSnapshot()` / `consumeTasks()` 共用同一套作用域收集与排序，
   * 任务集合、顺序、任务级字段一致；区别是**不投影任务树**，因此可以在解析
   * 进行中频繁调用（配合 `ParseFileOptions.onInputParsed`）做「边解析边上屏」。
   *
   * 解析完成后仍应使用 `consumeTasks()` / `getTasksSnapshot()` 拿完整任务树。
   */
  getTaskSummaries(): TaskSummary[] {
    return projectTaskSummariesFromTrace(this.traceReducer.getTrace(), {
      errorImages: this.errorImages,
      visionImages: this.visionImages,
      waitFreezesImages: this.waitFreezesImages,
      mirrorProcessPairs: this.mirroredProcessPairs,
    })
  }

  getEventsSnapshot(): EventNotification[] {
    return cloneSnapshotData(this.events)
  }

  getProtocolEventsSnapshot(): ProtocolEvent[] {
    return cloneSnapshotData(this.protocolEvents)
  }

  getRawLineStoreSnapshot(): RawLineStore | null {
    return cloneRawLineStore(this.rawLines)
  }

  getTraceSnapshot(): ScopeNode<TraceScopePayload | Record<string, never>> {
    return buildTraceTree(this.getProtocolEventsSnapshot())
  }

  getTraceIndexSnapshot(): TraceIndex {
    const events = this.getProtocolEventsSnapshot()
    const trace = buildTraceTree(events)
    return buildTraceIndex(trace, events)
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
    return this.getEventsSnapshot()
  }
}
