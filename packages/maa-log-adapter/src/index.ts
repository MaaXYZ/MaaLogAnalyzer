import type { KernelStatistics } from '@windsland52/maa-log-kernel'
import type {
  RuntimeExecutionAdapter,
  RuntimeParseInput,
  RuntimeParseResult,
  RuntimeParseSourcesInput,
} from '@windsland52/maa-log-runtime'
import { DEFAULT_PARSER_VERSION, LogParser } from '@windsland52/maa-log-parser'
import { NodeStatisticsAnalyzer } from '@windsland52/maa-log-parser/node-statistics'
import type { TaskInfo as ParserTaskInfo } from '@windsland52/maa-log-parser/types'

export const createMlaRuntimeAdapter = (): RuntimeExecutionAdapter<ParserTaskInfo> => {
  return {
    parserVersion: DEFAULT_PARSER_VERSION,
    async parse(input: RuntimeParseInput): Promise<RuntimeParseResult<ParserTaskInfo>> {
      const parser = new LogParser()
      parser.setErrorImages(input.errorImages ?? new Map())
      parser.setVisionImages(input.visionImages ?? new Map())
      parser.setWaitFreezesImages(input.waitFreezesImages ?? new Map())

      // 来源元数据只影响事件/节点的 `source` 标注，不改变解析语义；
      // 没给就退回 parseFile 的默认（sourceKey 为 input:0、无 path）。
      await parser.parseFile(input.content, undefined, {
        ...input.parseOptions,
        sourcePath: input.sourcePath,
        sourceKey: input.sourceKey,
      })

      return {
        tasks: parser.getTasksSnapshot(),
        events: parser.getEventsSnapshot(),
      }
    },
    /**
     * 多来源解析：逐文件惰性加载后交给同一个 LogParser（跨文件去重/轮转拼接语义不变）。
     * 这是 2GB+ 日志目录唯一可行的入口 —— 拼成单字符串会撞 V8 上限。
     */
    async parseSources(
      input: RuntimeParseSourcesInput,
    ): Promise<RuntimeParseResult<ParserTaskInfo>> {
      const parser = new LogParser()
      parser.setErrorImages(input.errorImages ?? new Map())
      parser.setVisionImages(input.visionImages ?? new Map())
      parser.setWaitFreezesImages(input.waitFreezesImages ?? new Map())

      const batchInputs = input.sources.map((source, index) => {
        const metadata = {
          sourceKey: source.sourceKey,
          sourcePath: source.sourcePath,
          inputIndex: source.inputIndex ?? index,
        }
        if (source.content != null) {
          return { ...metadata, content: source.content }
        }
        // 分块优先于整段：大日志只有分块路径才能把解析峰值压下来。
        if (source.loadChunks) {
          return { ...metadata, size: source.size ?? 0, loadChunks: source.loadChunks }
        }
        return {
          ...metadata,
          size: source.size ?? 0,
          loadContent: source.loadContent ?? (async () => ''),
        }
      })

      await parser.parseInputs(batchInputs, undefined, input.parseOptions)
      return {
        tasks: parser.getTasksSnapshot(),
        events: parser.getEventsSnapshot(),
      }
    },
    buildStatistics(tasks: ParserTaskInfo[]): KernelStatistics {
      return {
        nodes: NodeStatisticsAnalyzer.analyze(tasks),
        recognitionActions: NodeStatisticsAnalyzer.analyzeRecognitionAction(tasks),
      }
    },
  }
}

export const mlaRuntimeAdapter = createMlaRuntimeAdapter()
