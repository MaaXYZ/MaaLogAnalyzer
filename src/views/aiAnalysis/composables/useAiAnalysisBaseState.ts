import { ref } from 'vue'
import { getAiSettings, getSessionApiKey } from '../../../utils/aiSettings'
import type { AnalysisFocusMode } from '../types'
import { useStreamingRenderText } from './useStreamingRenderText'

export const useAiAnalysisBaseState = () => {
  const settings = getAiSettings()
  const apiKey = ref(getSessionApiKey())
  const question = ref('请分析当前任务中最可能的失败原因，并给出可执行的排查步骤。')
  const analyzing = ref(false)
  const analyzingStage = ref<'idle' | 'streaming' | 'postprocess'>('idle')
  const testing = ref(false)
  const resultText = ref('')
  const usageText = ref('')
  const evidencePanelCollapsed = ref(true)
  const activeRoundQuestion = ref('')
  const showApiKeyHint = ref(false)
  const globalSettingsCollapsed = ref(true)
  const memoryDialogVisible = ref(false)
  const quickPromptProfileOverride = ref<'diagnostic' | 'followup' | null>(null)
  const quickPromptFocusOverride = ref<AnalysisFocusMode | null>(null)

  const {
    streamingRenderText,
    pendingStreamFullText,
    clearStreamFlushTimer,
    flushStreamingText,
  } = useStreamingRenderText(120)

  return {
    settings,
    apiKey,
    question,
    analyzing,
    analyzingStage,
    testing,
    resultText,
    usageText,
    evidencePanelCollapsed,
    activeRoundQuestion,
    showApiKeyHint,
    globalSettingsCollapsed,
    memoryDialogVisible,
    quickPromptProfileOverride,
    quickPromptFocusOverride,
    streamingRenderText,
    pendingStreamFullText,
    clearStreamFlushTimer,
    flushStreamingText,
  }
}
