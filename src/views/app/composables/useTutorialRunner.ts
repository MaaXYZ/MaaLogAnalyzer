import { nextTick, ref, type Ref } from 'vue'
import { getErrorMessage } from '../../../utils/errorHandler'
import {
  getPendingTourStepIndexes,
  isTutorialVersionCompleted,
  markCurrentTutorialVersionCompleted,
} from '../utils/tutorialProgress'

interface TutorialStepLike {
  id: string
}

interface UseTutorialRunnerOptions {
  loading: Ref<boolean>
  showAboutModal: Ref<boolean>
  processLogContent: (content: string) => Promise<void>
  getTasksLength: () => number
  activateTour: (indexes: number[]) => Promise<void>
  stopTour: () => void
  currentTourStepIds: () => string[]
  tutorialSteps: TutorialStepLike[]
  tutorialSampleLog: string
  tutorialStorageKey: string
  tutorialVersion: number
  tutorialAutoStartEnabled: boolean
  onError: (message: string) => void
}

export const useTutorialRunner = (options: UseTutorialRunnerOptions) => {
  const tutorialLoadingSample = ref(false)
  const tutorialAutoStarted = ref(false)

  const hasCompletedCurrentTutorialVersion = (): boolean => {
    return isTutorialVersionCompleted(options.tutorialStorageKey, options.tutorialVersion)
  }

  const markCurrentTutorialVersionDone = (stepIds: string[]) => {
    markCurrentTutorialVersionCompleted(options.tutorialStorageKey, options.tutorialVersion, stepIds)
  }

  const getPendingStepIndexes = (): number[] => {
    return getPendingTourStepIndexes(options.tutorialStorageKey, options.tutorialVersion, options.tutorialSteps)
  }

  const startTour = async (auto = false) => {
    if (tutorialLoadingSample.value || options.loading.value) return
    tutorialLoadingSample.value = true
    options.loading.value = true

    try {
      await options.processLogContent(options.tutorialSampleLog)
      if (options.getTasksLength() === 0) {
        options.onError('Built-in sample failed to load: no tasks parsed.')
        return
      }

      const indexes = auto
        ? getPendingStepIndexes()
        : options.tutorialSteps.map((_, idx) => idx)

      if (indexes.length === 0) {
        return
      }

      await options.activateTour(indexes)
    } catch (error) {
      options.onError(getErrorMessage(error))
    } finally {
      options.loading.value = false
      tutorialLoadingSample.value = false
    }
  }

  const openTutorialFromAbout = () => {
    options.showAboutModal.value = false
    void nextTick().then(() => startTour(false))
  }

  const handleTourFinish = () => {
    markCurrentTutorialVersionDone(options.currentTourStepIds())
    options.stopTour()
  }

  const handleTourSkip = () => {
    markCurrentTutorialVersionDone(options.currentTourStepIds())
    options.stopTour()
  }

  const tryAutoStartTour = () => {
    if (!options.tutorialAutoStartEnabled) return
    if (tutorialAutoStarted.value) return
    if (hasCompletedCurrentTutorialVersion()) return
    tutorialAutoStarted.value = true
    void startTour(true)
  }

  return {
    tutorialLoadingSample,
    startTour,
    openTutorialFromAbout,
    handleTourFinish,
    handleTourSkip,
    tryAutoStartTour,
  }
}
