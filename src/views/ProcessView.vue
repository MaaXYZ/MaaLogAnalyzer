<script setup lang="ts">
import { ref, computed } from 'vue'
import { 
  NCard, NButton, NUpload, NUploadDragger, NIcon, NText, NFlex,
  NTabs, NTabPane, NScrollbar, NEmpty, NBadge, NTag, type UploadFileInfo
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import NodeCard from '../components/NodeCard.vue'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '../utils/logParser'
import { isTauri, openLogFileDialog } from '../utils/fileDialog'

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loading: boolean
  parser: LogParser
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'upload-file': [file: File]
  'upload-content': [content: string]
  'select-node': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
}>()

// 当前选中的任务索引
const activeTaskIndex = ref(0)

// 是否在 Tauri 环境
const isInTauri = ref(isTauri())

// 当前任务的节点列表
const currentNodes = computed<NodeInfo[]>(() => {
  if (!props.selectedTask) return []
  return props.selectedTask.nodes || []
})

// 切换任务
const handleTabChange = (index: number) => {
  activeTaskIndex.value = index
  if (props.tasks[index]) {
    emit('select-task', props.tasks[index])
  }
}

// 处理文件上传（Web）
const handleFileChange = (options: { fileList: UploadFileInfo[] }) => {
  const file = options.fileList[0]?.file
  if (file) {
    emit('upload-file', file as File)
  }
}

// 使用 Tauri 打开文件
const handleTauriOpen = async () => {
  const content = await openLogFileDialog()
  if (content) {
    emit('upload-content', content)
  }
}

// 选择节点
const handleNodeClick = (node: NodeInfo) => {
  emit('select-node', node)
}

// 选择识别尝试
const handleRecognitionClick = (node: NodeInfo, attemptIndex: number) => {
  emit('select-recognition', node, attemptIndex)
}

// 选择嵌套节点
const handleNestedClick = (node: NodeInfo, attemptIndex: number, nestedIndex: number) => {
  emit('select-nested', node, attemptIndex, nestedIndex)
}
</script>

<template>
  <n-card
    title="MAA 日志分析器"
    style="height: 100%"
    content-style="display: flex; flex-direction: column; gap: 16px; min-height: 0"
  >
    <!-- 标题右侧：主题切换按钮 -->
    <!-- 文件上传区域 -->
    <div v-if="tasks.length === 0">
      <!-- Tauri 环境：使用原生文件对话框 -->
      <div v-if="isInTauri" style="text-align: center; padding: 40px 20px">
        <n-icon size="48" :depth="3" style="margin-bottom: 16px">
          <folder-open-outlined />
        </n-icon>
        <div style="margin-bottom: 20px">
          <n-text style="font-size: 16px; display: block; margin-bottom: 8px">
            使用原生文件选择器
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 8px">
            支持 maa.log 格式
          </n-text>
          <n-badge value="Tauri" type="success" style="margin-top: 4px" />
        </div>
        <n-button type="primary" size="large" @click="handleTauriOpen">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          选择日志文件
        </n-button>
      </div>
      
      <!-- Web 环境：使用拖拽上传 -->
      <n-upload
        v-else
        :show-file-list="false"
        :custom-request="() => {}"
        @change="handleFileChange"
      >
        <n-upload-dragger>
          <div style="padding: 20px">
            <n-icon size="48" :depth="3">
              <cloud-upload-outlined />
            </n-icon>
            <n-text style="font-size: 16px">
              点击或拖拽上传日志文件
            </n-text>
            <n-text depth="3" style="font-size: 14px">
              支持 maa.log 格式
            </n-text>
          </div>
        </n-upload-dragger>
      </n-upload>
    </div>

    <!-- 任务列表 -->
    <template v-else>
      <!-- 操作按钮 -->
      <n-flex>
        <!-- Tauri 环境 -->
        <n-button v-if="isInTauri" @click="handleTauriOpen">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          重新打开
        </n-button>
        
        <!-- Web 环境 -->
        <n-upload
          v-else
          :show-file-list="false"
          :custom-request="() => {}"
          @change="handleFileChange"
        >
          <n-button>
            <template #icon>
              <n-icon><cloud-upload-outlined /></n-icon>
            </template>
            重新上传
          </n-button>
        </n-upload>
      </n-flex>

      <!-- 任务切换 Tab -->
      <n-tabs
        :value="activeTaskIndex"
        type="bar"
        @update:value="handleTabChange"
        style="flex: 1; min-height: 0; display: flex; flex-direction: column"
        :pane-style="{ flex: '1', minHeight: '0', display: 'flex', flexDirection: 'column' }"
      >
        <n-tab-pane
          v-for="(task, index) in tasks"
          :key="index"
          :name="index"
        >
          <template #tab>
            <n-flex align="center" style="gap: 8px">
              <span>{{ task.entry }}</span>
              <n-tag size="small" :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                #{{ index + 1 }}
              </n-tag>
            </n-flex>
          </template>
          <!-- 节点时间线 -->
          <n-scrollbar style="flex: 1; min-height: 0">
            <div v-if="currentNodes.length === 0" style="padding: 40px 0">
              <n-empty description="暂无节点数据" />
            </div>
            <n-flex vertical v-else style="gap: 16px; padding: 12px 0">
              <node-card
                v-for="(node, idx) in currentNodes"
                :key="idx"
                :node="node"
                @select-node="handleNodeClick"
                @select-recognition="handleRecognitionClick"
                @select-nested="handleNestedClick"
              />
            </n-flex>
          </n-scrollbar>
        </n-tab-pane>
      </n-tabs>
    </template>
  </n-card>
</template>

<style scoped>
/* Fix Naive UI scrollbar container background in light mode */
:deep(.n-scrollbar-container) {
  background-color: transparent !important;
}

:deep(.n-scrollbar-content) {
  background-color: transparent !important;
}

:deep(.n-card__content) {
  background-color: transparent !important;
}
</style>