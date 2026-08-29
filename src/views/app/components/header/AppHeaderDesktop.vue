<script setup lang="ts">
import { computed, type Component } from 'vue'
import { NFlex, NButton, NIcon, NTabs, NTab, NText } from 'naive-ui'
import {
  BarChartOutlined,
  FileSearchOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  ColumnHeightOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  BulbFilled,
  BulbOutlined,
} from '@vicons/antd'
import { isVSCode } from '../../../../utils/platform'

interface ViewModeOption {
  label: string
  key: string
  icon: () => unknown
}

const props = defineProps<{
  currentViewLabel: string
  viewMode: string
  viewModeOptions: Array<Record<string, unknown>>
  isVscodeLaunchEmbed: boolean
  isDark: boolean
}>()

const emit = defineEmits<{
  'select-view-mode': [key: string]
  'open-settings': []
  'open-about': []
  'toggle-theme': []
}>()

const handleViewModeSelect = (key: string | number) => {
  emit('select-view-mode', String(key))
}

const typedViewModeOptions = computed(
  () => props.viewModeOptions as unknown as ViewModeOption[],
)

const viewModeIcons: Record<string, Component> = {
  analysis: BarChartOutlined,
  search: FileSearchOutlined,
  statistics: DashboardOutlined,
  flowchart: ApartmentOutlined,
  split: ColumnHeightOutlined,
}

const isNativeVSCodeHost = isVSCode()
</script>

<template>
  <n-flex justify="space-between" align="center">
    <n-flex align="center" style="gap: 12px">
      <n-text strong style="font-size: 16px">MAA 日志工具</n-text>

      <div
        data-tour="header-view-switch"
        class="header-view-switch"
        :class="{ 'header-view-switch--dark': isDark }"
      >
        <n-tabs
          type="segment"
          size="small"
          :value="viewMode"
          @update:value="handleViewModeSelect"
        >
          <n-tab
            v-for="option in typedViewModeOptions"
            :key="option.key"
            :name="option.key"
          >
            <span class="view-tab-content">
              <n-icon :size="14">
                <component :is="viewModeIcons[option.key] ?? BarChartOutlined" />
              </n-icon>
              {{ option.label }}
            </span>
          </n-tab>
        </n-tabs>
      </div>
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
        v-if="!isVscodeLaunchEmbed && !isNativeVSCodeHost"
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

<style scoped>
.header-view-switch {
  min-width: 0;
}

/* 暗色主题下 segment 默认底色与头部卡片背景相同，会完全隐形，这里补一层对比底色 */
.header-view-switch :deep(.n-tabs-rail) {
  border-radius: 5px;
}

.header-view-switch--dark :deep(.n-tabs-rail) {
  background-color: rgba(255, 255, 255, 0.06);
}

.header-view-switch--dark :deep(.n-tabs-capsule) {
  background-color: rgba(255, 255, 255, 0.14);
}

.header-view-switch:not(.header-view-switch--dark) :deep(.n-tabs-rail) {
  background-color: rgba(0, 0, 0, 0.045);
}

.header-view-switch:not(.header-view-switch--dark) :deep(.n-tabs-capsule) {
  background-color: #ffffff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
}

.view-tab-content {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
</style>
