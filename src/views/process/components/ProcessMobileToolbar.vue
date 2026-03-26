<script setup lang="ts">
import { NFlex, NButton, NIcon, NText, NDropdown } from 'naive-ui'
import { MenuOutlined, FolderOpenOutlined } from '@vicons/antd'
import type { DropdownOption } from 'naive-ui'

defineProps<{
  selectedTaskEntry: string
  showRealtimeStatus: boolean
  isRealtimeStreaming: boolean
  followLast: boolean
  showReloadControls: boolean
  reloadOptions: DropdownOption[]
}>()

const emit = defineEmits<{
  'open-task-drawer': []
  'toggle-follow': []
  'reload-select': [key: string]
}>()

const handleReloadSelect = (key: string | number) => {
  emit('reload-select', String(key))
}
</script>

<template>
  <n-flex align="center" style="gap: 8px">
    <n-button text style="font-size: 20px" @click="emit('open-task-drawer')">
      <n-icon><menu-outlined /></n-icon>
    </n-button>
    <n-text strong style="font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
      {{ selectedTaskEntry || '选择任务' }}
    </n-text>
    <n-button
      v-if="showRealtimeStatus"
      size="small"
      :type="isRealtimeStreaming && followLast ? 'primary' : 'default'"
      :disabled="!isRealtimeStreaming"
      @click="emit('toggle-follow')"
    >
      {{ isRealtimeStreaming ? (followLast ? '跟随中' : '跟随最新') : '未实时' }}
    </n-button>
    <n-dropdown v-if="showReloadControls" :options="reloadOptions" @select="handleReloadSelect">
      <n-button size="small">
        <template #icon>
          <n-icon><folder-open-outlined /></n-icon>
        </template>
        重新加载
      </n-button>
    </n-dropdown>
  </n-flex>
</template>
