<script setup lang="ts">
import { ref } from 'vue'
import { NBadge, NButton, NDropdown, NFlex, NIcon, NText } from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import type { DropdownOption } from 'naive-ui'

const props = defineProps<{
  isInTauri: boolean
  isInVscode: boolean
  isVscodeLaunchEmbed: boolean
  showReloadControls: boolean
  reloadOptions: DropdownOption[]
}>()

const emit = defineEmits<{
  'tauri-open': []
  'tauri-open-folder': []
  'vscode-open': []
  'vscode-open-folder': []
  'pick-file': []
  drop: [event: DragEvent]
  'drag-over': [event: DragEvent]
  'reload-select': [key: string]
}>()

const handleReloadSelect = (key: string | number) => {
  emit('reload-select', String(key))
}

// 整块拖拽区可点：开着拖拽计数器，避免在子元素间移动时反复闪烁
const dragging = ref(false)
const dragDepth = ref(0)

const onDragEnter = (event: DragEvent) => {
  dragDepth.value += 1
  dragging.value = true
  emit('drag-over', event)
}

const onDragOver = (event: DragEvent) => {
  if (!dragging.value) dragging.value = true
  emit('drag-over', event)
}

const onDragLeave = (event: DragEvent) => {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
  if (dragDepth.value === 0) dragging.value = false
  void event
}

const onDrop = (event: DragEvent) => {
  dragDepth.value = 0
  dragging.value = false
  emit('drop', event)
}

// 点整块区域 = 选文件（最常见的那一步）；选文件夹仍走按钮里的下拉。
// 注意：整块区域只做鼠标便利，不再挂 role="button"——里面已经有真按钮，
// 嵌套交互控件（axe: nested-interactive）反而会让读屏器困惑。
const pickFile = () => emit('pick-file')
</script>

<template>
  <div class="empty-panel-root">
    <div v-if="props.isInTauri" class="empty-panel-card">
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

    <div v-else-if="props.isInVscode" class="empty-panel-card">
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

    <div v-else-if="props.isVscodeLaunchEmbed" class="empty-panel-card">
      <n-icon size="48" :depth="3" style="margin-bottom: 16px">
        <folder-open-outlined />
      </n-icon>
      <div style="margin-bottom: 12px">
        <n-text style="font-size: 16px; display: block; margin-bottom: 8px">
          请先在分析视图中加载日志
        </n-text>
        <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 8px">
          当前 VS Code iframe 会复用分析视图中已打开的日志数据，这里不单独提供拖拽或导入入口。
        </n-text>
        <n-badge value="VS Code iframe" type="info" style="margin-top: 4px" />
      </div>
    </div>

    <div
      v-else
      class="drop-zone empty-panel-card"
      :class="{ 'drop-zone--dragging': dragging }"
      data-tour="analysis-upload-zone"
      @click="pickFile"
      @drop="onDrop"
      @dragover="onDragOver"
      @dragenter="onDragEnter"
      @dragleave="onDragLeave"
    >
      <div style="padding: 40px 20px; text-align: center">
        <n-icon size="48" :depth="3">
          <cloud-upload-outlined />
        </n-icon>
        <n-text style="font-size: 16px; display: block; margin-top: 12px">
          {{ dragging ? '松开即可打开这份日志' : '拖拽日志文件/文件夹到这里，或点击此处选择' }}
        </n-text>
        <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 12px">
          支持 maa.log / maafw.log、.zip 压缩包，文件夹需包含日志文件
        </n-text>
        <n-flex justify="center">
          <n-dropdown
            v-if="props.showReloadControls"
            :options="props.reloadOptions"
            @select="handleReloadSelect"
          >
            <n-button type="primary" size="large" @click.stop>
              <template #icon>
                <n-icon><folder-open-outlined /></n-icon>
              </template>
              选择文件/文件夹
            </n-button>
          </n-dropdown>
          <n-button v-else type="primary" size="large" @click.stop="pickFile">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择日志文件
          </n-button>
        </n-flex>
      </div>
    </div>
  </div>
</template>

<style scoped>
.empty-panel-root {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-panel-card {
  width: min(680px, 100%);
  text-align: center;
  padding: 48px 32px;
}

.drop-zone {
  border: 2px dashed var(--n-border-color);
  border-radius: 12px;
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
  cursor: pointer;
}

.drop-zone:hover {
  border-color: var(--n-color-target);
  background-color: var(--n-color-target-hover);
}

.drop-zone:focus-visible {
  outline: 2px solid var(--n-color-target);
  outline-offset: 2px;
}

/* 拖拽悬停：整块区域给出明确接收态，不必再猜能不能放 */
.drop-zone--dragging {
  border-color: var(--n-color-target);
  border-style: solid;
  background-color: var(--n-color-target-hover);
}
</style>
