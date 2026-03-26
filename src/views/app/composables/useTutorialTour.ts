import { computed, nextTick, ref } from 'vue'
import { useTourSectionState } from './tutorialTour/sectionState'
import { getTourTargetSelector, updateTourRectFromElement, waitForElement } from './tutorialTour/targetHelpers'
import type { TourRect, TourStepLike, UseTutorialTourOptions } from './tutorialTour/types'

export const useTutorialTour = <T extends TourStepLike>(options: Omit<UseTutorialTourOptions, 'steps'> & { steps: T[] }) => {
  const tourActive = ref(false)
  const activeTourStepIndexes = ref<number[]>([])
  const tourStepIndex = ref(0)
  const tourTargetFound = ref(false)
  const tourTargetElement = ref<HTMLElement | null>(null)
  const tourTargetRect = ref<TourRect | null>(null)
  const tourResolveRunId = ref(0)

  const currentTourSteps = computed(() => activeTourStepIndexes.value.map(i => options.steps[i]).filter(Boolean) as T[])
  const currentTourStep = computed<T | null>(() => currentTourSteps.value[tourStepIndex.value] ?? null)

  const {
    currentTourSectionIndex,
    currentTourSectionTotal,
    currentTourSectionTitle,
    currentTourSectionStepTotal,
    currentTourSectionStepIndex,
  } = useTourSectionState(currentTourSteps, currentTourStep, tourStepIndex)

  const stopTour = () => {
    tourActive.value = false
    tourTargetFound.value = false
    tourTargetElement.value = null
    tourTargetRect.value = null
    activeTourStepIndexes.value = []
    tourStepIndex.value = 0
  }

  const resolveCurrentTourTarget = async () => {
    const step = currentTourStep.value
    if (!tourActive.value || !step) return

    const runId = ++tourResolveRunId.value
    const targetSelector = getTourTargetSelector(step, options.isMobile.value)
    const needsAboutModal = step.id === 'tutorial-replay-entry' || targetSelector.includes('about-start-tutorial')

    if (step.view && options.viewMode.value !== step.view) {
      options.viewMode.value = step.view
    }

    if (needsAboutModal && !options.showAboutModal.value) {
      options.showAboutModal.value = true
    } else if (!needsAboutModal && options.showAboutModal.value) {
      options.showAboutModal.value = false
    }

    await nextTick()
    await new Promise(resolve => setTimeout(resolve, needsAboutModal ? 180 : 80))

    const timeout = step.optional ? 1500 : 5000
    const el = await waitForElement(targetSelector, timeout)

    if (runId !== tourResolveRunId.value || !tourActive.value) {
      return
    }

    if (!el) {
      tourTargetFound.value = false
      tourTargetElement.value = null
      tourTargetRect.value = null
      return
    }

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    await new Promise(resolve => setTimeout(resolve, 140))

    if (runId !== tourResolveRunId.value || !tourActive.value) {
      return
    }

    tourTargetElement.value = el
    tourTargetFound.value = true
    tourTargetRect.value = updateTourRectFromElement(el, currentTourStep.value)
  }

  const handleTourViewportChange = () => {
    if (!tourActive.value) return
    if (!tourTargetElement.value) return
    tourTargetRect.value = updateTourRectFromElement(tourTargetElement.value, currentTourStep.value)
  }

  const activateTour = async (indexes: number[]) => {
    activeTourStepIndexes.value = indexes
    tourStepIndex.value = 0
    tourActive.value = true
    await resolveCurrentTourTarget()
  }

  const handleTourPrev = async () => {
    if (tourStepIndex.value <= 0) return
    tourStepIndex.value -= 1
    await resolveCurrentTourTarget()
  }

  const handleTourNext = async () => {
    if (tourStepIndex.value >= currentTourSteps.value.length - 1) return
    tourStepIndex.value += 1
    await resolveCurrentTourTarget()
  }

  const handleTourRetry = async () => {
    await resolveCurrentTourTarget()
  }

  return {
    tourActive,
    activeTourStepIndexes,
    tourStepIndex,
    tourTargetFound,
    tourTargetRect,
    currentTourSteps,
    currentTourStep,
    currentTourSectionIndex,
    currentTourSectionTotal,
    currentTourSectionTitle,
    currentTourSectionStepIndex,
    currentTourSectionStepTotal,
    stopTour,
    resolveCurrentTourTarget,
    handleTourViewportChange,
    activateTour,
    handleTourPrev,
    handleTourNext,
    handleTourRetry,
  }
}
