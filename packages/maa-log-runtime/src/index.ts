import type {
  EventNotification,
  KernelOutput,
  KernelStatistics,
  ParseFileOptions,
  TaskInfo,
} from '@windsland52/maa-log-kernel'
import { buildKernelOutput } from '@windsland52/maa-log-kernel'

export interface AnalyzeLogContentInput {
  content: string
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  /**
   * 这份 content 来自哪个文件。给了它，输出里的 `EventNotification.source.path` /
   * `NodeInfo.source.path` 才有值（下游要回答「这条事件出自哪份日志」）。
   *
   * **只有确定 content 就是这一个文件的全部内容时才该给**：多文件被合并成一段字符串时，
   * `source.line` 是合并后的行号，配上一个具体 path 会指错文件 —— 那种情况请留空。
   */
  sourcePath?: string
  /** 解析输入的去重键（默认取 `sourcePath`）；一般不需要手动给 */
  sourceKey?: string
  parseOptions?: ParseFileOptions
  parserVersion?: string
}

/**
 * 多来源解析里的单个输入。
 *
 * 与单来源 `content: string` 的区别：可以只给 `loadContent`（惰性读），这样上层不必
 * 把 2GB+ 的多个文件拼成一整串（V8 单字符串上限约 512MB）。
 */
export interface RuntimeLogSource {
  content?: string
  /** 解析进度权重（解压后字符数的估算）；未知时可给文件字节数。 */
  size?: number
  /**
   * 整段读取（旧路径）。与 `loadContent` 互斥；三者的优先级是
   * `content` → `loadChunks` → `loadContent`。
   */
  loadContent?: () => Promise<string>
  /**
   * 按块读取同一份日志（推荐用于 2GB+ 大日志）。
   *
   * 块边界可以落在任意位置（行中间也合法），parser 会跨块拼接行；
   * 相比整段字符串，峰值内存只与块大小相关。
   */
  loadChunks?: () => AsyncIterable<string>
  sourceKey?: string
  sourcePath?: string
  inputIndex?: number
}

export interface RuntimeParseSourcesInput {
  sources: readonly RuntimeLogSource[]
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  parseOptions?: ParseFileOptions
}

export interface AnalyzeLogSourcesInput extends RuntimeParseSourcesInput {
  parserVersion?: string
}

export interface RuntimeParseInput {
  content: string
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  parseOptions?: ParseFileOptions
  /** 来源文件；见 AnalyzeLogContentInput.sourcePath */
  sourcePath?: string
  sourceKey?: string
}

export interface RuntimeParseResult<TTask extends TaskInfo = TaskInfo> {
  tasks: TTask[]
  events: EventNotification[]
}

export interface RuntimeExecutionAdapter<TTask extends TaskInfo = TaskInfo> {
  parserVersion?: string
  parse: (input: RuntimeParseInput) => Promise<RuntimeParseResult<TTask>>
  /**
   * 多来源解析（惰性逐文件加载）。adapter 不支持时可缺省，调用方回退到单字符串路径。
   */
  parseSources?: (input: RuntimeParseSourcesInput) => Promise<RuntimeParseResult<TTask>>
  buildStatistics: (tasks: TTask[]) => KernelStatistics
}

export const DEFAULT_CORE_PARSE_OPTIONS: ParseFileOptions = {
  yieldControl: null,
}

export const analyzeLogContentWith = async <TTask extends TaskInfo = TaskInfo>(
  adapter: RuntimeExecutionAdapter<TTask>,
  input: AnalyzeLogContentInput,
): Promise<KernelOutput<TTask>> => {
  const parseResult = await adapter.parse({
    content: input.content,
    errorImages: input.errorImages,
    visionImages: input.visionImages,
    waitFreezesImages: input.waitFreezesImages,
    parseOptions: input.parseOptions ?? DEFAULT_CORE_PARSE_OPTIONS,
    sourcePath: input.sourcePath,
    sourceKey: input.sourceKey,
  })
  const stats = adapter.buildStatistics(parseResult.tasks)

  return buildKernelOutput<TTask>({
    content: input.content,
    tasks: parseResult.tasks,
    events: parseResult.events,
    stats,
    parserVersion: input.parserVersion || adapter.parserVersion,
  })
}

/**
 * 多来源版本的 `analyzeLogContentWith`：不要求把日志拼成一整串。
 *
 * 语义与单来源一致（同一个 parser、同一套去重/跨文件拼接），只是输入改成懒加载的
 * 来源列表；`source` 标注用每个来源自己的 sourceKey/sourcePath，因此「这行属于哪个文件」
 * 比合并成一段字符串时更准确。
 */
export const analyzeLogSourcesWith = async <TTask extends TaskInfo = TaskInfo>(
  adapter: RuntimeExecutionAdapter<TTask>,
  input: AnalyzeLogSourcesInput,
): Promise<KernelOutput<TTask>> => {
  if (!adapter.parseSources) {
    throw new Error('当前运行时适配器不支持多来源解析（parseSources 缺失）')
  }
  const parseResult = await adapter.parseSources({
    sources: input.sources,
    errorImages: input.errorImages,
    visionImages: input.visionImages,
    waitFreezesImages: input.waitFreezesImages,
    parseOptions: input.parseOptions ?? DEFAULT_CORE_PARSE_OPTIONS,
  })
  const stats = adapter.buildStatistics(parseResult.tasks)
  const contentLength = input.sources.reduce(
    (sum, source) => sum + (source.content?.length ?? source.size ?? 0),
    0,
  )

  return buildKernelOutput<TTask>({
    contentLength,
    tasks: parseResult.tasks,
    events: parseResult.events,
    stats,
    parserVersion: input.parserVersion || adapter.parserVersion,
  })
}

export type { KernelOutput, ParseFileOptions, KernelStatistics } from '@windsland52/maa-log-kernel'
