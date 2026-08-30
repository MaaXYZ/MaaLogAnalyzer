<script setup lang="ts">
import { computed } from 'vue'
import type { UploadFileInfo, DataTableColumns } from 'naive-ui'
import {
  NCard,
  NDataTable,
  NEmpty,
  NText,
} from 'naive-ui'
import NodeStatisticsEmptyState from './NodeStatisticsEmptyState.vue'

const props = defineProps<{
  columns: DataTableColumns<any>
  statistics: any[]
  panelTitle: string
  effectiveTasksLength: number
  isInTauri: boolean
  isVscodeLaunchEmbed: boolean
  loading: boolean
  uploadKey: number
  handleNaiveUpload: (options: { file: UploadFileInfo }) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  tauriUploadClick: []
}>()

// 让表格按列宽总宽度开启横向滚动，避免右侧列溢出卡片/面板边界。
const tableScrollX = computed(() => {
  const total = props.columns.reduce((sum, column) => {
    const width = typeof column.width === 'number' ? column.width : 0
    return sum + width
  }, 0)
  return total > 0 ? total : undefined
})
</script>

<template>
  <n-card
    class="statistics-data-card"
    size="small"
    :bordered="false"
    content-style="padding: 0 0 8px 0; flex: 1; min-height: 0; display: flex; flex-direction: column"
  >
    <template #header>
      <div class="data-panel-header">
        <div class="data-panel-title">{{ props.panelTitle }}</div>
        <n-text depth="3" class="data-panel-meta">
          {{ props.statistics.length > 0 ? `共 ${props.statistics.length} 项` : '按当前筛选展示结果' }}
        </n-text>
      </div>
    </template>

    <div class="data-panel-body" data-tour="statistics-table">
      <n-data-table
        v-if="props.statistics.length > 0"
        :columns="props.columns"
        :data="props.statistics"
        :scroll-x="tableScrollX"
        :bordered="false"
        :single-line="false"
        size="small"
        striped
      />

      <node-statistics-empty-state
        v-else-if="props.effectiveTasksLength === 0"
        :is-in-tauri="props.isInTauri"
        :is-vscode-launch-embed="props.isVscodeLaunchEmbed"
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
  </n-card>
</template>

<style scoped>
.statistics-data-card {
  width: 100%;
  min-height: 0;
}

.data-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}

.data-panel-title {
  font-size: 16px;
  font-weight: 700;
}

.data-panel-meta {
  font-size: 12px;
}

.data-panel-body {
  flex: 1;
  min-height: 0;
  overflow: visible;
}
</style>
