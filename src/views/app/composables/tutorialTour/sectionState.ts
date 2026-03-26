import { computed, type Ref } from 'vue'
import type { TourStepLike } from './types'

export const useTourSectionState = <T extends TourStepLike>(
  currentTourSteps: Ref<T[]>,
  currentTourStep: Ref<T | null>,
  tourStepIndex: Ref<number>,
) => {
  const tourSections = computed(() => {
    const sections: { id: string; title: string }[] = []
    for (const step of currentTourSteps.value) {
      if (!sections.some((section) => section.id === step.sectionId)) {
        sections.push({ id: step.sectionId, title: step.sectionTitle })
      }
    }
    return sections
  })

  const currentTourSectionIndex = computed(() => {
    const current = currentTourStep.value
    if (!current) return 0
    const index = tourSections.value.findIndex((section) => section.id === current.sectionId)
    return index >= 0 ? index + 1 : 0
  })

  const currentTourSectionTotal = computed(() => tourSections.value.length)
  const currentTourSectionTitle = computed(() => currentTourStep.value?.sectionTitle ?? '')

  const currentTourSectionStepTotal = computed(() => {
    const current = currentTourStep.value
    if (!current) return 0
    return currentTourSteps.value.filter((step) => step.sectionId === current.sectionId).length
  })

  const currentTourSectionStepIndex = computed(() => {
    const current = currentTourStep.value
    if (!current) return 0
    return currentTourSteps.value
      .slice(0, tourStepIndex.value + 1)
      .filter((step) => step.sectionId === current.sectionId)
      .length
  })

  return {
    tourSections,
    currentTourSectionIndex,
    currentTourSectionTotal,
    currentTourSectionTitle,
    currentTourSectionStepTotal,
    currentTourSectionStepIndex,
  }
}
