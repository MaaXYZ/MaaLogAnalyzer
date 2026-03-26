<script setup lang="ts">
import {
  NCard,
  NFlex,
  NInput,
  NText,
} from 'naive-ui'
import { formatDuration } from '../../../utils/formatDuration'
import type {
  NodeStatisticsSummary,
  RecognitionActionStatisticsSummary,
  StatMode,
} from '../composables/useNodeStatisticsMetrics'

const props = defineProps<{
  statMode: StatMode
  isMobile: boolean
  searchKeyword: string
  nodeSummary: NodeStatisticsSummary | null
  recognitionActionSummary: RecognitionActionStatisticsSummary | null
}>()

const emit = defineEmits<{
  'update:searchKeyword': [value: string]
}>()
</script>

<template>
  <n-card
    v-if="props.statMode === 'node' && props.nodeSummary"
    size="small"
    style="margin-bottom: 16px"
    :bordered="false"
  >
    <n-input
      v-if="props.isMobile"
      :value="props.searchKeyword"
      placeholder="搜索节点名称"
      clearable
      size="small"
      style="margin-bottom: 12px"
      @update:value="emit('update:searchKeyword', $event)"
    />
    <n-flex :justify="props.isMobile ? 'start' : 'space-around'" align="center" :wrap="true" :style="props.isMobile ? 'gap: 16px' : ''">
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">节点类型</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ props.nodeSummary.uniqueNodes }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">总执行次数</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ props.nodeSummary.totalNodes }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">平均耗时</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ formatDuration(props.nodeSummary.avgDuration) }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">总耗时</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ formatDuration(props.nodeSummary.totalDuration) }}
        </n-text>
      </div>
      <div v-if="!props.isMobile" style="text-align: center; max-width: 200px">
        <n-text depth="3" style="font-size: 12px">最慢节点</n-text>
        <n-text
          strong
          style="display: block; font-size: 14px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
          :title="props.nodeSummary.slowestNode.name"
        >
          {{ props.nodeSummary.slowestNode.name }}
        </n-text>
        <n-text depth="3" style="font-size: 12px">
          {{ formatDuration(props.nodeSummary.slowestNode.avgDuration) }}
        </n-text>
      </div>
    </n-flex>
  </n-card>

  <n-card
    v-if="props.statMode === 'recognition-action' && props.recognitionActionSummary"
    size="small"
    style="margin-bottom: 16px"
    :bordered="false"
  >
    <n-input
      v-if="props.isMobile"
      :value="props.searchKeyword"
      placeholder="搜索节点名称"
      clearable
      size="small"
      style="margin-bottom: 12px"
      @update:value="emit('update:searchKeyword', $event)"
    />
    <n-flex :justify="props.isMobile ? 'start' : 'space-around'" align="center" :wrap="true" :style="props.isMobile ? 'gap: 16px' : ''">
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">节点类型</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ props.recognitionActionSummary.uniqueNodes }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">总执行次数</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ props.recognitionActionSummary.totalNodes }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">平均识别尝试</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ props.recognitionActionSummary.avgRecognitionAttempts.toFixed(1) }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">平均识别耗时</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ formatDuration(props.recognitionActionSummary.avgRecognitionDuration) }}
        </n-text>
      </div>
      <div style="text-align: center">
        <n-text depth="3" style="font-size: 12px">平均动作耗时</n-text>
        <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
          {{ formatDuration(props.recognitionActionSummary.avgActionDuration) }}
        </n-text>
      </div>
      <div v-if="!props.isMobile" style="text-align: center; max-width: 200px">
        <n-text depth="3" style="font-size: 12px">最慢动作节点</n-text>
        <n-text
          strong
          style="display: block; font-size: 14px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
          :title="props.recognitionActionSummary.slowestActionNode.name"
        >
          {{ props.recognitionActionSummary.slowestActionNode.name }}
        </n-text>
        <n-text depth="3" style="font-size: 12px">
          {{ formatDuration(props.recognitionActionSummary.slowestActionNode.avgActionDuration) }}
        </n-text>
      </div>
    </n-flex>
  </n-card>
</template>
