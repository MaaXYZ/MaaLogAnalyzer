<script setup lang="ts">
import { computed } from 'vue'
import { NFlex, NButton, NIcon, NDropdown, NSelect, NText } from 'naive-ui'
import {
  BarChartOutlined,
  FileSearchOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  RobotOutlined,
  ColumnHeightOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  BulbFilled,
  BulbOutlined,
} from '@vicons/antd'

const props = defineProps<{
  currentViewLabel: string
  viewMode: string
  viewModeOptions: Array<Record<string, unknown>>
  showProcessThreadFilters: boolean
  selectedProcessId: string
  selectedThreadId: string
  processIdOptions: Array<Record<string, unknown>>
  threadIdOptions: Array<Record<string, unknown>>
  isVscodeLaunchEmbed: boolean
  isDark: boolean
}>()

const emit = defineEmits<{
  'select-view-mode': [key: string]
  'update:selected-process-id': [value: string]
  'update:selected-thread-id': [value: string]
  'clear-filters': []
  'open-settings': []
  'open-about': []
  'toggle-theme': []
}>()

const normalizeSelectValue = (value: string | number | null): string => {
  if (value == null) return ''
  return typeof value === 'string' ? value : String(value)
}

const handleViewModeSelect = (key: string | number) => {
  emit('select-view-mode', String(key))
}

const handleProcessUpdate = (value: string | number | null) => {
  emit('update:selected-process-id', normalizeSelectValue(value))
}

const handleThreadUpdate = (value: string | number | null) => {
  emit('update:selected-thread-id', normalizeSelectValue(value))
}

const isNativeVSCodeHost = typeof window !== 'undefined'
  && (window.isVSCode === true || typeof window.vscodeApi !== 'undefined')

const useNonVscodeDarkSelectStyle = computed(() => (
  props.isDark
  && !props.isVscodeLaunchEmbed
  && !isNativeVSCodeHost
))

const processThreadSelectStyle = computed(() => {
  if (!useNonVscodeDarkSelectStyle.value) return 'width: 150px'
  return [
    'width: 150px',
    '--n-color: rgba(255, 255, 255, 0.06)',
    '--n-color-active: rgba(255, 255, 255, 0.08)',
    '--n-border: 1px solid rgba(255, 255, 255, 0.26)',
    '--n-border-hover: 1px solid rgba(255, 255, 255, 0.42)',
    '--n-border-focus: 1px solid #63e2b7',
    '--n-border-active: 1px solid #63e2b7',
    '--n-box-shadow-hover: 0 0 0 1px rgba(255, 255, 255, 0.12)',
    '--n-box-shadow-focus: 0 0 0 2px rgba(99, 226, 183, 0.24)',
    '--n-box-shadow-active: 0 0 0 2px rgba(99, 226, 183, 0.24)',
    '--n-text-color: rgba(255, 255, 255, 0.9)',
    '--n-placeholder-color: rgba(255, 255, 255, 0.58)',
    '--n-arrow-color: rgba(255, 255, 255, 0.72)',
  ].join('; ')
})
</script>

<template>
  <n-flex justify="space-between" align="center">
    <n-flex align="center" style="gap: 12px">
      <n-text strong style="font-size: 16px">MAA 日志工具</n-text>

      <div data-tour="header-view-switch">
        <n-dropdown
          :options="viewModeOptions"
          @select="handleViewModeSelect"
          trigger="click"
        >
          <n-button size="small">
            <template #icon>
              <n-icon>
                <bar-chart-outlined v-if="viewMode === 'analysis'" />
                <file-search-outlined v-else-if="viewMode === 'search'" />
                <dashboard-outlined v-else-if="viewMode === 'statistics'" />
                <apartment-outlined v-else-if="viewMode === 'flowchart'" />
                <robot-outlined v-else-if="viewMode === 'ai'" />
                <column-height-outlined v-else />
              </n-icon>
            </template>
            {{ currentViewLabel }}
          </n-button>
        </n-dropdown>
      </div>

      <n-select
        v-if="showProcessThreadFilters"
        :value="selectedProcessId"
        :options="processIdOptions"
        placeholder="选择进程"
        clearable
        size="small"
        :style="processThreadSelectStyle"
        @update:value="handleProcessUpdate"
      />

      <n-select
        v-if="showProcessThreadFilters"
        :value="selectedThreadId"
        :options="threadIdOptions"
        placeholder="选择线程"
        clearable
        size="small"
        :style="processThreadSelectStyle"
        @update:value="handleThreadUpdate"
      />

      <n-button
        v-if="showProcessThreadFilters && (props.selectedProcessId || props.selectedThreadId)"
        @click="emit('clear-filters')"
        size="small"
        secondary
      >
        清除过滤
      </n-button>
    </n-flex>

    <n-flex align="center" style="gap: 8px">
      <n-button
        text
        style="font-size: 20px"
        data-tour="header-settings-button"
        @click="emit('open-settings')"
      >
        <n-icon>
          <setting-outlined />
        </n-icon>
      </n-button>

      <n-button
        text
        style="font-size: 20px"
        @click="emit('open-about')"
      >
        <n-icon>
          <info-circle-outlined />
        </n-icon>
      </n-button>

      <n-button
        v-if="!isVscodeLaunchEmbed"
        text
        style="font-size: 20px"
        data-tour="header-theme-button"
        @click="emit('toggle-theme')"
      >
        <n-icon>
          <bulb-filled v-if="isDark" />
          <bulb-outlined v-else />
        </n-icon>
      </n-button>
    </n-flex>
  </n-flex>
</template>
