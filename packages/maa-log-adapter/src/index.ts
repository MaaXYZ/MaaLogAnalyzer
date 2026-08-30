import type { KernelStatistics } from '@windsland52/maa-log-kernel'
import type {
  RuntimeExecutionAdapter,
  RuntimeParseInput,
  RuntimeParseResult,
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

      await parser.parseFile(input.content, undefined, input.parseOptions)

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
