<script setup lang="ts">
import { NFlex, NButton, NIcon, NDropdown, NText } from 'naive-ui'
import { MenuOutlined } from '@vicons/antd'

defineProps<{
  currentViewLabel: string
  mobileMenuOptions: Array<Record<string, unknown>>
}>()

const emit = defineEmits<{
  'open-task-drawer': []
  'select-mobile-menu': [key: string]
}>()

const handleMobileMenuSelect = (key: string | number) => {
  emit('select-mobile-menu', String(key))
}
</script>

<template>
  <n-flex justify="space-between" align="center">
    <n-flex align="center" style="gap: 8px">
      <n-button
        text
        style="font-size: 22px"
        @click="emit('open-task-drawer')"
      >
        <n-icon><menu-outlined /></n-icon>
      </n-button>
      <n-text strong style="font-size: 16px">MAA 日志工具</n-text>
    </n-flex>
    <n-dropdown
      :options="mobileMenuOptions"
      @select="handleMobileMenuSelect"
      trigger="click"
    >
      <n-button size="small" data-tour="header-mobile-menu">
        {{ currentViewLabel }}
      </n-button>
    </n-dropdown>
  </n-flex>
</template>
