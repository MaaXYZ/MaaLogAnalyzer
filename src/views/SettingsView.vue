<script setup lang="ts">
import { toRef } from 'vue'
import { NCard, NButton, NFlex } from 'naive-ui'
import { useSettingsState } from './settings/composables/useSettingsState'
import LogAnalysisSettingsCard from './settings/components/LogAnalysisSettingsCard.vue'
import FlowchartSettingsCard from './settings/components/FlowchartSettingsCard.vue'

const props = defineProps<{
  show?: boolean
}>()

const { settings, playbackSpeedOptions, focusZoomOptions, handleSave, handleReset } =
  useSettingsState(toRef(props, 'show'))
</script>

<template>
  <n-card class="settings-root-card" :bordered="false" style="height: 100%">
    <log-analysis-settings-card :settings="settings" />
    <flowchart-settings-card
      :settings="settings"
      :playback-speed-options="playbackSpeedOptions"
      :focus-zoom-options="focusZoomOptions"
    />

    <n-flex style="margin-top: 24px; gap: 12px">
      <n-button type="primary" @click="handleSave">保存设置</n-button>
      <n-button @click="handleReset">恢复默认</n-button>
    </n-flex>
  </n-card>
</template>

<style scoped>
:deep(.settings-root-card.n-card) {
  background-color: transparent !important;
  border-color: transparent !important;
  box-shadow: none !important;
}
</style>
