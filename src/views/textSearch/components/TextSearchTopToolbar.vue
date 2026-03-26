<script setup lang="ts">
import { ref } from 'vue'
import { NCard } from 'naive-ui'
import TextSearchTopToolbarMobile from './TextSearchTopToolbarMobile.vue'
import TextSearchTopToolbarDesktop from './TextSearchTopToolbarDesktop.vue'
import type { SourceMode } from './types'

const props = defineProps<{
  isMobile: boolean
  isLoadingFile: boolean
  fileName: string
  totalLines: number
  fileSizeInMB: number
  isLargeFile: boolean
  sourceMode: SourceMode
  sourceModeOptions: Array<{ label: string; value: string }>
  selectedLoadedTargetId: string
  loadedTargetOptions: Array<{ label: string; value: string }>
  caseSensitive: boolean
  useRegex: boolean
  hideDebugInfo: boolean
  quickSearchOptions: string[]
  searchText: string
  searchHistory: string[]
  mobileControlExpandedNames: Array<string | number>
}>()

const emit = defineEmits<{
  'file-upload': [event: Event]
  'clear-content': []
  'update:sourceMode': [value: SourceMode]
  'update:selectedLoadedTargetId': [value: string]
  'update:caseSensitive': [value: boolean]
  'update:useRegex': [value: boolean]
  'update:hideDebugInfo': [value: boolean]
  'update:mobileControlExpandedNames': [value: Array<string | number>]
  'use-history-item': [value: string]
  'remove-history-item': [value: string]
}>()

const fileInputRef = ref<HTMLInputElement | null>(null)

const handleSelectFile = () => {
  emit('update:sourceMode', 'manual')
  fileInputRef.value?.click()
}

const handleFileUpload = (event: Event) => {
  emit('file-upload', event)
}

const resetFileInput = () => {
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
  }
}

defineExpose({
  resetFileInput,
})
</script>

<template>
  <n-card
    size="small"
    data-tour="textsearch-toolbar"
    :bordered="false"
    content-style="padding: 12px 16px"
  >
    <input
      id="text-search-file-input"
      ref="fileInputRef"
      type="file"
      accept=".txt,.log"
      @change="handleFileUpload"
      style="display: none"
    />

    <text-search-top-toolbar-mobile
      v-if="props.isMobile"
      :is-loading-file="props.isLoadingFile"
      :file-name="props.fileName"
      :total-lines="props.totalLines"
      :file-size-in-m-b="props.fileSizeInMB"
      :is-large-file="props.isLargeFile"
      :source-mode="props.sourceMode"
      :source-mode-options="props.sourceModeOptions"
      :selected-loaded-target-id="props.selectedLoadedTargetId"
      :loaded-target-options="props.loadedTargetOptions"
      :case-sensitive="props.caseSensitive"
      :use-regex="props.useRegex"
      :hide-debug-info="props.hideDebugInfo"
      :quick-search-options="props.quickSearchOptions"
      :search-text="props.searchText"
      :search-history="props.searchHistory"
      :mobile-control-expanded-names="props.mobileControlExpandedNames"
      @select-file="handleSelectFile"
      @clear-content="emit('clear-content')"
      @update:source-mode="emit('update:sourceMode', $event)"
      @update:selected-loaded-target-id="emit('update:selectedLoadedTargetId', $event)"
      @update:case-sensitive="emit('update:caseSensitive', $event)"
      @update:use-regex="emit('update:useRegex', $event)"
      @update:hide-debug-info="emit('update:hideDebugInfo', $event)"
      @update:mobile-control-expanded-names="emit('update:mobileControlExpandedNames', $event)"
      @use-history-item="emit('use-history-item', $event)"
      @remove-history-item="emit('remove-history-item', $event)"
    />

    <text-search-top-toolbar-desktop
      v-else
      :is-loading-file="props.isLoadingFile"
      :file-name="props.fileName"
      :total-lines="props.totalLines"
      :file-size-in-m-b="props.fileSizeInMB"
      :is-large-file="props.isLargeFile"
      :source-mode="props.sourceMode"
      :source-mode-options="props.sourceModeOptions"
      :selected-loaded-target-id="props.selectedLoadedTargetId"
      :loaded-target-options="props.loadedTargetOptions"
      @select-file="handleSelectFile"
      @clear-content="emit('clear-content')"
      @update:source-mode="emit('update:sourceMode', $event)"
      @update:selected-loaded-target-id="emit('update:selectedLoadedTargetId', $event)"
    />
  </n-card>
</template>
