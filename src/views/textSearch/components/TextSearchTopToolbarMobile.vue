<script setup lang="ts">
import {
  NButton,
  NCheckbox,
  NCollapse,
  NCollapseItem,
  NFlex,
  NIcon,
  NSelect,
  NTag,
  NText,
} from 'naive-ui'
import { FileTextOutlined, CloseOutlined } from '@vicons/antd'
import type { SourceMode } from './types'

const props = defineProps<{
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
  'select-file': []
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
</script>

<template>
  <n-flex vertical style="gap: 8px">
    <n-flex align="center" justify="space-between">
      <n-text strong style="font-size: 16px">文本搜索</n-text>
    </n-flex>
    <n-collapse
      :expanded-names="props.mobileControlExpandedNames"
      @update:expanded-names="emit('update:mobileControlExpandedNames', $event)"
    >
      <n-collapse-item title="已加载目标 / 选择文件 / 搜索选项" name="mobile-controls">
        <n-flex vertical style="gap: 8px">
          <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
            <n-button size="small" type="primary" @click="emit('select-file')">
              <template #icon><file-text-outlined /></template>
              选择其它文件
            </n-button>
            <n-button v-if="props.fileName" size="small" @click="emit('clear-content')" secondary type="warning">
              <template #icon><n-icon><close-outlined /></n-icon></template>
            </n-button>
          </n-flex>
          <n-select
            :value="props.sourceMode"
            :options="props.sourceModeOptions"
            size="small"
            @update:value="emit('update:sourceMode', $event)"
          />
          <n-select
            v-if="props.sourceMode === 'loaded'"
            :value="props.selectedLoadedTargetId"
            :options="props.loadedTargetOptions"
            placeholder="选择已加载目标"
            size="small"
            :disabled="props.loadedTargetOptions.length === 0"
            @update:value="emit('update:selectedLoadedTargetId', $event)"
          />
          <n-flex align="center" style="gap: 8px; flex-wrap: wrap">
            <n-checkbox :checked="props.caseSensitive" size="small" @update:checked="emit('update:caseSensitive', $event)">区分大小写</n-checkbox>
            <n-checkbox :checked="props.useRegex" size="small" @update:checked="emit('update:useRegex', $event)">正则</n-checkbox>
            <n-checkbox :checked="props.hideDebugInfo" size="small" @update:checked="emit('update:hideDebugInfo', $event)">隐藏调试</n-checkbox>
          </n-flex>
          <n-flex wrap style="gap: 6px">
            <n-button
              v-for="option in props.quickSearchOptions"
              :key="`m-quick-${option}`"
              size="tiny"
              secondary
              @click="emit('use-history-item', option)"
              :type="props.searchText === option ? 'primary' : 'default'"
            >
              {{ option }}
            </n-button>
          </n-flex>
          <n-flex v-if="props.searchHistory.length > 0" wrap style="gap: 6px">
            <n-tag
              v-for="(item, idx) in props.searchHistory.slice(0, 8)"
              :key="`m-history-${idx}`"
              size="small"
              closable
              @close="emit('remove-history-item', item)"
              @click="emit('use-history-item', item)"
              style="cursor: pointer"
              :type="props.searchText === item ? 'primary' : 'default'"
            >
              {{ item.length > 24 ? item.substring(0, 24) + '...' : item }}
            </n-tag>
          </n-flex>
        </n-flex>
      </n-collapse-item>
    </n-collapse>
    <n-flex v-if="props.fileName && !props.isLoadingFile" align="center" style="gap: 8px">
      <n-text depth="3" style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1">
        {{ props.fileName }}
      </n-text>
      <n-tag v-if="props.totalLines > 0" size="small" type="info">{{ props.totalLines }} 行</n-tag>
      <n-tag v-if="props.fileSizeInMB > 0" size="small" :type="props.isLargeFile ? 'error' : 'warning'">
        {{ props.fileSizeInMB.toFixed(1) }} MB
      </n-tag>
    </n-flex>
    <n-text v-if="props.isLoadingFile" type="info" style="font-size: 13px">正在加载文件...</n-text>
  </n-flex>
</template>
