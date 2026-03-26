import type { Ref } from 'vue'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import { buildAiAnalysisContext } from '../../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { AiSettings } from '../../../utils/aiSettings'
import type { AnalysisFocusMode, AnalysisPromptProfile, MemoryState } from '../types'
import { buildCompactContext } from '../utils/contextCompactor'
import { buildFullContextPromptText, buildMemoryPromptText } from '../utils/contextPrompt'
import {
  buildConciseRetryPrompt as buildConciseRetryPromptByPolicy,
  getFocusFollowupRule as getFocusFollowupRuleByPolicy,
  getFocusTaskRequirementLines as getFocusTaskRequirementLinesByPolicy,
  getSystemPrompt as getSystemPromptByPolicy,
  shouldUseDiagnosticTemplateForQuestion as shouldUseDiagnosticTemplateForQuestionByPolicy,
} from '../utils/promptPolicy'

interface UseAiPromptRuntimeOptions {
  settings: AiSettings
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  question: Ref<string>
  loadedTargets: Ref<AiLoadedTarget[]>
  loadedDefaultTargetId: Ref<string>
  effectiveSelectedNode: Ref<NodeInfo | null>
  effectiveSelectedFlowItemId: Ref<string | null>
}

export const useAiPromptRuntime = (options: UseAiPromptRuntimeOptions) => {
  const analysisPromptSoftLimit = 110000
  const analysisTimeoutMs = 180000

  const getConciseAnswerMaxChars = () => Math.max(800, Math.floor(options.settings.conciseAnswerMaxChars || 1800))
  const getConciseMaxEvidence = () => Math.max(3, Math.floor(options.settings.conciseMaxEvidence || 6))
  const getConciseMaxRootCauses = () => Math.max(2, Math.floor(options.settings.conciseMaxRootCauses || 2))
  const getConciseFixedSteps = () => Math.max(3, Math.floor(options.settings.conciseFixedSteps || 3))
  const getPromptPolicyOptions = () => ({
    conciseAnswerMaxChars: getConciseAnswerMaxChars(),
    conciseMaxEvidence: getConciseMaxEvidence(),
    conciseMaxRootCauses: getConciseMaxRootCauses(),
    conciseFixedSteps: getConciseFixedSteps(),
  })

  const shouldUseDiagnosticTemplateForQuestion = (questionText: string): boolean =>
    shouldUseDiagnosticTemplateForQuestionByPolicy(questionText)

  const getFocusTaskRequirementLines = (focusMode: AnalysisFocusMode): string[] =>
    getFocusTaskRequirementLinesByPolicy(focusMode)

  const getFocusFollowupRule = (profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode): string =>
    getFocusFollowupRuleByPolicy(profile, focusMode)

  const buildConciseRetryPrompt = (baseContent: string, profile: AnalysisPromptProfile) =>
    buildConciseRetryPromptByPolicy(baseContent, profile, getPromptPolicyOptions())

  const getSystemPrompt = (profile: AnalysisPromptProfile, focusMode: AnalysisFocusMode = 'general') =>
    getSystemPromptByPolicy(profile, focusMode, getPromptPolicyOptions())

  const buildFullContextPrompt = (compact: boolean, minifiedJson = false, focusMode: AnalysisFocusMode = 'general') => {
    const rawContext = buildAiAnalysisContext({
      tasks: options.tasks.value,
      selectedTask: options.selectedTask.value,
      selectedNode: options.effectiveSelectedNode.value,
      selectedFlowItemId: options.effectiveSelectedFlowItemId.value,
      question: options.question.value,
      loadedTargets: options.loadedTargets.value,
      loadedDefaultTargetId: options.loadedDefaultTargetId.value,
      includeKnowledgePack: options.settings.includeKnowledgePack,
      includeKnowledgeBootstrap: options.settings.knowledgeBootstrap,
      includeSignalLines: options.settings.includeSignalLines,
    })
    const context = compact ? buildCompactContext(rawContext) : rawContext
    const contextText = minifiedJson
      ? JSON.stringify(context)
      : JSON.stringify(context, null, 2)

    return buildFullContextPromptText({
      compact,
      knowledgeBootstrap: options.settings.knowledgeBootstrap,
      question: options.question.value,
      focusTaskRequirementLines: getFocusTaskRequirementLines(focusMode),
      contextText,
    })
  }

  const buildMemoryPrompt = (
    memory: MemoryState,
    profile: AnalysisPromptProfile,
    focusMode: AnalysisFocusMode = 'general'
  ) => {
    return buildMemoryPromptText({
      memory,
      question: options.question.value,
      followupRule: getFocusFollowupRule(profile, focusMode),
    })
  }

  return {
    analysisPromptSoftLimit,
    analysisTimeoutMs,
    shouldUseDiagnosticTemplateForQuestion,
    buildConciseRetryPrompt,
    getSystemPrompt,
    buildFullContextPrompt,
    buildMemoryPrompt,
  }
}
