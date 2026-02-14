<script setup lang="ts">
import { ref, computed, h } from 'vue'
import {
  NCard, NDataTable, NInput, NSelect, NFlex, NText, NTag, NEmpty, NProgress, NRadioGroup, NRadioButton,
  NUpload, NUploadDragger, NIcon, NButton, NModal, useMessage,
  type DataTableColumns, type UploadFileInfo
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined } from '@vicons/antd'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import type { TaskInfo } from '../types'
import { NodeStatisticsAnalyzer, type NodeStatistics, type RecognitionActionStatistics } from '../utils/nodeStatistics'
import { formatDuration } from '../utils/formatDuration'
import { LogParser } from '../utils/logParser'
import { getErrorMessage } from '../utils/errorHandler'
import { isTauri, openLogFileDialog } from '../utils/fileDialog'

// 注册 ECharts 组件
use([CanvasRenderer, PieChart, TitleComponent, TooltipComponent, LegendComponent])

const props = defineProps<{
  tasks: TaskInfo[]
}>()

// 消息提示
const message = useMessage()

// 本地任务数据（用于独立上传）
const localTasks = ref<TaskInfo[]>([])

// 是否使用本地数据的标志
const useLocalData = ref(false)

// 上传锁，防止并发上传
const isUploading = ref(false)

// 加载状态
const loading = ref(false)
const parseProgress = ref(0)
const showParsingModal = ref(false)
const showFileLoadingModal = ref(false)

// 是否在 Tauri 环境
const isInTauri = ref(isTauri())

// 上传组件的 key，用于强制重置
const uploadKey = ref(0)

// 使用本地数据还是 props 数据
const effectiveTasks = computed(() => {
  return useLocalData.value ? localTasks.value : props.tasks
})

// 统计模式
type StatMode = 'node' | 'recognition-action'
const statMode = ref<StatMode>('node')

// 饼图维度选择
type NodeChartDimension = 'count' | 'totalDuration' | 'avgDuration' | 'maxDuration'
type RecognitionActionChartDimension = 'avgRecognitionDuration' | 'maxRecognitionDuration' | 'avgActionDuration' | 'maxActionDuration' | 'avgRecognitionAttempts'
const nodeChartDimension = ref<NodeChartDimension>('count')
const recognitionActionChartDimension = ref<RecognitionActionChartDimension>('avgActionDuration')

// 搜索关键词
const searchKeyword = ref('')

// 处理文件上传
const handleFileUpload = async (file: File) => {
  // 如果正在上传，忽略新的上传请求
  if (isUploading.value) {
    console.log('[上传] 已有上传任务在进行中')
    message.warning('正在处理上一个文件，请稍候')
    return
  }

  console.log('[上传] 开始上传文件:', file.name)
  // 立即设置上传锁，防止竞态条件
  isUploading.value = true
  loading.value = true

  try {
    console.log('[上传] 读取文件内容...')
    const content = await file.text()
    console.log('[上传] 文件读取完成，开始解析...')
    await processLogContent(content)
    console.log('[上传] 解析完成')
  } catch (error) {
    console.error('[上传] 上传失败:', error)
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    console.log('[上传] 释放上传锁')
    loading.value = false
    isUploading.value = false
  }
}

// 处理文件内容
const processLogContent = async (content: string) => {
  // 显示解析进度模态框
  showParsingModal.value = true
  parseProgress.value = 0

  try {
    // 创建新的解析器实例
    const parser = new LogParser()

    // 异步解析，带进度回调
    await parser.parseFile(content, (progress) => {
      parseProgress.value = progress.percentage
    })

    // 获取新数据
    const newTasks = parser.getTasks()

    // 先设置标志，再更新数据，避免闪烁
    if (!useLocalData.value) {
      useLocalData.value = true
    }

    // 更新数据
    localTasks.value = newTasks

    if (localTasks.value.length === 0) {
      message.warning('未找到任务数据，请检查日志文件格式')
    }

    // 等待 Vue 完成更新
    await new Promise(resolve => setTimeout(resolve, 0))

    // 重置上传组件，清除文件选择缓存
    uploadKey.value++
  } finally {
    // 关闭进度模态框
    showParsingModal.value = false
    parseProgress.value = 0
  }
}

// 处理 Naive UI 上传
const handleNaiveUpload = async (options: { file: UploadFileInfo }) => {
  const file = options.file.file
  if (file) {
    await handleFileUpload(file as File)
  }
  return false // 阻止默认上传行为
}

// 处理 Tauri 文件选择
const handleTauriFileSelect = async () => {
  // 如果正在上传，忽略新的上传请求
  if (isUploading.value) {
    message.warning('正在处理上一个文件，请稍候')
    return
  }

  // 立即设置上传锁，防止竞态条件
  isUploading.value = true
  showFileLoadingModal.value = true

  try {
    const content = await openLogFileDialog()
    if (content) {
      showFileLoadingModal.value = false
      await processLogContent(content)
    } else {
      showFileLoadingModal.value = false
    }
  } catch (error) {
    showFileLoadingModal.value = false
    message.error(getErrorMessage(error), { duration: 5000 })
  } finally {
    isUploading.value = false
  }
}

// 计算节点统计数据
const nodeStatistics = computed(() => {
  if (effectiveTasks.value.length === 0) return []

  let stats = NodeStatisticsAnalyzer.analyze(effectiveTasks.value)

  // 搜索过滤
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    stats = stats.filter(s => s.name.toLowerCase().includes(keyword))
  }

  return stats
})

// 计算识别和动作统计数据
const recognitionActionStatistics = computed(() => {
  if (effectiveTasks.value.length === 0) return []

  let stats = NodeStatisticsAnalyzer.analyzeRecognitionAction(effectiveTasks.value)

  // 搜索过滤
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase()
    stats = stats.filter(s => s.name.toLowerCase().includes(keyword))
  }

  return stats
})

// 当前显示的统计数据
const statistics = computed(() => {
  return statMode.value === 'node' ? nodeStatistics.value : recognitionActionStatistics.value
})

// 节点统计表格列定义
const nodeColumns: DataTableColumns<NodeStatistics> = [
  {
    title: '节点名称',
    key: 'name',
    width: 250,
    ellipsis: {
      tooltip: true
    },
    render: (row) => row.name
  },
  {
    title: '执行次数',
    key: 'count',
    width: 100,
    align: 'center',
    sorter: (a, b) => a.count - b.count,
    render: (row) => row.count
  },
  {
    title: '平均耗时',
    key: 'avgDuration',
    width: 120,
    align: 'right',
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.avgDuration - b.avgDuration,
    render: (row) => formatDuration(row.avgDuration)
  },
  {
    title: '最小耗时',
    key: 'minDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.minDuration - b.minDuration,
    render: (row) => formatDuration(row.minDuration)
  },
  {
    title: '最大耗时',
    key: 'maxDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.maxDuration - b.maxDuration,
    render: (row) => formatDuration(row.maxDuration)
  },
  {
    title: '总耗时',
    key: 'totalDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.totalDuration - b.totalDuration,
    render: (row) => formatDuration(row.totalDuration)
  },
  {
    title: '成功率',
    key: 'successRate',
    width: 150,
    align: 'center',
    sorter: (a, b) => a.successRate - b.successRate,
    render: (row) => {
      const rate = row.successRate
      const color = rate >= 95 ? 'success' : rate >= 80 ? 'warning' : 'error'
      return h(NProgress, {
        type: 'line',
        percentage: rate,
        status: color,
        showIndicator: true,
        height: 18,
        borderRadius: 4
      })
    }
  },
  {
    title: '成功/失败',
    key: 'status',
    width: 120,
    align: 'center',
    render: (row) => {
      return h(NFlex, { justify: 'center', align: 'center', style: { gap: '4px' } }, () => [
        h(NTag, { type: 'success', size: 'small' }, () => row.successCount),
        h(NText, { depth: 3 }, () => '/'),
        h(NTag, { type: 'error', size: 'small' }, () => row.failCount)
      ])
    }
  }
]

// 识别和动作统计表格列定义
const recognitionActionColumns: DataTableColumns<RecognitionActionStatistics> = [
  {
    title: '节点名称',
    key: 'name',
    width: 200,
    ellipsis: {
      tooltip: true
    },
    render: (row) => row.name
  },
  {
    title: '执行次数',
    key: 'count',
    width: 90,
    align: 'center',
    sorter: (a, b) => a.count - b.count,
    render: (row) => row.count
  },
  {
    title: '平均识别尝试',
    key: 'avgRecognitionAttempts',
    width: 110,
    align: 'center',
    sorter: (a, b) => a.avgRecognitionAttempts - b.avgRecognitionAttempts,
    render: (row) => row.avgRecognitionAttempts.toFixed(1)
  },
  {
    title: '平均识别耗时',
    key: 'avgRecognitionDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.avgRecognitionDuration - b.avgRecognitionDuration,
    render: (row) => row.recognitionCount > 0 ? formatDuration(row.avgRecognitionDuration) : '-'
  },
  {
    title: '最大识别耗时',
    key: 'maxRecognitionDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.maxRecognitionDuration - b.maxRecognitionDuration,
    render: (row) => row.recognitionCount > 0 ? formatDuration(row.maxRecognitionDuration) : '-'
  },
  {
    title: '平均动作耗时',
    key: 'avgActionDuration',
    width: 120,
    align: 'right',
    defaultSortOrder: 'descend',
    sorter: (a, b) => a.avgActionDuration - b.avgActionDuration,
    render: (row) => row.actionCount > 0 ? formatDuration(row.avgActionDuration) : '-'
  },
  {
    title: '最大动作耗时',
    key: 'maxActionDuration',
    width: 120,
    align: 'right',
    sorter: (a, b) => a.maxActionDuration - b.maxActionDuration,
    render: (row) => row.actionCount > 0 ? formatDuration(row.maxActionDuration) : '-'
  },
  {
    title: '成功率',
    key: 'successRate',
    width: 130,
    align: 'center',
    sorter: (a, b) => a.successRate - b.successRate,
    render: (row) => {
      const rate = row.successRate
      const color = rate >= 95 ? 'success' : rate >= 80 ? 'warning' : 'error'
      return h(NProgress, {
        type: 'line',
        percentage: rate,
        status: color,
        showIndicator: true,
        height: 18,
        borderRadius: 4
      })
    }
  }
]

// 当前显示的表格列
const columns = computed(() => {
  return statMode.value === 'node' ? nodeColumns : recognitionActionColumns
})

// 节点统计摘要
const nodeSummary = computed(() => {
  if (nodeStatistics.value.length === 0) return null

  const totalNodes = nodeStatistics.value.reduce((sum, s) => sum + s.count, 0)
  const totalDuration = nodeStatistics.value.reduce((sum, s) => sum + s.totalDuration, 0)
  const avgDuration = totalDuration / totalNodes
  const slowestNode = nodeStatistics.value[0]

  return {
    totalNodes,
    totalDuration,
    avgDuration,
    slowestNode,
    uniqueNodes: nodeStatistics.value.length
  }
})

// 识别和动作统计摘要
const recognitionActionSummary = computed(() => {
  if (recognitionActionStatistics.value.length === 0) return null

  const totalNodes = recognitionActionStatistics.value.reduce((sum, s) => sum + s.count, 0)
  const totalRecognitionDuration = recognitionActionStatistics.value.reduce((sum, s) => sum + s.totalRecognitionDuration, 0)
  const totalActionDuration = recognitionActionStatistics.value.reduce((sum, s) => sum + s.totalActionDuration, 0)
  const totalRecognitionAttempts = recognitionActionStatistics.value.reduce((sum, s) => sum + s.totalRecognitionAttempts, 0)

  const avgRecognitionDuration = totalRecognitionDuration / totalNodes
  const avgActionDuration = totalActionDuration / totalNodes
  const avgRecognitionAttempts = totalRecognitionAttempts / totalNodes

  const slowestActionNode = [...recognitionActionStatistics.value].sort((a, b) => b.avgActionDuration - a.avgActionDuration)[0]

  return {
    totalNodes,
    avgRecognitionDuration,
    avgActionDuration,
    avgRecognitionAttempts,
    slowestActionNode,
    uniqueNodes: recognitionActionStatistics.value.length
  }
})

// 节点统计饼图数据（根据选择的维度）
const nodeChartOption = computed(() => {
  if (nodeStatistics.value.length === 0) return null

  const dimension = nodeChartDimension.value
  let title = ''
  let formatter: string | ((params: any) => string) = ''
  let sortFn: (a: NodeStatistics, b: NodeStatistics) => number
  let valueFn: (item: NodeStatistics) => number

  switch (dimension) {
    case 'count':
      title = '节点执行次数分布 (Top 10)'
      formatter = '{b}: {c} 次 ({d}%)'
      sortFn = (a, b) => b.count - a.count
      valueFn = (item) => item.count
      break
    case 'totalDuration':
      title = '节点总耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.totalDuration - a.totalDuration
      valueFn = (item) => item.totalDuration
      break
    case 'avgDuration':
      title = '节点平均耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgDuration - a.avgDuration
      valueFn = (item) => item.avgDuration
      break
    case 'maxDuration':
      title = '节点最大耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxDuration - a.maxDuration
      valueFn = (item) => item.maxDuration
      break
  }

  const top10 = nodeStatistics.value
    .slice()
    .sort(sortFn)
    .slice(0, 10)

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: {
        fontSize: 14
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: formatter
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle',
      textStyle: {
        fontSize: 12
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            formatter: (params: any) => {
              if (dimension === 'count') {
                return `${params.name}\n${params.value} 次`
              } else {
                return `${params.name}\n${formatDuration(params.value)}`
              }
            }
          }
        },
        labelLine: {
          show: false
        },
        data: top10.map(item => ({
          name: item.name,
          value: valueFn(item)
        }))
      }
    ]
  }
})

// 识别/动作统计饼图数据（根据选择的维度）
const recognitionActionChartOption = computed(() => {
  if (recognitionActionStatistics.value.length === 0) return null

  const dimension = recognitionActionChartDimension.value
  let title = ''
  let formatter: string | ((params: any) => string) = ''
  let sortFn: (a: RecognitionActionStatistics, b: RecognitionActionStatistics) => number
  let valueFn: (item: RecognitionActionStatistics) => number
  let filterFn: (item: RecognitionActionStatistics) => boolean = () => true

  switch (dimension) {
    case 'avgRecognitionDuration':
      title = '平均识别耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgRecognitionDuration - a.avgRecognitionDuration
      valueFn = (item) => item.avgRecognitionDuration
      filterFn = (item) => item.recognitionCount > 0
      break
    case 'maxRecognitionDuration':
      title = '最大识别耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxRecognitionDuration - a.maxRecognitionDuration
      valueFn = (item) => item.maxRecognitionDuration
      filterFn = (item) => item.recognitionCount > 0
      break
    case 'avgActionDuration':
      title = '平均动作耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.avgActionDuration - a.avgActionDuration
      valueFn = (item) => item.avgActionDuration
      filterFn = (item) => item.actionCount > 0
      break
    case 'maxActionDuration':
      title = '最大动作耗时分布 (Top 10)'
      formatter = (params: any) => `${params.name}: ${formatDuration(params.value)} (${params.percent}%)`
      sortFn = (a, b) => b.maxActionDuration - a.maxActionDuration
      valueFn = (item) => item.maxActionDuration
      filterFn = (item) => item.actionCount > 0
      break
    case 'avgRecognitionAttempts':
      title = '平均识别尝试次数分布 (Top 10)'
      formatter = '{b}: {c} 次 ({d}%)'
      sortFn = (a, b) => b.avgRecognitionAttempts - a.avgRecognitionAttempts
      valueFn = (item) => item.avgRecognitionAttempts
      break
  }

  const top10 = recognitionActionStatistics.value
    .slice()
    .filter(filterFn)
    .sort(sortFn)
    .slice(0, 10)

  if (top10.length === 0) return null

  return {
    title: {
      text: title,
      left: 'center',
      textStyle: {
        fontSize: 14
      }
    },
    tooltip: {
      trigger: 'item',
      formatter: formatter
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle',
      textStyle: {
        fontSize: 12
      }
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold',
            formatter: (params: any) => {
              if (dimension === 'avgRecognitionAttempts') {
                return `${params.name}\n${params.value.toFixed(1)} 次`
              } else {
                return `${params.name}\n${formatDuration(params.value)}`
              }
            }
          }
        },
        labelLine: {
          show: false
        },
        data: top10.map(item => ({
          name: item.name,
          value: valueFn(item)
        }))
      }
    ]
  }
})
</script>

<template>
  <n-card
    size="small"
    title="节点性能统计"
    style="height: 100%; display: flex; flex-direction: column"
    content-style="padding: 16px; flex: 1; min-height: 0; display: flex; flex-direction: column"
  >
    <template #header-extra>
      <n-flex align="center" style="gap: 12px">
        <n-radio-group v-model:value="statMode" size="small">
          <n-radio-button value="node">节点统计</n-radio-button>
          <n-radio-button value="recognition-action">识别/动作统计</n-radio-button>
        </n-radio-group>

        <!-- 节点统计维度选择 -->
        <n-select
          v-if="statMode === 'node'"
          v-model:value="nodeChartDimension"
          :options="[
            { label: '执行次数', value: 'count' },
            { label: '总耗时', value: 'totalDuration' },
            { label: '平均耗时', value: 'avgDuration' },
            { label: '最大耗时', value: 'maxDuration' }
          ]"
          size="small"
          style="width: 120px"
        />

        <!-- 识别/动作统计维度选择 -->
        <n-select
          v-if="statMode === 'recognition-action'"
          v-model:value="recognitionActionChartDimension"
          :options="[
            { label: '平均识别耗时', value: 'avgRecognitionDuration' },
            { label: '最大识别耗时', value: 'maxRecognitionDuration' },
            { label: '平均动作耗时', value: 'avgActionDuration' },
            { label: '最大动作耗时', value: 'maxActionDuration' },
            { label: '平均识别尝试', value: 'avgRecognitionAttempts' }
          ]"
          size="small"
          style="width: 140px"
        />

        <n-input
          v-model:value="searchKeyword"
          placeholder="搜索节点名称"
          clearable
          style="width: 200px"
          size="small"
        />

        <!-- 上传按钮（Tauri环境） -->
        <n-button
          v-if="isInTauri"
          size="small"
          circle
          @click="handleTauriFileSelect"
          :loading="loading"
        >
          <template #icon>
            <n-icon>
              <folder-open-outlined />
            </n-icon>
          </template>
        </n-button>

        <!-- 上传按钮（Web环境） -->
        <n-upload
          v-else
          :key="uploadKey"
          :custom-request="handleNaiveUpload"
          :show-file-list="false"
          accept=".log,.txt"
        >
          <n-button size="small" circle :loading="loading">
            <template #icon>
              <n-icon>
                <cloud-upload-outlined />
              </n-icon>
            </template>
          </n-button>
        </n-upload>
      </n-flex>
    </template>

    <!-- 节点统计摘要 -->
    <n-card
      v-if="statMode === 'node' && nodeSummary"
      size="small"
      style="margin-bottom: 16px"
      :bordered="false"
    >
      <n-flex justify="space-around" align="center">
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">节点类型</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ nodeSummary.uniqueNodes }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">总执行次数</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ nodeSummary.totalNodes }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">平均耗时</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ formatDuration(nodeSummary.avgDuration) }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">总耗时</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ formatDuration(nodeSummary.totalDuration) }}
          </n-text>
        </div>
        <div style="text-align: center; max-width: 200px">
          <n-text depth="3" style="font-size: 12px">最慢节点</n-text>
          <n-text
            strong
            style="display: block; font-size: 14px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
            :title="nodeSummary.slowestNode.name"
          >
            {{ nodeSummary.slowestNode.name }}
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            {{ formatDuration(nodeSummary.slowestNode.avgDuration) }}
          </n-text>
        </div>
      </n-flex>
    </n-card>

    <!-- 识别和动作统计摘要 -->
    <n-card
      v-if="statMode === 'recognition-action' && recognitionActionSummary"
      size="small"
      style="margin-bottom: 16px"
      :bordered="false"
    >
      <n-flex justify="space-around" align="center">
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">节点类型</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ recognitionActionSummary.uniqueNodes }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">总执行次数</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ recognitionActionSummary.totalNodes }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">平均识别尝试</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ recognitionActionSummary.avgRecognitionAttempts.toFixed(1) }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">平均识别耗时</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ formatDuration(recognitionActionSummary.avgRecognitionDuration) }}
          </n-text>
        </div>
        <div style="text-align: center">
          <n-text depth="3" style="font-size: 12px">平均动作耗时</n-text>
          <n-text strong style="display: block; font-size: 20px; margin-top: 4px">
            {{ formatDuration(recognitionActionSummary.avgActionDuration) }}
          </n-text>
        </div>
        <div style="text-align: center; max-width: 200px">
          <n-text depth="3" style="font-size: 12px">最慢动作节点</n-text>
          <n-text
            strong
            style="display: block; font-size: 14px; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
            :title="recognitionActionSummary.slowestActionNode.name"
          >
            {{ recognitionActionSummary.slowestActionNode.name }}
          </n-text>
          <n-text depth="3" style="font-size: 12px">
            {{ formatDuration(recognitionActionSummary.slowestActionNode.avgActionDuration) }}
          </n-text>
        </div>
      </n-flex>
    </n-card>

    <!-- 节点统计饼图 -->
    <n-card
      v-if="statMode === 'node' && nodeChartOption"
      size="small"
      style="margin-bottom: 16px"
      :bordered="false"
    >
      <div style="width: 100%; height: 400px">
        <v-chart :option="nodeChartOption" autoresize />
      </div>
    </n-card>

    <!-- 识别/动作统计饼图 -->
    <n-card
      v-if="statMode === 'recognition-action' && recognitionActionChartOption"
      size="small"
      style="margin-bottom: 16px"
      :bordered="false"
    >
      <div style="width: 100%; height: 400px">
        <v-chart :option="recognitionActionChartOption" autoresize />
      </div>
    </n-card>

    <!-- 数据表格 -->
    <div style="flex: 1; min-height: 0; overflow: hidden">
      <n-data-table
        v-if="statistics.length > 0"
        :columns="columns"
        :data="statistics"
        :bordered="false"
        :single-line="false"
        size="small"
        style="height: 100%"
        flex-height
        virtual-scroll
        striped
      />
      <!-- 上传区域 -->
      <div v-else-if="effectiveTasks.length === 0" style="padding: 40px">
        <!-- Tauri 环境 -->
        <div v-if="isInTauri" style="text-align: center">
          <n-button
            size="large"
            type="primary"
            @click="handleTauriFileSelect"
            :loading="loading"
          >
            <template #icon>
              <n-icon>
                <folder-open-outlined />
              </n-icon>
            </template>
            选择日志文件
          </n-button>
          <n-text depth="3" style="display: block; margin-top: 16px">
            点击按钮选择 MAA 日志文件进行分析
          </n-text>
        </div>
        <!-- Web 环境 -->
        <n-upload
          v-else
          :key="uploadKey"
          :custom-request="handleNaiveUpload"
          :show-file-list="false"
          accept=".log,.txt"
        >
          <n-upload-dragger>
            <div style="margin-bottom: 12px">
              <n-icon size="48" :depth="3">
                <cloud-upload-outlined />
              </n-icon>
            </div>
            <n-text style="font-size: 16px">
              点击或拖拽日志文件到此区域上传
            </n-text>
            <n-text depth="3" style="margin-top: 8px">
              支持 .log 和 .txt 格式的 MAA 日志文件
            </n-text>
          </n-upload-dragger>
        </n-upload>
      </div>
      <n-empty
        v-else
        description="暂无数据"
        style="margin-top: 60px"
      />
    </div>

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
  </n-card>
</template>
