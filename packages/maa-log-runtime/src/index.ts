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
  parseOptions?: ParseFileOptions
  parserVersion?: string
}

export interface RuntimeParseInput {
  content: string
  errorImages?: Map<string, string>
  visionImages?: Map<string, string>
  waitFreezesImages?: Map<string, string>
  parseOptions?: ParseFileOptions
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
