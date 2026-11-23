import {
  buildKernelWarningsFromLength,
  DEFAULT_KERNEL_PARSER_VERSION,
  MLA_KERNEL_SCHEMA_VERSION,
  type EventNotification,
  type TaskInfo,
} from '@windsland52/maa-log-kernel'
import { LogParser } from '@windsland52/maa-log-parser'
import {
  DEFAULT_CORE_PARSE_OPTIONS,
  type ParseFileOptions,
  type RuntimeLogSource,
} from '@windsland52/maa-log-runtime'

export interface TaskDetailStreamOptions {
  /**
   * 解析来源（与 `analyzeLogSources` 相同）。大日志应提供 `loadChunks` 而不是
   * `loadContent`，否则解析期峰值仍会被整段解码拽高。
   */
  sources: readonly RuntimeLogSource[]
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  parseOptions?: ParseFileOptions
  /** 解析进度回调（语义与 parser 的 `onProgress` 一致）。 */
  onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  /**
   * 全量事件流（解析完成后按批回调，默认每批 5000 条）。
   *
   * 注意：`task.events` 只是**任务级事件子集**（实测 2.4GB 语料约 1.7 万条），
   * 全量事件（约 27.5 万条）在这里；两者不能互相替代。
   */
  onEvents?: (batch: EventNotification[]) => void | Promise<void>
  /** 事件流每批条数（默认 5000）。 */
  eventBatchSize?: number
  /**
   * 原始文本块钩子（在解析消费每一块时回调）。
   *
   * 用于把 legacy / raw / framework / override 这类**行级扫描**并进同一次解析：
   * 调用方不必再单独解压一遍内容，也不会多一份峰值。块边界可能落在行中间，
   * 扫描器需要自己拼接残留行（与 `loadChunks` 的约定一致）。
   */
  onChunk?: (info: {
    sourceKey: string
    inputIndex: number
    chunk: string
  }) => void | Promise<void>
  parserVersion?: string
}

/** 流式任务详情：先给骨架，再逐个给完整任务。 */
export interface ProjectedTaskDetail {
  /** 骨架（`_skeleton=true`）：任务级字段 + 空的 nodes，可安全长期保留。 */
  skeleton: TaskInfo
  /**
   * 完整任务详情（nodes / node_flow / events / 明细）。
   *
   * **回调返回后不要继续持有该对象**：不保留引用，峰值才能保持在「trace + 单个任务」；
   * 需要的数据请在回调内拷贝为标量/派生结构。
   */
  task: TaskInfo
}

export interface TaskDetailStreamSummary {
  /** 骨架任务，按执行顺序；与 `analyzeLogSources().tasks` 的任务集合/顺序一致。 */
  skeletons: TaskInfo[]
  /** 全量事件条数（与 `analyzeLogSources().events.length` 一致）。 */
  totalEvents: number
  /** 逐任务详情里事件数的合计（`task.events` 是任务级子集，不等于全量事件）。 */
  taskEventCount: number
  /** 无法投影的任务 id（正常应为空）。 */
  skipped: string[]
  warnings: string[]
  meta: {
    schemaVersion: string
    parserVersion: string
    generatedAt: string
  }
}

const buildParserInputs = (
  sources: readonly RuntimeLogSource[],
  onChunk?: TaskDetailStreamOptions['onChunk'],
) =>
  sources.map((source, index) => {
    const metadata = {
      sourceKey: source.sourceKey,
      sourcePath: source.sourcePath,
      inputIndex: source.inputIndex ?? index,
    }
    const sourceKey = source.sourceKey ?? source.sourcePath ?? `input:${metadata.inputIndex}`
    /** 把一块文本先交给扫描钩子，再喂给 parser；钩子可以异步。 */
    const tap = (chunk: string) =>
      onChunk ? onChunk({ sourceKey, inputIndex: metadata.inputIndex, chunk }) : undefined

    if (source.content != null) {
      if (!onChunk) return { ...metadata, content: source.content }
      const content = source.content
      return {
        ...metadata,
        size: content.length,
        loadChunks: async function* () {
          await tap(content)
          yield content
        },
      }
    }
    // 分块优先于整段：这是大日志唯一能把解析峰值压到块大小量级的路径。
    if (source.loadChunks) {
      const loadChunks = source.loadChunks
      return {
        ...metadata,
        size: source.size ?? 0,
        loadChunks: !onChunk
          ? loadChunks
          : async function* () {
              for await (const chunk of loadChunks()) {
                await tap(chunk)
                yield chunk
              }
            },
      }
    }
    const loadContent = source.loadContent ?? (async () => '')
    if (!onChunk) {
      return { ...metadata, size: source.size ?? 0, loadContent }
    }
    return {
      ...metadata,
      size: source.size ?? 0,
      loadChunks: async function* () {
        const content = await loadContent()
        await tap(content)
        yield content
      },
    }
  })

/** `iterateTaskDetails()` 依次产出的三类条目。 */
export type TaskStreamItem =
  | { type: 'skeletons'; skeletons: TaskInfo[] }
  | { type: 'events'; events: EventNotification[] }
  | { type: 'task'; skeleton: TaskInfo; task: TaskInfo }

/**
 * 流式消费任务详情（async generator 形态）：解析一次、逐批事件、逐任务投影。
 *
 * 产出顺序固定：
 * 1. `{ type: 'skeletons' }`（一次）——先拿任务集合/顺序，供调用方建聚合表；
 * 2. `{ type: 'events' }`（多批，默认 5000/批）——**全量事件**，与 `getEventsSnapshot()` 一致；
 * 3. `{ type: 'task' }`（逐任务，按执行顺序）——完整 `TaskInfo`。
 *
 * generator 的**返回值**是 `TaskDetailStreamSummary`。`for await` 会丢弃返回值，需要时手动迭代：
 * `const r = await gen.next(); if (r.done) r.value`。
 *
 * 与 `analyzeLogSources` 的区别：
 * - 不物化整树 `tasks`，也不克隆全局 `events`（大日志上这两步就是 GB 级）；
 * - 解析完成后先 `releaseParseScratch()`，逐任务投影，峰值 ≈ 常驻 trace + 单个任务。
 *
 * 实测（issue-7371，12 文件 / 2.44GB）：`analyzeLogSources` 峰值 RSS 3320MB / 38.6s；
 * 本接口 1115MB / 19.1s，全量事件 275,919 一条不少、28 个任务逐个投影、warnings 一致。
 *
 * 内存契约：消费完一个 `task` / `events` 条目后**立即丢弃引用**（需要的数据拷贝成标量/派生结构）；
 * 提前 `return()` / `break` 会结束 generator 并释放内部 parser。
 */
export async function* iterateTaskDetails(
  options: TaskDetailStreamOptions,
): AsyncGenerator<TaskStreamItem, TaskDetailStreamSummary> {
  const parser = new LogParser()
  parser.setErrorImages(options.errorImages ?? new Map())
  parser.setVisionImages(options.visionImages ?? new Map())
  parser.setWaitFreezesImages(options.waitFreezesImages ?? new Map())

  const parseOptions = options.parseOptions ?? DEFAULT_CORE_PARSE_OPTIONS
  await parser.parseInputs(
    buildParserInputs(options.sources, options.onChunk),
    options.onProgress,
    parseOptions,
  )

  // 解析期临时结构（去重历史/投影缓存）对详情投影没用，先释放掉。
  parser.releaseParseScratch()

  try {
    const skeletons = parser.getTaskSkeletons()
    yield { type: 'skeletons', skeletons }

    let totalEvents = 0
    for await (const events of parser.iterateEvents(options.eventBatchSize ?? 5_000)) {
      totalEvents += events.length
      yield { type: 'events', events }
    }

    const skipped: string[] = []
    let taskEventCount = 0
    for (const skeleton of skeletons) {
      const taskExecutionId = skeleton.task_execution_id
      if (!taskExecutionId) {
        skipped.push(skeleton.uuid ?? skeleton.entry ?? '<unknown>')
        continue
      }
      const task = parser.projectTaskDetail(taskExecutionId, skeleton.process_ids)
      if (!task) {
        skipped.push(taskExecutionId)
        continue
      }
      taskEventCount += task.events.length
      yield { type: 'task', skeleton, task }
    }

    const contentLength = options.sources.reduce(
      (sum, source) => sum + (source.content?.length ?? source.size ?? 0),
      0,
    )

    return {
      skeletons,
      totalEvents,
      taskEventCount,
      skipped,
      warnings: buildKernelWarningsFromLength(contentLength, totalEvents, skeletons.length),
      meta: {
        schemaVersion: MLA_KERNEL_SCHEMA_VERSION,
        parserVersion: options.parserVersion ?? DEFAULT_KERNEL_PARSER_VERSION,
        generatedAt: new Date().toISOString(),
      },
    }
  } finally {
    // 提前 return/break 时也要把解析状态放开（generator 结束后局部变量即可回收）。
    parser.releaseParseScratch()
  }
}

/**
 * 回调形态的 `iterateTaskDetails`：解析一次、逐批事件、逐任务回调。
 *
 * 与 generator 版等价，只是把 `events` / `task` 条目改成回调，调用方更省样板。
 * `onEvents` / `onTask` 内不要长期持有引用，否则峰值会回涨到接近整树投影。
 */
export const streamTaskDetails = async (
  options: TaskDetailStreamOptions,
  onTask: (detail: ProjectedTaskDetail) => void | Promise<void>,
): Promise<TaskDetailStreamSummary> => {
  const stream = iterateTaskDetails(options)
  while (true) {
    const next = await stream.next()
    if (next.done) return next.value
    const item = next.value
    if (item.type === 'events') {
      if (options.onEvents) await options.onEvents(item.events)
    } else if (item.type === 'task') {
      await onTask({ skeleton: item.skeleton, task: item.task })
    }
  }
}
