<script setup lang="ts">
import type { UploadFileInfo } from 'naive-ui'
import {
  NButton,
  NFlex,
  NIcon,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NUpload,
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import type { SelectMixedOption } from 'naive-ui/es/select/src/interface'
import type { StatMode } from '../composables/useNodeStatisticsMetrics'
import type {
  NodeChartDimension,
  RecognitionActionChartDimension,
} from '../composables/useNodeStatisticsChartOptions'

const props = defineProps<{
  isMobile: boolean
  statMode: StatMode
  nodeChartDimension: NodeChartDimension
  recognitionActionChartDimension: RecognitionActionChartDimension
  nodeChartDimensionOptions: SelectMixedOption[]
  recognitionActionChartDimensionOptions: SelectMixedOption[]
  searchKeyword: string
  isInTauri: boolean
  isVscodeLaunchEmbed: boolean
  loading: boolean
  uploadKey: number
  handleNaiveUpload: (options: { file: UploadFileInfo }) => boolean | Promise<boolean>
}>()

const emit = defineEmits<{
  'update:statMode': [value: StatMode]
  'update:nodeChartDimension': [value: NodeChartDimension]
  'update:recognitionActionChartDimension': [value: RecognitionActionChartDimension]
  'update:searchKeyword': [value: string]
  tauriUploadClick: []
}>()
</script>

<template>
  <n-flex class="statistics-controls" align="center" :wrap="true">
    <n-radio-group :value="props.statMode" size="small" @update:value="emit('update:statMode', $event)">
      <n-radio-button value="node">节点统计</n-radio-button>
      <n-radio-button value="recognition-action">识别/动作</n-radio-button>
    </n-radio-group>

    <n-select
      v-if="props.statMode === 'node'"
      :value="props.nodeChartDimension"
      :options="props.nodeChartDimensionOptions"
      size="small"
      :style="props.isMobile ? 'width: 100px' : 'width: 120px'"
      @update:value="emit('update:nodeChartDimension', $event)"
    />

    <n-select
      v-if="props.statMode === 'recognition-action'"
      :value="props.recognitionActionChartDimension"
      :options="props.recognitionActionChartDimensionOptions"
      size="small"
      :style="props.isMobile ? 'width: 120px' : 'width: 140px'"
      @update:value="emit('update:recognitionActionChartDimension', $event)"
    />

    <n-input
      v-if="!props.isMobile"
      :value="props.searchKeyword"
      placeholder="搜索节点名称"
      clearable
      class="statistics-search"
      size="small"
      @update:value="emit('update:searchKeyword', $event)"
    />

    <n-button
      v-if="props.isInTauri && !props.isVscodeLaunchEmbed"
      size="small"
      tertiary
      :circle="props.isMobile"
      :loading="props.loading"
      @click="emit('tauriUploadClick')"
    >
      <template #icon>
        <n-icon>
          <folder-open-outlined />
        </n-icon>
      </template>
      <span v-if="!props.isMobile">打开日志</span>
    </n-button>

    <n-upload
      v-else-if="!props.isVscodeLaunchEmbed"
      :key="props.uploadKey"
      :custom-request="props.handleNaiveUpload"
      :show-file-list="false"
      accept=".log,.txt,.zip"
    >
      <n-button size="small" tertiary :circle="props.isMobile" :loading="props.loading">
        <template #icon>
          <n-icon>
            <cloud-upload-outlined />
          </n-icon>
        </template>
        <span v-if="!props.isMobile">导入日志</span>
      </n-button>
    </n-upload>
  </n-flex>
</template>

<style scoped>
.statistics-controls {
  gap: 10px;
  justify-content: flex-end;
}

.statistics-search {
  width: 220px;
}

@media (max-width: 768px) {
  .statistics-controls {
    width: 100%;
    gap: 8px;
    justify-content: flex-start;
  }
}
</style>
