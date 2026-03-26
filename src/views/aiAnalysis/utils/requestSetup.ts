import type { AnalysisFocusMode, AnalysisPromptProfile, MemoryState } from '../types'
import type { AiRequestMode } from './requestFlow'

export interface AnalyzeRuntimeState {
  contextKey: string
  contextMemory: MemoryState | null
  useMemoryForThisRound: boolean
}

interface ResolvePromptDecisionOptions {
  mode: AiRequestMode
  useMemoryForThisRound: boolean
  questionSnapshot: string
  forcedProfile: AnalysisPromptProfile | null
  forcedFocus: AnalysisFocusMode | null
  shouldUseDiagnosticTemplateForQuestion: (questionText: string) => boolean
}

export const resolvePromptDecision = (
  options: ResolvePromptDecisionOptions,
): {
  focusMode: AnalysisFocusMode
  promptProfile: AnalysisPromptProfile
} => {
  const focusMode: AnalysisFocusMode = options.forcedFocus ?? 'general'
  const promptProfile: AnalysisPromptProfile = options.mode !== 'analyze'
    ? 'diagnostic'
    : (options.forcedProfile ?? (options.useMemoryForThisRound && !options.shouldUseDiagnosticTemplateForQuestion(options.questionSnapshot) ? 'followup' : 'diagnostic'))
  return {
    focusMode,
    promptProfile,
  }
}

interface PrepareAnalyzeRuntimeOptions {
  mode: AiRequestMode
  initial: AnalyzeRuntimeState
  includeSignalLines: boolean
  loadedTargetsLength: number
  hasDeferredLoadedTargets?: boolean
  ensureLoadedTargets?: (() => Promise<void>) | null
  onAnalyzeStart: () => void
  onLoadingDeferredTargets: () => void
  onProcessing: () => void
  waitForUiPaint: () => Promise<void>
  refreshRuntimeState: () => AnalyzeRuntimeState
}

export const prepareAnalyzeRuntimeState = async (
  options: PrepareAnalyzeRuntimeOptions,
): Promise<AnalyzeRuntimeState> => {
  if (options.mode !== 'analyze') return options.initial

  options.onAnalyzeStart()

  const shouldLoadSignalLineTargets = !options.initial.useMemoryForThisRound
    && options.includeSignalLines
    && options.loadedTargetsLength === 0
    && options.hasDeferredLoadedTargets === true
    && typeof options.ensureLoadedTargets === 'function'

  if (!shouldLoadSignalLineTargets) return options.initial

  const ensureLoadedTargets = options.ensureLoadedTargets
  if (!ensureLoadedTargets) return options.initial

  options.onLoadingDeferredTargets()
  await ensureLoadedTargets()
  await options.waitForUiPaint()
  const refreshed = options.refreshRuntimeState()
  options.onProcessing()
  return refreshed
}
