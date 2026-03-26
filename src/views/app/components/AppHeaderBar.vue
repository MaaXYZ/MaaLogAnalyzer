<script setup lang="ts">
import { NCard } from 'naive-ui'
import AppHeaderMobile from './header/AppHeaderMobile.vue'
import AppHeaderDesktop from './header/AppHeaderDesktop.vue'

defineProps<{
  isMobile: boolean
  currentViewLabel: string
  viewMode: string
  viewModeOptions: Array<Record<string, unknown>>
  mobileMenuOptions: Array<Record<string, unknown>>
  showProcessThreadFilters: boolean
  selectedProcessId: string
  selectedThreadId: string
  processIdOptions: Array<Record<string, unknown>>
  threadIdOptions: Array<Record<string, unknown>>
  isVscodeLaunchEmbed: boolean
  isDark: boolean
}>()

const emit = defineEmits<{
  'open-task-drawer': []
  'select-mobile-menu': [key: string]
  'select-view-mode': [key: string]
  'update:selected-process-id': [value: string]
  'update:selected-thread-id': [value: string]
  'clear-filters': []
  'open-settings': []
  'open-about': []
  'toggle-theme': []
}>()

</script>

<template>
  <n-card
    size="small"
    :bordered="false"
    content-style="padding: 8px 16px"
  >
    <app-header-mobile
      v-if="isMobile"
      :current-view-label="currentViewLabel"
      :mobile-menu-options="mobileMenuOptions"
      @open-task-drawer="emit('open-task-drawer')"
      @select-mobile-menu="emit('select-mobile-menu', $event)"
    />

    <app-header-desktop
      v-else
      :current-view-label="currentViewLabel"
      :view-mode="viewMode"
      :view-mode-options="viewModeOptions"
      :show-process-thread-filters="showProcessThreadFilters"
      :selected-process-id="selectedProcessId"
      :selected-thread-id="selectedThreadId"
      :process-id-options="processIdOptions"
      :thread-id-options="threadIdOptions"
      :is-vscode-launch-embed="isVscodeLaunchEmbed"
      :is-dark="isDark"
      @select-view-mode="emit('select-view-mode', $event)"
      @update:selected-process-id="emit('update:selected-process-id', $event)"
      @update:selected-thread-id="emit('update:selected-thread-id', $event)"
      @clear-filters="emit('clear-filters')"
      @open-settings="emit('open-settings')"
      @open-about="emit('open-about')"
      @toggle-theme="emit('toggle-theme')"
    />
  </n-card>
</template>
