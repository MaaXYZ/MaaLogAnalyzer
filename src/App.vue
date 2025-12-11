<script setup lang="ts">
import { ref, computed, h } from 'vue'
import { NSplit, NCard, NFlex, NButton, NIcon, NDropdown, NModal, NText, NDivider, NTag, useMessage } from 'naive-ui'
import ProcessView from './views/ProcessView.vue'
import DetailView from './views/DetailView.vue'
import TextSearchView from './views/TextSearchView.vue'
import { LogParser } from './utils/logParser'
import { getErrorMessage } from './utils/errorHandler'
import type { TaskInfo, NodeInfo } from './types'
import { BulbOutlined, BulbFilled, FileSearchOutlined, BarChartOutlined, ColumnHeightOutlined, InfoCircleOutlined, GithubOutlined } from '@vicons/antd'

// Props
interface Props {
  isDark: boolean
}

withDefaults(defineProps<Props>(), {
  isDark: true
})

// Emits
const emit = defineEmits<{
  'toggle-theme': []
}>()

// 视图模式
type ViewMode = 'analysis' | 'search' | 'split'
const viewMode = ref<ViewMode>('analysis')

// 视图模式选项
const viewModeOptions = [
  {
    label: '日志分析',
    key: 'analysis' as ViewMode,
    icon: () => h(BarChartOutlined)
  },
  {
    label: '文本搜索',
    key: 'search' as ViewMode,
    icon: () => h(FileSearchOutlined)
  },
  {
    label: '分屏模式',
    key: 'split' as ViewMode,
    icon: () => h(ColumnHeightOutlined)
  }
]

// 当前视图模式的显示文本
const currentViewLabel = computed(() => {
  const option = viewModeOptions.find(opt => opt.key === viewMode.value)
  return option?.label || '视图'
})

// 处理视图模式切换
const handleViewModeSelect = (key: string) => {
  viewMode.value = key as ViewMode
}

const splitSize = ref(0.6)
const parser = new LogParser()
const tasks = ref<TaskInfo[]>([])
const selectedTask = ref<TaskInfo | null>(null)
const selectedNode = ref<NodeInfo | null>(null)
const selectedOperationIndex = ref<number | null>(null)
const loading = ref(false)

// 消息提示
const message = useMessage()

// 关于对话框
const showAboutModal = ref(false)

// 处理文件上传
const handleFileUpload = async (file: File) => {
  loading.value = true
  try {
    const content = await file.text()
    processLogContent(content)
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理文件内容
const handleContentUpload = (content: string) => {
  loading.value = true
  try {
    processLogContent(content)
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理日志内容
const processLogContent = (content: string) => {
  // 移除内部 try-catch，让错误抛出给调用方（handleFileUpload/handleContentUpload）统一处理
  const entries = parser.parseFile(content)
  
  if (entries.length === 0) {
    console.warn('未找到有效的日志记录')
    return
  }

  tasks.value = parser.getTasks()
  if (tasks.value.length > 0) {
    selectedTask.value = tasks.value[0]
  }
  
  console.log(`成功加载 ${entries.length} 条日志记录`)
}

// 选择任务
const handleSelectTask = (task: TaskInfo) => {
  selectedTask.value = task
  selectedNode.value = null
  selectedOperationIndex.value = null
}

// 选择节点
const handleSelectNode = (node: NodeInfo) => {
  selectedNode.value = node
  selectedOperationIndex.value = null
}

// 选择操作
const handleSelectOperation = (node: NodeInfo, opIndex: number) => {
  selectedNode.value = node
  selectedOperationIndex.value = opIndex
}
</script>

<template>
  <div style="height: 100vh; display: flex; flex-direction: column">
    <!-- 顶部菜单栏 -->
    <n-card 
      size="small" 
      :bordered="false"
      content-style="padding: 8px 16px"
    >
      <n-flex justify="space-between" align="center">
        <n-flex align="center" style="gap: 12px">
          <n-text strong style="font-size: 16px">MAA 日志工具</n-text>
          
          <!-- 视图模式下拉菜单 -->
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
                  <column-height-outlined v-else />
                </n-icon>
              </template>
              {{ currentViewLabel }}
            </n-button>
          </n-dropdown>
        </n-flex>
        
        <!-- 右侧按钮组 -->
        <n-flex align="center" style="gap: 8px">
          <!-- 关于按钮 -->
          <n-button 
            text 
            style="font-size: 20px"
            @click="showAboutModal = true"
          >
            <n-icon>
              <info-circle-outlined />
            </n-icon>
          </n-button>
          
          <!-- 主题切换按钮 -->
          <n-button 
            text 
            style="font-size: 20px"
            @click="emit('toggle-theme')"
          >
            <n-icon>
              <bulb-filled v-if="isDark" />
              <bulb-outlined v-else />
            </n-icon>
          </n-button>
        </n-flex>
      </n-flex>
    </n-card>
    
    <!-- 主内容区域 -->
    <div style="flex: 1; min-height: 0; position: relative">
      <!-- 日志分析区域 -->
      <div 
        v-show="viewMode === 'analysis' || viewMode === 'split'"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: viewMode === 'split' ? '50%' : '100%'
        }"
      >
        <n-split 
          v-model:size="splitSize" 
          :max="0.8" 
          :min="0.4" 
          style="height: 100%"
        >
          <template #1>
            <process-view
              :tasks="tasks"
              :selected-task="selectedTask"
              :loading="loading"
              :parser="parser"
              @select-task="handleSelectTask"
              @upload-file="handleFileUpload"
              @upload-content="handleContentUpload"
              @select-node="handleSelectNode"
              @select-operation="handleSelectOperation"
            />
          </template>
          <template #2>
            <detail-view
              :selected-node="selectedNode"
              :selected-task="selectedTask"
              :selected-operation-index="selectedOperationIndex"
            />
          </template>
        </n-split>
      </div>
      
      <!-- 文本搜索区域 -->
      <div 
        v-show="viewMode === 'search' || viewMode === 'split'"
        :style="{
          position: 'absolute',
          top: viewMode === 'split' ? '50%' : '0',
          left: 0,
          right: 0,
          bottom: 0
        }"
      >
        <text-search-view style="height: 100%" />
      </div>
    </div>
    
    <!-- 关于对话框 -->
    <n-modal
      v-model:show="showAboutModal"
      preset="card"
      title="关于 MAA 日志工具"
      style="width: 600px"
      :bordered="false"
    >
      <n-flex vertical style="gap: 20px">
        <!-- 项目信息 -->
        <div style="text-align: center">
          <n-text strong style="font-size: 24px; display: block; margin-bottom: 8px">
            📊 MAA 日志工具
          </n-text>
          <n-text depth="3" style="font-size: 14px">
            MaaFramework 日志分析与文本搜索工具
          </n-text>
        </div>
        
        <n-divider />
        
        <!-- 功能特性 -->
        <div>
          <n-text strong style="font-size: 16px; display: block; margin-bottom: 12px">
            ✨ 主要功能
          </n-text>
          <n-flex vertical style="gap: 8px">
            <n-text depth="2">📋 日志分析 - 可视化任务执行流程</n-text>
            <n-text depth="2">🔍 文本搜索 - 支持大文件流式搜索</n-text>
            <n-text depth="2">⬍ 分屏模式 - 同时查看两个功能</n-text>
            <n-text depth="2">🌓 主题切换 - 深色/浅色模式</n-text>
          </n-flex>
        </div>
        
        <n-divider />
        
        <!-- 技术栈 -->
        <div>
          <n-text strong style="font-size: 16px; display: block; margin-bottom: 12px">
            🛠️ 技术栈
          </n-text>
          <n-flex wrap style="gap: 8px">
            <n-tag type="info">Vue 3</n-tag>
            <n-tag type="info">TypeScript</n-tag>
            <n-tag type="info">Naive UI</n-tag>
            <n-tag type="info">Vite</n-tag>
            <n-tag type="info">Tauri</n-tag>
          </n-flex>
        </div>
        
        <n-divider />
        
        <!-- 项目链接 -->
        <div>
          <n-text strong style="font-size: 16px; display: block; margin-bottom: 12px">
            🔗 项目链接
          </n-text>
          <n-flex vertical style="gap: 8px">
            <n-button 
              text 
              tag="a" 
              href="https://github.com/Windsland52/MAALogAnalyzer" 
              target="_blank"
              type="primary"
            >
              <template #icon>
                <n-icon><github-outlined /></n-icon>
              </template>
              MAA Log Analyzer
            </n-button>
            <n-text depth="3" style="font-size: 12px">
              基于 MaaFramework 开发的日志分析工具
            </n-text>
          </n-flex>
        </div>
        
        <n-divider />
        
        <!-- 版本信息 -->
        <n-flex justify="space-between" align="center">
          <n-text depth="3" style="font-size: 12px">
            Version 1.1.0
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            © 2025
          </n-text>
        </n-flex>
      </n-flex>
    </n-modal>
  </div>
</template>