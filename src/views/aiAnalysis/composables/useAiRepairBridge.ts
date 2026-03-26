import type { ChatCompletionResult } from '../../../ai/client'
import type { StructuredAiOutput } from '../../../ai/structuredOutput'
import type { AiSettings } from '../../../utils/aiSettings'
import type { ParentRelationConflictIssue, ParentRelationFacts } from '../types'
import {
  repairParentRelationConsistency as repairParentRelationConsistencyByAiUtil,
  repairStructuredOutput as repairStructuredOutputByAiUtil,
} from '../utils/repair'

interface UseAiRepairBridgeOptions {
  settings: AiSettings
}

export const useAiRepairBridge = (options: UseAiRepairBridgeOptions) => {
  const repairStructuredOutput = async (
    rawOutput: string,
    key: string,
    onUsage?: (resp: ChatCompletionResult) => void
  ): Promise<StructuredAiOutput | null> => {
    return repairStructuredOutputByAiUtil({
      rawOutput,
      apiKey: key,
      settings: {
        baseUrl: options.settings.baseUrl,
        model: options.settings.model,
      },
      onUsage,
    })
  }

  const repairParentRelationConsistency = async (
    current: StructuredAiOutput,
    key: string,
    issue: ParentRelationConflictIssue,
    facts: ParentRelationFacts | null,
    onUsage?: (resp: ChatCompletionResult) => void
  ): Promise<StructuredAiOutput | null> => {
    return repairParentRelationConsistencyByAiUtil({
      current,
      apiKey: key,
      issue,
      facts,
      settings: {
        baseUrl: options.settings.baseUrl,
        model: options.settings.model,
      },
      onUsage,
    })
  }

  return {
    repairStructuredOutput,
    repairParentRelationConsistency,
  }
}
