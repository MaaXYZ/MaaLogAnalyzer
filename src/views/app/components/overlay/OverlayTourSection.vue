<script setup lang="ts">
import TourOverlay from '../../../../components/TourOverlay.vue'
import type { TourStep } from '../../../../tutorial/types'

defineProps<{
  active: boolean
  currentTourStep: TourStep | null
  tourStepIndex: number
  currentTourStepsLength: number
  currentTourSectionTitle: string
  currentTourSectionIndex: number
  currentTourSectionTotal: number
  currentTourSectionStepIndex: number
  currentTourSectionStepTotal: number
  tourTargetRect: {
    top: number
    left: number
    width: number
    height: number
  } | null
  tourTargetFound: boolean
}>()

const emit = defineEmits<{
  'tour-prev': []
  'tour-next': []
  'tour-retry': []
  'tour-finish': []
  'tour-skip': []
}>()
</script>

<template>
  <TourOverlay
    :active="active"
    :step="currentTourStep"
    :step-index="tourStepIndex"
    :total-steps="currentTourStepsLength"
    :section-title="currentTourSectionTitle"
    :section-index="currentTourSectionIndex"
    :section-total="currentTourSectionTotal"
    :section-step-index="currentTourSectionStepIndex"
    :section-step-total="currentTourSectionStepTotal"
    :target-rect="tourTargetRect"
    :target-found="tourTargetFound"
    @prev="emit('tour-prev')"
    @next="emit('tour-next')"
    @retry="emit('tour-retry')"
    @finish="emit('tour-finish')"
    @skip="emit('tour-skip')"
  />
</template>
