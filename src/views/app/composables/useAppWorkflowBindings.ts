import { useMessage } from 'naive-ui'
import type { Ref } from 'vue'
import type { TaskInfo } from '../../../types'
import type { LogParser } from '../../../utils/logParser'
import type { TourStep } from '../../../tutorial/types'
import { useLogLoadingPipeline } from './useLogLoadingPipeline'
import { useTutorialTour } from './useTutorialTour'
import { useTutorialRunner } from './useTutorialRunner'

interface UseAppWorkflowBindingsOptions {
  parser: LogParser
  loading: Ref<boolean>
  showParsingModal: Ref<boolean>
  parseProgress: Ref<number>
  stopRealtimeSession: () => void | Promise<void>
  resetAnalysisState: () => void
  resetParserDebugAssets: () => void
  setDeferredTextSearchTargets: (
    targets: Array<{
      id: string
      label: string
      fileName: string
      loadContent: () => Promise<string>
    }>,
    defaultId?: string,
  ) => void
  pickPreferredLogTargetId: (targets: Array<{ id: string; label: string; fileName: string; content: string }>) => string
  applyParsedTasks: (tasks: TaskInfo[], preserveSelection: boolean) => void
  clearRuntimeFilters: () => void
  steps: TourStep[]
  isMobile: Ref<boolean>
  viewMode: Ref<string>
  showAboutModal: Ref<boolean>
  getTasksLength: () => number
  loadTutorialSampleLog: () => Promise<string>
  tutorialStorageKey: string
  tutorialVersion: number
  tutorialAutoStartEnabled: boolean
}

export const useAppWorkflowBindings = (options: UseAppWorkflowBindingsOptions) => {
  const message = useMessage()

  const {
    processLogContent,
    handleFileUpload,
    handleContentUpload,
  } = useLogLoadingPipeline({
    parser: options.parser,
    loading: options.loading,
    showParsingModal: options.showParsingModal,
    parseProgress: options.parseProgress,
    stopRealtimeSession: options.stopRealtimeSession,
    resetAnalysisState: options.resetAnalysisState,
    resetParserDebugAssets: options.resetParserDebugAssets,
    setDeferredTextSearchTargets: options.setDeferredTextSearchTargets,
    pickPreferredLogTargetId: options.pickPreferredLogTargetId,
    applyParsedTasks: options.applyParsedTasks,
    clearRuntimeFilters: options.clearRuntimeFilters,
    onWarning: (text) => message.warning(text, { duration: 5000 }),
    onError: (text) => message.error(text, { duration: 5000 }),
  })

  const tutorialTour = useTutorialTour({
    steps: options.steps,
    isMobile: options.isMobile,
    viewMode: options.viewMode,
    showAboutModal: options.showAboutModal,
  })

  const tutorialRunner = useTutorialRunner({
    loading: options.loading,
    showAboutModal: options.showAboutModal,
    processLogContent,
    getTasksLength: options.getTasksLength,
    activateTour: tutorialTour.activateTour,
    stopTour: tutorialTour.stopTour,
    currentTourStepIds: () => tutorialTour.currentTourSteps.value.map(step => step.id),
    tutorialSteps: options.steps,
    loadTutorialSampleLog: options.loadTutorialSampleLog,
    tutorialStorageKey: options.tutorialStorageKey,
    tutorialVersion: options.tutorialVersion,
    tutorialAutoStartEnabled: options.tutorialAutoStartEnabled,
    onError: (text) => message.error(text, { duration: 5000 }),
  })

  return {
    handleFileUpload,
    handleContentUpload,
    ...tutorialTour,
    tutorialLoadingSample: tutorialRunner.tutorialLoadingSample,
    openTutorialFromAbout: tutorialRunner.openTutorialFromAbout,
    handleTourFinish: tutorialRunner.handleTourFinish,
    handleTourSkip: tutorialRunner.handleTourSkip,
    tryAutoStartTour: tutorialRunner.tryAutoStartTour,
  }
}
