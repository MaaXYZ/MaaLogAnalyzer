<script setup lang="ts">
import { NBadge, NButton, NDropdown, NFlex, NIcon, NText } from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import type { DropdownOption } from 'naive-ui'

const props = defineProps<{
  isInTauri: boolean
  isInVscode: boolean
  showReloadControls: boolean
  reloadOptions: DropdownOption[]
}>()

const emit = defineEmits<{
  'tauri-open': []
  'tauri-open-folder': []
  'vscode-open': []
  'vscode-open-folder': []
  'drop': [event: DragEvent]
  'drag-over': [event: DragEvent]
  'reload-select': [key: string]
}>()

const handleReloadSelect = (key: string | number) => {
  emit('reload-select', String(key))
}
</script>

<template>
  <div>
    <div v-if="props.isInTauri" style="text-align: center; padding: 40px 20px">
      <n-icon size="48" :depth="3" style="margin-bottom: 16px">
        <folder-open-outlined />
      </n-icon>
      <div style="margin-bottom: 20px">
        <n-text style="font-size: 16px; display: block; margin-bottom: 8px">
          使用原生文件选择器
        </n-text>
        <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 8px">
          支持 maa.log / maafw.log、.zip 压缩包，或选择包含日志的文件夹
        </n-text>
        <n-badge value="Tauri" type="success" style="margin-top: 4px" />
      </div>
      <n-flex justify="center" style="gap: 12px">
        <n-button type="primary" size="large" @click="emit('tauri-open')">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          选择日志文件
        </n-button>
        <n-button size="large" @click="emit('tauri-open-folder')">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          选择文件夹
        </n-button>
      </n-flex>
    </div>

    <div v-else-if="props.isInVscode" style="text-align: center; padding: 40px 20px">
      <n-icon size="48" :depth="3" style="margin-bottom: 16px">
        <folder-open-outlined />
      </n-icon>
      <div style="margin-bottom: 20px">
        <n-text style="font-size: 16px; display: block; margin-bottom: 8px">
          使用 VS Code 文件选择器
        </n-text>
        <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 8px">
          支持 maa.log / maafw.log、.zip 压缩包，或选择包含日志的文件夹
        </n-text>
        <n-badge value="VS Code" type="info" style="margin-top: 4px" />
      </div>
      <n-flex justify="center" style="gap: 12px">
        <n-button type="primary" size="large" @click="emit('vscode-open')">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          选择日志文件
        </n-button>
        <n-button size="large" @click="emit('vscode-open-folder')">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          选择文件夹
        </n-button>
      </n-flex>
    </div>

    <div
      v-else
      class="drop-zone"
      data-tour="analysis-upload-zone"
      @drop="emit('drop', $event)"
      @dragover="emit('drag-over', $event)"
      @dragenter="emit('drag-over', $event)"
    >
      <div style="padding: 40px 20px; text-align: center">
        <n-icon size="48" :depth="3">
          <cloud-upload-outlined />
        </n-icon>
        <n-text style="font-size: 16px; display: block; margin-top: 12px">
          拖拽日志文件/文件夹到此处，或点击下方按钮选择
        </n-text>
        <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 12px">
          支持 maa.log / maafw.log、.zip 压缩包，文件夹需包含日志文件
        </n-text>
        <n-dropdown v-if="props.showReloadControls" :options="props.reloadOptions" @select="handleReloadSelect">
          <n-button type="primary" size="large">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择文件/文件夹
          </n-button>
        </n-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
.drop-zone {
  border: 2px dashed var(--n-border-color);
  border-radius: 8px;
  transition: all 0.2s ease;
  cursor: pointer;
}

.drop-zone:hover {
  border-color: var(--n-color-target);
  background-color: var(--n-color-target-hover);
}
</style>
