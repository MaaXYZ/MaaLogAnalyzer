<script setup lang="ts">
import { NFlex, NTag, NButton, NDropdown, NIcon } from 'naive-ui'
import { FolderOpenOutlined, CloudUploadOutlined } from '@vicons/antd'
import type { DropdownOption } from 'naive-ui'

defineProps<{
  showRealtimeStatus: boolean
  isRealtimeStreaming: boolean
  followLast: boolean
  showReloadControls: boolean
  reloadOptions: DropdownOption[]
  isInTauri: boolean
  isInVSCode: boolean
}>()

const emit = defineEmits<{
  'toggle-follow': []
  'reload-select': [key: string]
}>()

const handleReloadSelect = (key: string | number) => {
  emit('reload-select', String(key))
}
</script>

<template>
  <n-flex align="center" style="gap: 8px">
    <n-tag v-if="showRealtimeStatus && isRealtimeStreaming" type="info" size="small">实时解析中</n-tag>
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
          <n-icon>
            <folder-open-outlined v-if="isInTauri || isInVSCode" />
            <cloud-upload-outlined v-else />
          </n-icon>
        </template>
        重新加载
      </n-button>
    </n-dropdown>
  </n-flex>
</template>
