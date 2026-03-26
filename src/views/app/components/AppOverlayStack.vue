<script setup lang="ts">
import type { TourStep } from '../../../tutorial/types'
import OverlaySettingsSection from './overlay/OverlaySettingsSection.vue'
import OverlayTourSection from './overlay/OverlayTourSection.vue'
import OverlayAuxModalsSection from './overlay/OverlayAuxModalsSection.vue'

defineProps<{
  showSettingsModal: boolean
  showAboutModal: boolean
  showFileLoadingModal: boolean
  showParsingModal: boolean
  modalWidth: string
  modalWidthSmall: string
  parseProgress: number
  tourActive: boolean
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
  isVscodeLaunchEmbed: boolean
  appEmbedMode: string
  bridgeEnabled: boolean
  tutorialLoadingSample: boolean
  version: string
}>()

const emit = defineEmits<{
  'update:showSettingsModal': [value: boolean]
  'update:showAboutModal': [value: boolean]
  'update:showFileLoadingModal': [value: boolean]
  'update:showParsingModal': [value: boolean]
  'tour-prev': []
  'tour-next': []
  'tour-retry': []
  'tour-finish': []
  'tour-skip': []
  'start-tutorial': []
}>()
</script>

<template>
  <overlay-settings-section
    :show="showSettingsModal"
    :width="modalWidth"
    @update:show="emit('update:showSettingsModal', $event)"
  />

  <overlay-tour-section
    :active="tourActive"
    :current-tour-step="currentTourStep"
    :tour-step-index="tourStepIndex"
    :current-tour-steps-length="currentTourStepsLength"
    :current-tour-section-title="currentTourSectionTitle"
    :current-tour-section-index="currentTourSectionIndex"
    :current-tour-section-total="currentTourSectionTotal"
    :current-tour-section-step-index="currentTourSectionStepIndex"
    :current-tour-section-step-total="currentTourSectionStepTotal"
    :tour-target-rect="tourTargetRect"
    :tour-target-found="tourTargetFound"
    @tour-prev="emit('tour-prev')"
    @tour-next="emit('tour-next')"
    @tour-retry="emit('tour-retry')"
    @tour-finish="emit('tour-finish')"
    @tour-skip="emit('tour-skip')"
  />

  <overlay-aux-modals-section
    :show-about-modal="showAboutModal"
    :show-file-loading-modal="showFileLoadingModal"
    :show-parsing-modal="showParsingModal"
    :modal-width="modalWidth"
    :modal-width-small="modalWidthSmall"
    :parse-progress="parseProgress"
    :is-vscode-launch-embed="isVscodeLaunchEmbed"
    :app-embed-mode="appEmbedMode"
    :bridge-enabled="bridgeEnabled"
    :tutorial-loading-sample="tutorialLoadingSample"
    :version="version"
    @update:show-about="emit('update:showAboutModal', $event)"
    @update:show-file-loading="emit('update:showFileLoadingModal', $event)"
    @update:show-parsing="emit('update:showParsingModal', $event)"
    @start-tutorial="emit('start-tutorial')"
  />
</template>
