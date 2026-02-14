<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import { NSplit, NCard, NFlex, NButton, NIcon, NDropdown, NModal, NText, NDivider, NTag, NProgress, NSelect, useMessage } from 'naive-ui'
import ProcessView from './views/ProcessView.vue'
import DetailView from './views/DetailView.vue'
import TextSearchView from './views/TextSearchView.vue'
import NodeStatisticsView from './views/NodeStatisticsView.vue'
import { LogParser } from './utils/logParser'
import { getErrorMessage } from './utils/errorHandler'
import type { TaskInfo, NodeInfo } from './types'
import { BulbOutlined, BulbFilled, FileSearchOutlined, BarChartOutlined, ColumnHeightOutlined, InfoCircleOutlined, GithubOutlined, DashboardOutlined } from '@vicons/antd'

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
type ViewMode = 'analysis' | 'search' | 'statistics' | 'split'
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
    label: '节点统计',
    key: 'statistics' as ViewMode,
    icon: () => h(DashboardOutlined)
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
const selectedRecognitionIndex = ref<number | null>(null)
const selectedNestedIndex = ref<number | null>(null)
const loading = ref(false)
const parseProgress = ref(0)
const showParsingModal = ref(false)
const showFileLoadingModal = ref(false)

// 过滤器状态
const selectedProcessId = ref<string>('')
const selectedThreadId = ref<string>('')
const availableProcessIds = ref<string[]>([])
const availableThreadIds = ref<string[]>([])

// DetailView 折叠控制
const detailViewCollapsed = ref(false)
const detailViewSavedSize = ref(0.6)

// 切换 DetailView 折叠状态
const toggleDetailView = () => {
  if (detailViewCollapsed.value) {
    // 展开：恢复保存的大小
    splitSize.value = detailViewSavedSize.value
    detailViewCollapsed.value = false
  } else {
    // 折叠：保存当前大小，然后完全隐藏
    detailViewSavedSize.value = splitSize.value
    splitSize.value = 1  // 左侧占100%，右侧完全隐藏
    detailViewCollapsed.value = true
  }
}

// 消息提示
const message = useMessage()

// 关于对话框
const showAboutModal = ref(false)

// 处理文件上传
const handleFileUpload = async (file: File) => {
  loading.value = true
  try {
    const content = await file.text()
    await processLogContent(content)
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理文件内容
const handleContentUpload = async (content: string) => {
  loading.value = true
  try {
    await processLogContent(content)
  } catch (error) {
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    loading.value = false
  }
}

// 处理日志内容
const processLogContent = async (content: string) => {
  // 清空所有状态，确保重新上传文件时不会显示旧数据
  tasks.value = []
  selectedTask.value = null
  selectedNode.value = null
  selectedRecognitionIndex.value = null
  selectedNestedIndex.value = null
  availableProcessIds.value = []
  availableThreadIds.value = []
  selectedProcessId.value = ''
  selectedThreadId.value = ''

  // 显示解析进度模态框
  showParsingModal.value = true
  parseProgress.value = 0

  try {
    // 异步解析，带进度回调
    await parser.parseFile(content, (progress) => {
      parseProgress.value = progress.percentage
    })

    // 解析完成，获取任务
    tasks.value = parser.getTasks()

    // 收集可用的进程和线程ID
    availableProcessIds.value = parser.getProcessIds()
    availableThreadIds.value = parser.getThreadIds()

    // 清除过滤器
    selectedProcessId.value = ''
    selectedThreadId.value = ''

    if (tasks.value.length > 0) {
      selectedTask.value = tasks.value[0]
    }
  } finally {
    // 关闭进度模态框
    showParsingModal.value = false
    parseProgress.value = 0
  }
}

// 选择任务
const handleSelectTask = (task: TaskInfo) => {
  selectedTask.value = task
  selectedNode.value = null
  selectedRecognitionIndex.value = null
  selectedNestedIndex.value = null
}

// 选择节点
const handleSelectNode = (node: NodeInfo) => {
  selectedNode.value = node
  selectedRecognitionIndex.value = null
  selectedNestedIndex.value = null
}

// 选择识别尝试
const handleSelectRecognition = (node: NodeInfo, attemptIndex: number) => {
  selectedNode.value = node
  selectedRecognitionIndex.value = attemptIndex
  selectedNestedIndex.value = null
}

// 选择嵌套节点
const handleSelectNested = (node: NodeInfo, attemptIndex: number, nestedIndex: number) => {
  selectedNode.value = node
  selectedRecognitionIndex.value = attemptIndex
  selectedNestedIndex.value = nestedIndex
}

// 过滤任务列表
const filteredTasks = computed(() => {
  return tasks.value.filter(task => {
    if (selectedProcessId.value !== '') {
      const processId = parser.getTaskProcessId(task.task_id)
      if (processId !== selectedProcessId.value) return false
    }
    if (selectedThreadId.value !== '') {
      const threadId = parser.getTaskThreadId(task.task_id)
      if (threadId !== selectedThreadId.value) return false
    }
    return true
  })
})

// 清除过滤器
const clearFilters = () => {
  selectedProcessId.value = ''
  selectedThreadId.value = ''
}

// 进程ID选项（根据已选线程动态过滤）
const processIdOptions = computed(() => {
  let validProcessIds = availableProcessIds.value

  // 如果选择了线程，只显示该线程下有任务的进程
  if (selectedThreadId.value !== '') {
    validProcessIds = validProcessIds.filter(processId => {
      return tasks.value.some(task => {
        const taskProcessId = parser.getTaskProcessId(task.task_id)
        const taskThreadId = parser.getTaskThreadId(task.task_id)
        return taskProcessId === processId && taskThreadId === selectedThreadId.value
      })
    })
  }

  return [
    { label: '全部进程', value: '' },
    ...validProcessIds.map(id => ({
      label: `进程: ${id}`,
      value: id
    }))
  ]
})

// 线程ID选项（根据已选进程动态过滤）
const threadIdOptions = computed(() => {
  let validThreadIds = availableThreadIds.value

  // 如果选择了进程，只显示该进程下有任务的线程
  if (selectedProcessId.value !== '') {
    validThreadIds = validThreadIds.filter(threadId => {
      return tasks.value.some(task => {
        const taskProcessId = parser.getTaskProcessId(task.task_id)
        const taskThreadId = parser.getTaskThreadId(task.task_id)
        return taskThreadId === threadId && taskProcessId === selectedProcessId.value
      })
    })
  }

  return [
    { label: '全部线程', value: '' },
    ...validThreadIds.map(id => ({
      label: `线程: ${id}`,
      value: id
    }))
  ]
})

// 监听过滤后的任务列表变化，处理选中任务的有效性
watch(filteredTasks, (newTasks) => {
  if (selectedTask.value && !newTasks.find(t => t.task_id === selectedTask.value!.task_id)) {
    // 当前选中的任务被过滤掉了
    if (newTasks.length > 0) {
      handleSelectTask(newTasks[0])
    } else {
      selectedTask.value = null
      selectedNode.value = null
    }
  }
})

// 处理文件加载开始
const handleFileLoadingStart = () => {
  // 移除当前焦点，避免 aria-hidden 警告
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }
  showFileLoadingModal.value = true
}

// 处理文件加载结束
const handleFileLoadingEnd = () => {
  showFileLoadingModal.value = false
}

// 临时调试函数 - 分析内存占用
const analyzeMemory = () => {
  console.log('=== 数据统计 ===')
  console.log('任务数量:', tasks.value.length)

  const totalNodes = tasks.value.reduce((sum, t) => sum + t.nodes.length, 0)
  console.log('总节点数:', totalNodes)

  const totalAttempts = tasks.value.reduce((sum, t) =>
    sum + t.nodes.reduce((s, n) => s + (n.recognition_attempts?.length || 0), 0), 0)
  console.log('总识别尝试数:', totalAttempts)

  // 检查字符串重复
  const nodeNames = new Set()
  const timestamps = new Set()
  tasks.value.forEach(t => {
    t.nodes.forEach(n => {
      nodeNames.add(n.name)
      timestamps.add(n.timestamp)
      n.recognition_attempts?.forEach(a => {
        nodeNames.add(a.name)
        timestamps.add(a.timestamp)
      })
    })
  })
  console.log('唯一节点名称数:', nodeNames.size)
  console.log('唯一时间戳数:', timestamps.size)
  console.log('字符串重复率:', ((totalNodes + totalAttempts - nodeNames.size) / (totalNodes + totalAttempts) * 100).toFixed(1) + '%')

  // 采样
  console.log('\n=== 采样数据 ===')
  console.log('第一个任务:', tasks.value[0])
  console.log('第一个节点:', tasks.value[0]?.nodes[0])
}

// 暴露到 window 以便在控制台调用
if (typeof window !== 'undefined') {
  (window as any).analyzeMemory = analyzeMemory
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
                  <dashboard-outlined v-else-if="viewMode === 'statistics'" />
                  <column-height-outlined v-else />
                </n-icon>
              </template>
              {{ currentViewLabel }}
            </n-button>
          </n-dropdown>

          <!-- 进程过滤器 -->
          <n-select
            v-if="availableProcessIds.length > 0"
            v-model:value="selectedProcessId"
            :options="processIdOptions"
            placeholder="选择进程"
            clearable
            size="small"
            style="width: 150px"
          />

          <!-- 线程过滤器 -->
          <n-select
            v-if="availableThreadIds.length > 0"
            v-model:value="selectedThreadId"
            :options="threadIdOptions"
            placeholder="选择线程"
            clearable
            size="small"
            style="width: 150px"
          />

          <!-- 清除过滤按钮 -->
          <n-button
            v-if="selectedProcessId || selectedThreadId"
            @click="clearFilters"
            size="small"
            secondary
          >
            清除过滤
          </n-button>
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
    <div style="flex: 1; min-height: 0">
      <!-- 日志分析模式 -->
      <div v-show="viewMode === 'analysis'" style="height: 100%">
        <n-split
          v-model:size="splitSize"
          :max="1"
          :min="0.4"
          style="height: 100%"
        >
          <template #1>
            <process-view
              :tasks="filteredTasks"
              :selected-task="selectedTask"
              :loading="loading"
              :parser="parser"
              :detail-view-collapsed="detailViewCollapsed"
              :on-expand-detail-view="toggleDetailView"
              @select-task="handleSelectTask"
              @upload-file="handleFileUpload"
              @upload-content="handleContentUpload"
              @select-node="handleSelectNode"
              @select-recognition="handleSelectRecognition"
              @select-nested="handleSelectNested"
              @file-loading-start="handleFileLoadingStart"
              @file-loading-end="handleFileLoadingEnd"
            />
          </template>
          <template #2>
            <n-card size="small" title="节点详情" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
              <!-- 折叠按钮 - 左边缘中间 -->
              <n-button
                circle
                size="small"
                @click="toggleDetailView"
                style="position: absolute; left: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
              >
                <template #icon>
                  <n-icon>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                      <!-- 展开时显示向右箭头，表示点击后向右折叠 -->
                      <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                    </svg>
                  </n-icon>
                </template>
              </n-button>
              <detail-view
                :selected-node="selectedNode"
                :selected-task="selectedTask"
                :selected-recognition-index="selectedRecognitionIndex"
                :selected-nested-index="selectedNestedIndex"
                style="height: 100%"
              />
            </n-card>
          </template>
        </n-split>
      </div>

      <!-- 文本搜索模式（独立显示，占据整个屏幕） -->
      <div v-show="viewMode === 'search'" style="height: 100%">
        <text-search-view :is-dark="isDark" style="height: 100%" />
      </div>

      <!-- 节点统计模式（独立显示，占据整个屏幕） -->
      <div v-show="viewMode === 'statistics'" style="height: 100%">
        <node-statistics-view :tasks="tasks" style="height: 100%" />
      </div>

      <!-- 分屏模式 -->
      <div v-show="viewMode === 'split'" style="height: 100%">
        <n-split
          direction="vertical"
          :default-size="0.5"
          :min="0.2"
          :max="0.8"
          style="height: 100%"
        >
          <!-- 上半部分：日志分析 -->
          <template #1>
            <n-split
              v-model:size="splitSize"
              :max="1"
              :min="0.4"
              style="height: 100%"
            >
              <template #1>
                <process-view
                  :tasks="filteredTasks"
                  :selected-task="selectedTask"
                  :loading="loading"
                  :parser="parser"
                  :detail-view-collapsed="detailViewCollapsed"
                  :on-expand-detail-view="toggleDetailView"
                  @select-task="handleSelectTask"
                  @upload-file="handleFileUpload"
                  @upload-content="handleContentUpload"
                  @select-node="handleSelectNode"
                  @select-recognition="handleSelectRecognition"
                  @select-nested="handleSelectNested"
                  @file-loading-start="handleFileLoadingStart"
                  @file-loading-end="handleFileLoadingEnd"
                />
              </template>
              <template #2>
                <n-card size="small" title="节点详情" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
                  <!-- 折叠按钮 - 左边缘中间 -->
                  <n-button
                    circle
                    size="small"
                    @click="toggleDetailView"
                    style="position: absolute; left: -12px; top: 50%; transform: translateY(-50%); z-index: 100; box-shadow: 0 2px 8px rgba(0,0,0,0.15)"
                  >
                    <template #icon>
                      <n-icon>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                          <!-- 展开时显示向右箭头，表示点击后向右折叠 -->
                          <path fill="currentColor" d="M8.59 16.59L10 18l6-6l-6-6l-1.41 1.41L13.17 12z"/>
                        </svg>
                      </n-icon>
                    </template>
                  </n-button>
                  <detail-view
                    :selected-node="selectedNode"
                    :selected-task="selectedTask"
                    :selected-recognition-index="selectedRecognitionIndex"
                    :selected-nested-index="selectedNestedIndex"
                    style="height: 100%"
                  />
                </n-card>
              </template>
            </n-split>
          </template>

          <!-- 下半部分：文本搜索 -->
          <template #2>
            <text-search-view v-if="viewMode === 'split'" :is-dark="isDark" style="height: 100%" />
          </template>
        </n-split>
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
            Version 2.1.0
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            © 2025
          </n-text>
        </n-flex>
      </n-flex>
    </n-modal>

    <!-- 文件读取加载对话框 -->
    <n-modal
      v-model:show="showFileLoadingModal"
      preset="card"
      title="正在读取日志文件"
      style="width: 500px"
      :bordered="false"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <n-flex vertical style="gap: 20px; padding: 20px 0">
        <n-text style="text-align: center; font-size: 16px">
          正在读取文件内容...
        </n-text>
        <n-progress
          type="line"
          :percentage="100"
          :show-indicator="false"
          :height="24"
          status="info"
          processing
        />
        <n-text depth="3" style="text-align: center; font-size: 13px">
          请稍候，文件读取完成后将开始解析
        </n-text>
      </n-flex>
    </n-modal>

    <!-- 解析进度对话框 -->
    <n-modal
      v-model:show="showParsingModal"
      preset="card"
      title="正在解析日志文件"
      style="width: 500px"
      :bordered="false"
      :closable="false"
      :mask-closable="false"
      :close-on-esc="false"
    >
      <n-flex vertical style="gap: 20px; padding: 20px 0">
        <n-text style="text-align: center; font-size: 16px">
          解析进度：{{ parseProgress }}%
        </n-text>
        <n-progress
          type="line"
          :percentage="parseProgress"
          :show-indicator="false"
          :height="24"
          status="success"
        />
        <n-text depth="3" style="text-align: center; font-size: 13px">
          正在分块处理日志，请稍候...
        </n-text>
      </n-flex>
    </n-modal>
  </div>
</template>
