<script setup lang="ts">
import { computed, nextTick, ref, type Component } from 'vue'
import { NFlex, NButton, NIcon, NTabs, NTab, NText } from 'naive-ui'
import {
  BarChartOutlined,
  FileSearchOutlined,
  DashboardOutlined,
  ApartmentOutlined,
  ColumnHeightOutlined,
  SettingOutlined,
  InfoCircleOutlined,
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

const typedViewModeOptions = computed(() => props.viewModeOptions as unknown as ViewModeOption[])

const viewSwitchRef = ref<HTMLElement | null>(null)

const viewModeKeys = computed(() => typedViewModeOptions.value.map((option) => option.key))

// n-tabs 的标签是普通 div：没有 role、没有 tabindex，也不处理键盘事件。
// 这里补 roving tabindex + 方向键切换，让键盘和读屏都能操作视图切换。
const focusTab = (key: string) => {
  void nextTick(() => {
    viewSwitchRef.value?.querySelector<HTMLElement>(`[data-name="${key}"]`)?.focus()
  })
}

const handleTabKeydown = (key: string, event: KeyboardEvent) => {
  const keys = viewModeKeys.value
  const current = keys.indexOf(key)
  if (current < 0) return

  let nextKey: string | undefined
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      nextKey = keys[(current + 1) % keys.length]
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      nextKey = keys[(current - 1 + keys.length) % keys.length]
      break
    case 'Home':
      nextKey = keys[0]
      break
    case 'End':
      nextKey = keys[keys.length - 1]
      break
    default:
      return
  }

  if (nextKey === undefined) return
  event.preventDefault()
  emit('select-view-mode', nextKey)
  focusTab(nextKey)
}

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
        ref="viewSwitchRef"
        data-tour="header-view-switch"
        class="header-view-switch"
        :class="{ 'header-view-switch--dark': isDark }"
        role="tablist"
        aria-label="视图切换"
      >
        <n-tabs type="segment" size="small" :value="viewMode" @update:value="handleViewModeSelect">
          <n-tab
            v-for="option in typedViewModeOptions"
            :key="option.key"
            :name="option.key"
            role="tab"
            :aria-selected="viewMode === option.key"
            :tabindex="viewMode === option.key ? 0 : -1"
            @keydown="handleTabKeydown(option.key, $event)"
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
        title="设置"
        aria-label="打开设置"
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
        title="关于"
        aria-label="打开关于对话框"
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
        :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
        :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
        data-tour="header-theme-button"
        @click="emit('toggle-theme')"
      >
        <n-icon>
          <!-- 深色主题显示太阳（点击切浅色），浅色主题显示月亮（点击切深色） -->
          <svg v-if="isDark" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path
              d="M12 17.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11zm0-15a1 1 0 0 1-1-1V1a1 1 0 0 1 2 0v.5a1 1 0 0 1-1 1zm0 20.5a1 1 0 0 1-1-1v-.5a1 1 0 0 1 2 0v.5a1 1 0 0 1-1 1zM3.6 5a1 1 0 0 1 .7-1.7c.27 0 .53.1.71.29l.35.35a1 1 0 1 1-1.41 1.41L3.6 5zM19.28 19.7a1 1 0 0 1 1.42 0l.35.35a1 1 0 1 1-1.41 1.41l-.36-.35a1 1 0 0 1 0-1.41zM1 11.25h.5a1 1 0 0 1 0 2H1a1 1 0 0 1 0-2zm21.5 0H23a1 1 0 0 1 0 2h-.5a1 1 0 0 1 0-2zM3.6 20.4a1 1 0 0 1 0-1.41l.35-.36a1 1 0 1 1 1.41 1.42l-.35.35a1 1 0 0 1-1.41 0zM19.28 5.7a1 1 0 0 1 0-1.41l.36-.35a1 1 0 1 1 1.41 1.41l-.35.35a1 1 0 0 1-1.42 0z"
            />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
            <path
              d="M21 12.8A9 9 0 1 1 11.2 3a.75.75 0 0 1 .93.9 7.5 7.5 0 0 0 8.97 8.97.75.75 0 0 1 .9.93z"
            />
          </svg>
        </n-icon>
      </n-button>
    </n-flex>
  </n-flex>
</template>

<style scoped>
.header-view-switch {
  min-width: 0;
}

/* segment 模式的标签默认是 4px 0 内边距 + 0 间距，标签会挤在一起
   （下一个标签的图标贴在上一个标签的文字后面），这里补回左右内边距。 */
.header-view-switch :deep(.n-tabs-tab) {
  padding: 4px 10px;
}

.header-view-switch :deep(.n-tabs-tab:focus-visible) {
  outline: 2px solid var(--n-color-target);
  outline-offset: -1px;
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
