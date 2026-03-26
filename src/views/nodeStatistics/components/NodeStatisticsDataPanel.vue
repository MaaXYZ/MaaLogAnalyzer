<script setup lang="ts">
import type { UploadFileInfo, DataTableColumns } from 'naive-ui'
import {
  NDataTable,
  NEmpty,
} from 'naive-ui'
import NodeStatisticsEmptyState from './NodeStatisticsEmptyState.vue'

const props = defineProps<{
  columns: DataTableColumns<any>
  statistics: any[]
  effectiveTasksLength: number
  isInTauri: boolean
  loading: boolean
  uploadKey: number
  handleNaiveUpload: (options: { file: UploadFileInfo }) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  tauriUploadClick: []
}>()
</script>

<template>
  <div style="flex: 1; min-height: 0; overflow: hidden" data-tour="statistics-table">
    <n-data-table
      v-if="props.statistics.length > 0"
      :columns="props.columns"
      :data="props.statistics"
      :bordered="false"
      :single-line="false"
      size="small"
      style="height: 100%"
      flex-height
      virtual-scroll
      striped
    />

    <node-statistics-empty-state
      v-else-if="props.effectiveTasksLength === 0"
      :is-in-tauri="props.isInTauri"
      :loading="props.loading"
      :upload-key="props.uploadKey"
      :handle-naive-upload="props.handleNaiveUpload"
      @tauri-upload-click="emit('tauriUploadClick')"
    />

    <n-empty
      v-else
      description="暂无数据"
      style="margin-top: 60px"
    />
  </div>
</template>
