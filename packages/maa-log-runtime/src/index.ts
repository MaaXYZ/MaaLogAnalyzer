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

export type { KernelOutput, ParseFileOptions, KernelStatistics } from '@windsland52/maa-log-kernel'
