<script setup lang="ts">
import AboutModal from '../../modals/AboutModal.vue'
import FileLoadingModal from '../../modals/FileLoadingModal.vue'
import ParsingProgressModal from '../../modals/ParsingProgressModal.vue'

defineProps<{
  showAboutModal: boolean
  showFileLoadingModal: boolean
  showParsingModal: boolean
  modalWidth: string
  modalWidthSmall: string
  parseProgress: number
  isVscodeLaunchEmbed: boolean
  appEmbedMode: string
  bridgeEnabled: boolean
  tutorialLoadingSample: boolean
  version: string
}>()

const emit = defineEmits<{
  'update:show-about': [value: boolean]
  'update:show-file-loading': [value: boolean]
  'update:show-parsing': [value: boolean]
  'start-tutorial': []
}>()

const handleAboutModalUpdate = (value: boolean) => {
  emit('update:show-about', value)
}

const handleFileLoadingModalUpdate = (value: boolean) => {
  emit('update:show-file-loading', value)
}

const handleParsingModalUpdate = (value: boolean) => {
  emit('update:show-parsing', value)
}
</script>

<template>
  <about-modal
    :show="showAboutModal"
    @update:show="handleAboutModalUpdate"
    :width="modalWidth"
    :is-vscode-launch-embed="isVscodeLaunchEmbed"
    :app-embed-mode="appEmbedMode"
    :bridge-enabled="bridgeEnabled"
    :tutorial-loading="tutorialLoadingSample"
    :version="version"
    @start-tutorial="emit('start-tutorial')"
  />

  <file-loading-modal
    :show="showFileLoadingModal"
    @update:show="handleFileLoadingModalUpdate"
    :width="modalWidthSmall"
  />

  <parsing-progress-modal
    :show="showParsingModal"
    @update:show="handleParsingModalUpdate"
    :width="modalWidthSmall"
    :progress="parseProgress"
  />
</template>
