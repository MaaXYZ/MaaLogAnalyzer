<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NCard, NButton, NUpload, NUploadDragger, NIcon, NText, NFlex,
  NScrollbar, NEmpty, NBadge, NTag, NSplit, NList, NListItem, type UploadFileInfo
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import NodeCard from '../components/NodeCard.vue'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '../utils/logParser'
import { isTauri, openLogFileDialog } from '../utils/fileDialog'
import { formatDuration } from '../utils/formatDuration'

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  onExpandDetailView?: () => void
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'upload-file': [file: File]
  'upload-content': [content: string]
  'select-node': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'file-loading-start': []
  'file-loading-end': []
}>()

// 当前选中的任务索引
const activeTaskIndex = ref(0)

// 文件读取加载状态
const fileLoading = ref(false)

// 是否在 Tauri 环境
const isInTauri = ref(isTauri())

// 任务列表折叠状态
const taskListCollapsed = ref(false)
const taskListSize = ref(0.25)
const taskListSavedSize = ref(0.25)

// 切换任务列表折叠状态
const toggleTaskList = () => {
  if (taskListCollapsed.value) {
    // 展开：恢复保存的大小
    taskListSize.value = taskListSavedSize.value
    taskListCollapsed.value = false
  } else {
    // 折叠：保存当前大小，然后完全隐藏
    taskListSavedSize.value = taskListSize.value
    taskListSize.value = 0
    taskListCollapsed.value = true
  }
}

// 根据节点详情折叠状态动态调整任务列表宽度
watch(() => props.detailViewCollapsed, (detailCollapsed) => {
  // 只在任务列表未折叠时调整宽度
  if (!taskListCollapsed.value) {
    if (detailCollapsed) {
      // 节点详情折叠，使用较小宽度
      taskListSize.value = 0.15
      taskListSavedSize.value = 0.15
    } else {
      // 节点详情展开，使用较大宽度
      taskListSize.value = 0.25
      taskListSavedSize.value = 0.25
    }
  }
})

// 节点导航折叠状态
const nodeNavCollapsed = ref(false)
const nodeNavSize = ref(0.2)
const nodeNavSavedSize = ref(0.2)

// 切换节点导航折叠状态
const toggleNodeNav = () => {
  if (nodeNavCollapsed.value) {
    // 展开：恢复保存的大小
    nodeNavSize.value = nodeNavSavedSize.value
    nodeNavCollapsed.value = false
  } else {
    // 折叠：保存当前大小，然后完全隐藏
    nodeNavSavedSize.value = nodeNavSize.value
    nodeNavSize.value = 0
    nodeNavCollapsed.value = true
  }
}

// 根据两侧折叠状态动态调整节点导航宽度
watch([taskListCollapsed, () => props.detailViewCollapsed], ([taskCollapsed, detailCollapsed]) => {
  // 只在节点导航未折叠时调整宽度
  if (!nodeNavCollapsed.value) {
    if (taskCollapsed && detailCollapsed) {
      // 两侧都折叠，使用较小宽度
      nodeNavSize.value = 0.12
      nodeNavSavedSize.value = 0.12
    } else {
      // 至少有一侧展开，使用较大宽度
      nodeNavSize.value = 0.2
      nodeNavSavedSize.value = 0.2
    }
  }
})

// 虚拟滚动不需要手动管理节点引用

// 滚动到指定节点（虚拟滚动版本）
const scrollToNode = (index: number) => {
  if (virtualScroller.value) {
    // 对于动态高度的虚拟滚动，需要多次调用以确保准确滚动
    // 第一次滚动
    virtualScroller.value.scrollToItem(index)

    // 等待渲染后再次调整位置，确保准确
    setTimeout(() => {
      virtualScroller.value?.scrollToItem(index)
    }, 100)

    // 再次确认，处理复杂的动态高度情况
    setTimeout(() => {
      virtualScroller.value?.scrollToItem(index)
    }, 300)
  }
}

// 当前任务的节点列表
const currentNodes = computed<NodeInfo[]>(() => {
  if (!props.selectedTask) return []
  return props.selectedTask.nodes || []
})

// 虚拟滚动引用
const virtualScroller = ref<InstanceType<typeof DynamicScroller> | null>(null)

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
  try {
    // 动态导入 Tauri API
    const { open } = await import('@tauri-apps/api/dialog')
    const { readTextFile } = await import('@tauri-apps/api/fs')

    // 打开文件选择对话框（不显示加载提示）
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Log Files',
        extensions: ['log', 'jsonl', 'txt']
      }],
      directory: false,
      title: '选择日志文件'
    })

    // 用户选择了文件后，才显示加载提示并读取文件
    if (selected && typeof selected === 'string') {
      try {
        fileLoading.value = true
        emit('file-loading-start')

        const content = await readTextFile(selected)

        if (content) {
          emit('upload-content', content)
        }
      } finally {
        fileLoading.value = false
        emit('file-loading-end')
      }
    }
  } catch (error) {
    fileLoading.value = false
    emit('file-loading-end')
    alert('打开文件失败: ' + error)
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

      <!-- 左右分栏布局 -->
      <n-split
        direction="horizontal"
        v-model:size="taskListSize"
        :min="0"
        :max="0.4"
        style="flex: 1; min-height: 0"
      >
        <!-- 左侧：任务列表 -->
        <template #1>
          <n-card size="small" title="任务列表" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
            <!-- 折叠按钮 - 右边缘中间 -->
            <n-button
              circle
              size="small"
              @click="toggleTaskList"
              style="position: absolute; right: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
            >
              <template #icon>
                <n-icon>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <!-- 展开时显示向左箭头，表示点击后向左折叠 -->
                    <path fill="currentColor" d="M15.41 7.41L14 6l-6 6l6 6l1.41-1.41L10.83 12z"/>
                  </svg>
                </n-icon>
              </template>
            </n-button>
            <n-scrollbar style="height: 100%; max-height: 100%">
              <n-list hoverable clickable>
                <n-list-item
                  v-for="(task, index) in tasks"
                  :key="index"
                  @click="handleTabChange(index)"
                  :style="{
                    backgroundColor: activeTaskIndex === index ? 'var(--n-color-target)' : 'transparent',
                    cursor: 'pointer',
                    padding: '12px 16px'
                  }"
                >
                  <n-flex vertical style="gap: 8px">
                    <!-- 任务入口名称 -->
                    <n-flex align="center" justify="space-between">
                      <n-text strong style="font-size: 15px">{{ task.entry }}</n-text>
                      <n-tag size="small" :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                        #{{ index + 1 }}
                      </n-tag>
                    </n-flex>

                    <!-- 任务详情 -->
                    <n-flex vertical style="gap: 4px">
                      <n-text depth="3" style="font-size: 12px">
                        状态:
                        <n-text :type="task.status === 'succeeded' ? 'success' : task.status === 'failed' ? 'error' : 'warning'">
                          {{ task.status === 'succeeded' ? '成功' : task.status === 'failed' ? '失败' : '运行中' }}
                        </n-text>
                      </n-text>
                      <n-text depth="3" style="font-size: 12px">
                        节点: {{ task.nodes.length }} 个
                      </n-text>
                      <n-text depth="3" style="font-size: 12px" v-if="task.duration">
                        耗时: {{ formatDuration(task.duration) }}
                      </n-text>
                    </n-flex>
                  </n-flex>
                </n-list-item>
              </n-list>
            </n-scrollbar>
          </n-card>
        </template>

        <!-- 右侧：节点详情 -->
        <template #2>
          <n-card size="small" title="节点时间线" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
            <!-- 展开任务列表按钮（仅在任务列表折叠时显示） -->
            <n-button
              v-if="taskListCollapsed"
              circle
              size="small"
              @click="toggleTaskList"
              style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
            >
              <template #icon>
                <n-icon>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <!-- 折叠时显示向右箭头，表示点击后从左侧展开 -->
                    <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                  </svg>
                </n-icon>
              </template>
            </n-button>

            <!-- 展开节点详情按钮（仅在节点详情折叠时显示） -->
            <n-button
              v-if="detailViewCollapsed && onExpandDetailView"
              circle
              size="small"
              @click="onExpandDetailView"
              style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
            >
              <template #icon>
                <n-icon>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                    <!-- 折叠时显示向左箭头，表示点击后从右侧展开 -->
                    <path fill="currentColor" d="M15.41 7.41L14 6l-6 6l6 6l1.41-1.41L10.83 12z"/>
                  </svg>
                </n-icon>
              </template>
            </n-button>

            <!-- 节点导航和详情的分栏布局 -->
            <n-split
              direction="horizontal"
              v-model:size="nodeNavSize"
              :min="0"
              :max="0.4"
              style="height: 100%"
            >
              <!-- 左侧：节点导航列表 -->
              <template #1>
                <n-card size="small" title="节点导航" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
                  <!-- 折叠按钮 - 右边缘中间 -->
                  <n-button
                    circle
                    size="small"
                    @click="toggleNodeNav"
                    style="position: absolute; right: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
                  >
                    <template #icon>
                      <n-icon>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <!-- 展开时显示向左箭头，表示点击后向左折叠 -->
                          <path fill="currentColor" d="M15.41 7.41L14 6l-6 6l6 6l1.41-1.41L10.83 12z"/>
                        </svg>
                      </n-icon>
                    </template>
                  </n-button>
                  <n-scrollbar style="height: 100%; max-height: 100%">
                    <n-list hoverable clickable v-if="currentNodes.length > 0">
                      <n-list-item
                        v-for="(node, index) in currentNodes"
                        :key="`nav-${node.task_id}-${node.node_id}`"
                        @click="scrollToNode(index)"
                        :style="{
                          cursor: 'pointer',
                          padding: '8px 12px'
                        }"
                      >
                        <n-flex vertical style="gap: 4px">
                          <n-text strong style="font-size: 13px">{{ node.name || '未命名节点' }}</n-text>
                          <n-flex align="center" style="gap: 8px">
                            <n-tag size="small" :type="node.status === 'success' ? 'success' : 'error'">
                              {{ node.status === 'success' ? '成功' : '失败' }}
                            </n-tag>
                            <n-text depth="3" style="font-size: 11px">
                              #{{ index + 1 }}
                            </n-text>
                          </n-flex>
                        </n-flex>
                      </n-list-item>
                    </n-list>
                  </n-scrollbar>
                </n-card>
              </template>

              <!-- 右侧：节点详细卡片 -->
              <template #2>
                <div style="height: 100%; display: flex; flex-direction: column; position: relative">
                  <!-- 展开节点导航按钮（仅在节点导航折叠时显示） -->
                  <n-button
                    v-if="nodeNavCollapsed"
                    circle
                    size="small"
                    @click="toggleNodeNav"
                    style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
                  >
                    <template #icon>
                      <n-icon>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <!-- 折叠时显示向右箭头，表示点击后从左侧展开 -->
                          <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                        </svg>
                      </n-icon>
                    </template>
                  </n-button>

                  <div v-if="currentNodes.length === 0" style="padding: 40px 0">
                    <n-empty description="暂无节点数据" />
                  </div>
                  <DynamicScroller
                    v-else
                    ref="virtualScroller"
                    :items="currentNodes"
                    :min-item-size="150"
                    key-field="node_id"
                    class="virtual-scroller"
                    style="height: 100%"
                  >
                    <template #default="{ item, index, active }">
                      <DynamicScrollerItem
                        :item="item"
                        :active="active"
                        :data-index="index"
                        :size-dependencies="[
                          item.recognition_attempts?.length,
                          item.next_list?.length,
                          item.action_details
                        ]"
                      >
                        <div style="padding: 12px">
                          <node-card
                            :node="item"
                            @select-node="handleNodeClick"
                            @select-recognition="handleRecognitionClick"
                            @select-nested="handleNestedClick"
                          />
                        </div>
                      </DynamicScrollerItem>
                    </template>
                  </DynamicScroller>
                </div>
              </template>
            </n-split>
          </n-card>
        </template>
      </n-split>
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