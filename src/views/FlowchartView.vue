<script setup lang="ts">
import { ref, computed, watch, nextTick, h, onBeforeUnmount } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import { NSelect, NCard, NFlex, NText, NScrollbar, NTag, NDrawer, NDrawerContent, NButton, NDropdown } from 'naive-ui'
import FlowchartNode from '../components/FlowchartNode.vue'
import FlowchartOrthogonalEdge from '../components/FlowchartOrthogonalEdge.vue'
import { buildFlowchartData } from '../utils/flowchartBuilder'
import type { FlowNodeData, FlowEdgeData } from '../utils/flowchartBuilder'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '../utils/logParser'
import { useIsMobile } from '../composables/useIsMobile'
import { isTauri } from '../utils/platform'
import { getSettings, saveSettings } from '../utils/settings'

const convertFileSrc = (filePath: string) => {
  if (!isTauri()) return filePath
  return `https://asset.localhost/${filePath.replace(/\\/g, '/')}`
}

const props = defineProps<{
  tasks: TaskInfo[]
  parser?: LogParser
  initialTask?: TaskInfo | null
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'navigate-to-node': [task: TaskInfo, node: NodeInfo]
  'upload-file': [file: File]
  'upload-content': [content: string, errorImages?: Map<string, string>, visionImages?: Map<string, string>, waitFreezesImages?: Map<string, string>]
}>()

const { isMobile } = useIsMobile()
const settings = getSettings()

const isMainLogFileName = (name: string) => name === 'maa.log' || name === 'maafw.log'
const isBakLogFileName = (name: string) => name === 'maa.bak.log' || name === 'maafw.bak.log'

// Task selector
const selectedTaskIndex = ref<number | null>(null)

const taskOptions = computed(() =>
  props.tasks.map((t, i) => ({
    label: `#${i + 1} ${t.entry}`,
    value: i,
    status: t.status,
  }))
)

const renderTaskLabel = (option: any) => {
  const color = option.status === 'succeeded' ? '#18a058' : option.status === 'failed' ? '#d03050' : '#f0a020'
  return h('span', { style: 'display: flex; align-items: center; gap: 6px' }, [
    h('span', {
      style: `width: 8px; height: 8px; border-radius: 50%; background: ${color}; flex-shrink: 0`,
    }),
    h('span', {
      style: 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap',
    }, option.label as string),
  ])
}

const selectedTask = computed(() =>
  selectedTaskIndex.value != null ? props.tasks[selectedTaskIndex.value] ?? null : null
)

function findTaskIndex(task: TaskInfo): number {
  // 1) 优先使用对象引用，避免重复 task_id 时跳到同 id 的第一个任务
  const byRef = props.tasks.findIndex(t => t === task)
  if (byRef >= 0) return byRef

  // 2) uuid 在大多数日志中唯一，作为第二匹配条件
  if (task.uuid) {
    const byUuid = props.tasks.findIndex(t => t.uuid === task.uuid)
    if (byUuid >= 0) return byUuid
  }

  // 3) 回退到复合键，减少仅 task_id 匹配的歧义
  return props.tasks.findIndex(t =>
    t.task_id === task.task_id
    && t.start_time === task.start_time
    && t.entry === task.entry
  )
}

// 同步任务列表与外部 initialTask：
// - 优先对齐父组件传入的任务
// - 无法对齐时才回退到第一个任务
watch(
  [() => props.tasks, () => props.initialTask],
  ([tasks, initialTask]) => {
    if (tasks.length === 0) {
      selectedTaskIndex.value = null
      return
    }

    if (initialTask) {
      const idx = findTaskIndex(initialTask)
      if (idx >= 0) {
        selectedTaskIndex.value = idx
        return
      }
    }

    if (selectedTaskIndex.value == null || selectedTaskIndex.value >= tasks.length) {
      selectedTaskIndex.value = 0
    }
  },
  { immediate: true }
)

// 用户主动切换任务时通知父组件
function handleUserTaskSelect(idx: number | null) {
  if (idx == null) return
  selectedTaskIndex.value = idx
  const task = props.tasks[idx]
  if (task) emit('select-task', task)
}

// 定位到日志分析界面
function navigateToNode(info: NodeInfo) {
  const task = selectedTask.value
  if (!task) return
  emit('navigate-to-node', task, info)
}

// 文件上传
const fileInputRef = ref<HTMLInputElement | null>(null)
const folderInputRef = ref<HTMLInputElement | null>(null)

const uploadOptions = [
  { label: '选择文件', key: 'file' },
  { label: '选择文件夹', key: 'folder' },
]

function handleUploadSelect(key: string) {
  if (isTauri()) {
    handleTauriOpen(key)
  } else {
    if (key === 'file') fileInputRef.value?.click()
    else folderInputRef.value?.click()
  }
}

async function handleTauriOpen(key: string) {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog')
    if (key === 'file') {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Log Files', extensions: ['log', 'jsonl', 'txt', 'zip'] }],
        directory: false,
        title: '选择日志文件',
      })
      if (!selected) return
      const { readTextFile } = await import('@tauri-apps/plugin-fs')
      const path = typeof selected === 'string' ? selected : (selected as any).path
      if (path.toLowerCase().endsWith('.zip')) {
        const { readFile } = await import('@tauri-apps/plugin-fs')
        const bytes = await readFile(path)
        emit('upload-file', new File([bytes], path.split(/[/\\]/).pop() || 'file.zip'))
      } else {
        const content = await readTextFile(path)
        emit('upload-content', content)
      }
    } else {
      const selected = await open({ directory: true, title: '选择日志文件夹' })
      if (!selected) return
      const dirPath = typeof selected === 'string' ? selected : (selected as any).path
      const { readDir, readTextFile } = await import('@tauri-apps/plugin-fs')
      const entries = await readDir(dirPath)
      // 查找日志文件
      let content = ''
      const errorImages = new Map<string, string>()
      const visionImages = new Map<string, string>()
      const waitFreezesImages = new Map<string, string>()
      for (const entry of entries) {
        const name = entry.name?.toLowerCase() || ''
        const fullPath = `${dirPath}/${entry.name}`
        if (isBakLogFileName(name)) {
          content = await readTextFile(fullPath) + '\n' + content
        } else if (isMainLogFileName(name)) {
          content += await readTextFile(fullPath)
        } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
          const baseName = entry.name!.replace(/\.(png|jpg)$/i, '')
          if (baseName.endsWith('_wait_freezes')) {
            waitFreezesImages.set(baseName, fullPath)
          } else if (baseName.includes('_vision_')) {
            visionImages.set(baseName, fullPath)
          } else {
            errorImages.set(baseName, fullPath)
          }
        }
      }
      if (content) {
        emit('upload-content', content, errorImages.size > 0 ? errorImages : undefined, visionImages.size > 0 ? visionImages : undefined, waitFreezesImages.size > 0 ? waitFreezesImages : undefined)
      }
    }
  } catch (e) {
    console.error('Tauri open failed:', e)
  }
}

function handleFileInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) emit('upload-file', file)
  input.value = ''
}

async function handleFolderInputChange(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  let bakContent = ''
  let mainContent = ''
  const errorImages = new Map<string, string>()
  const visionImages = new Map<string, string>()
  const waitFreezesImages = new Map<string, string>()

  for (const file of files) {
    const name = file.name.toLowerCase()
    if (isBakLogFileName(name)) {
      bakContent = await file.text()
    } else if (isMainLogFileName(name)) {
      mainContent = await file.text()
    } else if (name.endsWith('.png') || name.endsWith('.jpg')) {
      const baseName = file.name.replace(/\.(png|jpg)$/i, '')
      const url = URL.createObjectURL(file)
      if (baseName.endsWith('_wait_freezes')) {
        waitFreezesImages.set(baseName, url)
      } else if (baseName.includes('_vision_')) {
        visionImages.set(baseName, url)
      } else {
        errorImages.set(baseName, url)
      }
    }
  }

  let content = ''
  if (bakContent) content += bakContent
  if (mainContent) {
    if (content && !content.endsWith('\n')) content += '\n'
    content += mainContent
  }

  if (content) {
    emit('upload-content', content, errorImages.size > 0 ? errorImages : undefined, visionImages.size > 0 ? visionImages : undefined, waitFreezesImages.size > 0 ? waitFreezesImages : undefined)
  }
  input.value = ''
}

// Vue Flow
const { fitView, getNode, setCenter } = useVueFlow('flowchart')

const flowNodes = ref<any[]>([])
const flowEdges = ref<any[]>([])
const layoutRunId = ref(0)
const focusedNodeId = ref<string | null>(null)
const isPlaying = ref(false)
const playbackTimer = ref<number | null>(null)
const playbackIntervalMs = computed<number>({
  get: () => (typeof settings.flowchartPlaybackIntervalMs === 'number' && settings.flowchartPlaybackIntervalMs > 0 ? settings.flowchartPlaybackIntervalMs : 900),
  set: (v) => { settings.flowchartPlaybackIntervalMs = v },
})
const focusZoom = computed<number>({
  get: () => (typeof settings.flowchartFocusZoom === 'number' && settings.flowchartFocusZoom > 0 ? settings.flowchartFocusZoom : 1.0),
  set: (v) => { settings.flowchartFocusZoom = v },
})

const playbackSpeedOptions = [
  { label: '\u6162\u901f 1500ms', value: 1500 },
  { label: '\u6807\u51c6 900ms', value: 900 },
  { label: '\u5feb\u901f 600ms', value: 600 },
  { label: '\u6781\u901f 350ms', value: 350 },
]

const focusZoomOptions = [
  { label: '0.8x', value: 0.8 },
  { label: '1.0x', value: 1.0 },
  { label: '1.2x', value: 1.2 },
  { label: '1.4x', value: 1.4 },
  { label: '1.6x', value: 1.6 },
]

// Navigation panel
const selectedTimelineIndex = ref<number | null>(null)
const showNavDrawer = ref(false)

// Floating popover
const popoverNodeId = ref<string | null>(null)
const popoverPos = ref({ x: 0, y: 0 })

const popoverNodeData = computed(() => {
  if (!popoverNodeId.value) return null
  const node = flowNodes.value.find((n: any) => n.id === popoverNodeId.value)
  return (node?.data as FlowNodeData) ?? null
})

// Execution timeline: one entry per execution in order
const executionTimeline = computed(() => {
  const task = selectedTask.value
  if (!task) return []
  return task.nodes.map((node, index) => ({
    index,
    name: node.name,
    status: node.status,
    timestamp: node.timestamp,
    nodeInfo: node,
  }))
})

// The canvas node ID that corresponds to the selected timeline item
const selectedFlowNodeId = computed(() => {
  if (selectedTimelineIndex.value == null) return null
  const item = executionTimeline.value[selectedTimelineIndex.value]
  return item?.name ?? null
})

// 从 RecognitionAttempt[] 中查找第一张图片
function findImageInAttempts(attempts: import('../types').RecognitionAttempt[]): string | undefined {
  for (let i = attempts.length - 1; i >= 0; i--) {
    const a = attempts[i]
    if (a.vision_image) return a.vision_image
    if (a.error_image) return a.error_image
    if (a.nested_nodes) {
      const img = findImageInAttempts(a.nested_nodes)
      if (img) return img
    }
  }
  return undefined
}

// 查找单个 NodeInfo 的关联截图
function findNodeInfoImage(info: import('../types').NodeInfo, parser?: LogParser): string | undefined {
  // 1. NodeInfo.error_image
  if (info.error_image) return info.error_image

  // 2. recognition_attempts
  if (info.recognition_attempts) {
    const img = findImageInAttempts(info.recognition_attempts)
    if (img) return img
  }

  // 3. nested_recognition_in_action
  if (info.nested_recognition_in_action) {
    const img = findImageInAttempts(info.nested_recognition_in_action)
    if (img) return img
  }

  // 4. nested_action_nodes 的 recognition_attempts
  if (info.nested_action_nodes) {
    for (const group of info.nested_action_nodes) {
      for (const action of group.nested_actions) {
        if (action.recognition_attempts) {
          const img = findImageInAttempts(action.recognition_attempts)
          if (img) return img
        }
      }
    }
  }

  // 5. parser 实时查找（含嵌套节点名）
  if (parser) {
    const nodeErr = parser.findErrorImage(info.timestamp, info.name)
    if (nodeErr) return nodeErr

    if (info.nested_action_nodes) {
      for (const group of info.nested_action_nodes) {
        const groupErr = parser.findErrorImage(group.timestamp, group.name)
        if (groupErr) return groupErr
        for (const action of group.nested_actions) {
          const actionErr = parser.findErrorImage(action.timestamp, action.name)
          if (actionErr) return actionErr
        }
      }
    }

    if (info.recognition_attempts) {
      for (let i = info.recognition_attempts.length - 1; i >= 0; i--) {
        const a = info.recognition_attempts[i]
        const v = parser.findVisionImage(a.timestamp, a.name, a.reco_id)
        if (v) return v
        const e = parser.findRecognitionImage(a.timestamp, a.name)
        if (e) return e
      }
    }
  }

  return undefined
}

// 预计算 node_id → 截图 URL 映射（每个执行独立匹配）
const nodeImageMap = computed(() => {
  const map = new Map<number, string>()
  const task = selectedTask.value
  if (!task) return map

  for (const info of task.nodes) {
    const img = findNodeInfoImage(info, props.parser)
    if (img) map.set(info.node_id, img)
  }

  return map
})

function updatePopoverPosition() {
  if (!popoverNodeId.value) return
  const nodeEl = document.querySelector(`[data-id="${popoverNodeId.value}"]`)
  const canvasEl = document.querySelector('.flowchart-canvas')
  if (!nodeEl || !canvasEl) return
  const nodeRect = nodeEl.getBoundingClientRect()
  const canvasRect = canvasEl.getBoundingClientRect()

  let x = nodeRect.right - canvasRect.left + 10
  let y = nodeRect.top - canvasRect.top

  // If popover would overflow right edge, show on left side
  if (x + 280 > canvasRect.width) {
    x = nodeRect.left - canvasRect.left - 290
  }

  // Clamp vertical: use actual popover height if available
  const popoverEl = document.querySelector('.node-popover') as HTMLElement | null
  const popoverHeight = popoverEl?.offsetHeight || 360
  if (y < 4) y = 4
  if (y + popoverHeight > canvasRect.height) {
    y = Math.max(4, canvasRect.height - popoverHeight - 4)
  }

  popoverPos.value = { x, y }
}

function closePopover() {
  popoverNodeId.value = null
}

function getEdgeRenderType(edge: any): string | undefined {
  const routePoints = (edge.data as FlowEdgeData | undefined)?.routePoints
  const hasRoutePoints = Array.isArray(routePoints) && routePoints.length >= 2
  return settings.flowchartEdgeStyle === 'orthogonal' && hasRoutePoints ? 'orthogonalEdge' : undefined
}

function applyEdgeRenderTypes() {
  flowEdges.value = flowEdges.value.map((edge: any) => ({
    ...edge,
    type: getEdgeRenderType(edge),
  }))
}

function getBaseEdgeStyle(d: FlowEdgeData) {
  if (!d.executed) {
    const style: Record<string, string | number> = { stroke: '#999', strokeWidth: 1, opacity: 0.5 }
    if (d.jump_back) {
      style.strokeDasharray = '8 4'
    } else if (d.anchor) {
      style.strokeDasharray = '3 3'
    }
    return style
  }

  const color = d.edgeStatus === 'failed' ? '#d03050' : '#18a058'
  const style: Record<string, string | number> = { stroke: color, strokeWidth: 3, opacity: 1 }
  if (d.jump_back) {
    style.strokeDasharray = '8 4'
  } else if (d.anchor) {
    style.strokeDasharray = '3 3'
  }
  return style
}

const highlightedNodeIds = computed(() => {
  if (!focusedNodeId.value) return null
  const ids = new Set<string>([focusedNodeId.value])
  flowEdges.value.forEach((edge: any) => {
    if (edge.source === focusedNodeId.value) ids.add(edge.target)
    if (edge.target === focusedNodeId.value) ids.add(edge.source)
  })
  return ids
})

const highlightedEdgeIds = computed(() => {
  if (!focusedNodeId.value) return null
  const ids = new Set<string>()
  flowEdges.value.forEach((edge: any) => {
    if (edge.source === focusedNodeId.value || edge.target === focusedNodeId.value) {
      ids.add(edge.id)
    }
  })
  return ids
})

function applyFocusStyles() {
  const activeEdgeIds = highlightedEdgeIds.value
  flowEdges.value = flowEdges.value.map((edge: any) => {
    const d = edge.data as FlowEdgeData
    const baseStyle = getBaseEdgeStyle(d)
    const dimmed = activeEdgeIds != null && !activeEdgeIds.has(edge.id)
    return {
      ...edge,
      style: {
        ...baseStyle,
        opacity: dimmed ? 0.12 : (baseStyle.opacity ?? 1),
      },
    }
  })
}


function clearPlaybackTimer() {
  if (playbackTimer.value != null) {
    window.clearInterval(playbackTimer.value)
    playbackTimer.value = null
  }
}

function stopPlayback() {
  isPlaying.value = false
  clearPlaybackTimer()
}

function focusTimelineItem(index: number, options?: { openPopover?: boolean; center?: boolean; closeDrawer?: boolean }) {
  const item = executionTimeline.value[index]
  if (!item) return

  selectedTimelineIndex.value = index
  focusedNodeId.value = item.name

  if (options?.center !== false) {
    const flowNode = getNode.value(item.name)
    if (flowNode) {
      setCenter(flowNode.position.x + 90, flowNode.position.y + 30, { zoom: focusZoom.value, duration: 300 })
    }
  }

  if (options?.openPopover) {
    popoverNodeId.value = item.name
    setTimeout(() => {
      updatePopoverPosition()
      requestAnimationFrame(updatePopoverPosition)
    }, 320)
  } else {
    closePopover()
  }

  if (options?.closeDrawer !== false && isMobile.value) {
    showNavDrawer.value = false
  }

  scrollNavToIndex(index)
}

function startPlayback() {
  if (executionTimeline.value.length === 0) return

  const startIndex = selectedTimelineIndex.value == null ? 0 : selectedTimelineIndex.value
  focusTimelineItem(startIndex, { openPopover: false, center: true })

  isPlaying.value = true
  clearPlaybackTimer()

  playbackTimer.value = window.setInterval(() => {
    const current = selectedTimelineIndex.value ?? -1
    const next = current + 1
    if (next >= executionTimeline.value.length) {
      stopPlayback()
      return
    }
    focusTimelineItem(next, { openPopover: false, center: true })
  }, playbackIntervalMs.value)
}

function togglePlayback() {
  if (isPlaying.value) {
    stopPlayback()
    return
  }
  startPlayback()
}

function handlePlaybackSpeedChange(v: number | null) {
  if (v == null) return
  playbackIntervalMs.value = v
  saveSettings(settings)
}

function handleFocusZoomChange(v: number | null) {
  if (v == null) return
  focusZoom.value = v
  saveSettings(settings)
}

// Select a timeline item: center canvas + open popover
function selectTimelineItem(index: number) {
  stopPlayback()
  focusTimelineItem(index, { openPopover: true, center: true })
}

// Scroll nav list to active item
function scrollNavToIndex(index: number) {
  nextTick(() => {
    const el = document.querySelector(`[data-nav-index="${index}"]`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// Build graph when task changes
watch(selectedTask, async (task) => {
  const runId = ++layoutRunId.value
  stopPlayback()
  closePopover()
  selectedTimelineIndex.value = null
  if (!task) {
    flowNodes.value = []
    flowEdges.value = []
    return
  }

  const { nodes, edges } = await buildFlowchartData(task)
  if (runId !== layoutRunId.value) return

  // Apply base edge styles
  edges.forEach(edge => {
    const d = edge.data as FlowEdgeData
    edge.style = getBaseEdgeStyle(d)
    edge.type = getEdgeRenderType(edge)
    edge.animated = false
  })

  flowNodes.value = nodes
  flowEdges.value = edges
  focusedNodeId.value = null
  applyFocusStyles()

  nextTick(() => {
    setTimeout(() => fitView({ padding: 0.2 }), 50)
  })
}, { immediate: true })

watch(focusedNodeId, () => {
  applyFocusStyles()
})

watch(playbackIntervalMs, () => {
  saveSettings(settings)
  if (isPlaying.value) {
    startPlayback()
  }
})

watch(focusZoom, () => {
  saveSettings(settings)
})

watch(() => settings.flowchartEdgeStyle, () => {
  applyEdgeRenderTypes()
  applyFocusStyles()
})

onBeforeUnmount(() => {
  stopPlayback()
})

// Handle node click
const onNodeClick = (event: { node: { id: string; data: FlowNodeData } }) => {
  const data = event.node.data
  if (data.nodeInfos.length === 0) return

  // Toggle popover: click same node again closes it
  stopPlayback()

  if (popoverNodeId.value === event.node.id) {
    focusedNodeId.value = null
    closePopover()
    return
  }

  focusedNodeId.value = event.node.id
  popoverNodeId.value = event.node.id
  nextTick(() => {
    updatePopoverPosition()
    // 再校正一次，等 popover 内容渲染完获取真实高度
    requestAnimationFrame(updatePopoverPosition)
  })

  // Bidirectional sync with timeline
  const timelineIdx = executionTimeline.value.findIndex(item => item.name === event.node.id)
  if (timelineIdx >= 0) {
    selectedTimelineIndex.value = timelineIdx
    scrollNavToIndex(timelineIdx)
  }
}

// Close popover on pane click (clicking empty canvas area)
const onPaneClick = () => {
  stopPlayback()
  focusedNodeId.value = null
  closePopover()
}
</script>

<template>
  <div class="flowchart-view">
    <!-- Top bar: task selector -->
    <n-card size="small" data-tour="flowchart-toolbar" :bordered="false" content-style="padding: 8px 12px">
      <n-flex align="center" style="gap: 12px">
        <n-text strong>任务:</n-text>
        <n-select
          :value="selectedTaskIndex"
          :options="taskOptions"
          :render-label="renderTaskLabel"
          placeholder="选择任务"
          size="small"
          style="min-width: 125px; flex: 1; max-width: 250px"
          @update:value="handleUserTaskSelect"
        />
        <n-select
          :value="playbackIntervalMs"
          :options="playbackSpeedOptions"
          size="small"
          style="width: 120px"
          @update:value="handlePlaybackSpeedChange"
        />
        <n-select
          :value="focusZoom"
          :options="focusZoomOptions"
          size="small"
          style="width: 90px"
          @update:value="handleFocusZoomChange"
        />
        <n-button size="small" secondary :disabled="executionTimeline.length === 0" @click="togglePlayback">
          {{ isPlaying ? '\u6682\u505c\u56de\u653e' : '\u987a\u5e8f\u56de\u653e' }}
        </n-button>
        <n-dropdown :options="uploadOptions" @select="handleUploadSelect" trigger="click">
          <n-button size="small" secondary>打开</n-button>
        </n-dropdown>
      </n-flex>
    </n-card>

    <!-- Hidden file inputs -->
    <input ref="fileInputRef" type="file" accept=".log,.jsonl,.txt,.zip" style="display: none" @change="handleFileInputChange" />
    <input ref="folderInputRef" type="file" webkitdirectory style="display: none" @change="handleFolderInputChange" />

    <div class="flowchart-body">
      <!-- Desktop left nav panel -->
      <div v-if="!isMobile && executionTimeline.length > 0" class="flowchart-nav-panel" data-tour="flowchart-execution-nav">
        <div class="nav-header">
          <n-text strong style="font-size: 13px">执行顺序</n-text>
        </div>
        <n-scrollbar style="flex: 1">
          <div style="padding: 4px 6px">
            <div
              v-for="(item, idx) in executionTimeline"
              :key="idx"
              :data-nav-index="idx"
              class="nav-item"
              :class="{ active: selectedTimelineIndex === idx }"
              @click="selectTimelineItem(idx)"
            >
              <span class="nav-index">#{{ idx + 1 }}</span>
              <span class="nav-name">{{ item.name }}</span>
              <span
                class="nav-status-dot"
                :class="item.status === 'success' ? 'dot-success' : 'dot-failed'"
              />
            </div>
          </div>
        </n-scrollbar>
      </div>

      <!-- Vue Flow canvas -->
      <div class="flowchart-canvas" data-tour="flowchart-canvas">
        <!-- Mobile nav floating button -->
        <n-button
          v-if="isMobile && executionTimeline.length > 0"
          class="nav-float-btn"
          size="small"
          secondary
          @click="showNavDrawer = true"
        >
          导航
        </n-button>

        <VueFlow
          id="flowchart"
          :nodes="flowNodes"
          :edges="flowEdges"
          :default-viewport="{ x: 0, y: 0, zoom: 1 }"
          :min-zoom="0.1"
          :max-zoom="3"
          fit-view-on-init
          @node-click="onNodeClick"
          @pane-click="onPaneClick"
        >
          <template #node-flowchartNode="nodeProps">
            <FlowchartNode
              :data="nodeProps.data"
              :selected="nodeProps.id === selectedFlowNodeId"
              :is-start="nodeProps.id === executionTimeline[0]?.name"
              :dimmed="highlightedNodeIds != null && !highlightedNodeIds.has(nodeProps.id)"
            />
          </template>
          <template #edge-orthogonalEdge="edgeProps">
            <FlowchartOrthogonalEdge v-bind="edgeProps" />
          </template>
        </VueFlow>

        <!-- Floating popover -->
        <div
          v-if="popoverNodeId && popoverNodeData"
          class="node-popover"
          :style="{ left: popoverPos.x + 'px', top: popoverPos.y + 'px' }"
        >
          <div class="popover-header">
            <span class="popover-title">{{ popoverNodeData.label }}</span>
            <span class="popover-close" @click="closePopover">&times;</span>
          </div>
          <div class="popover-body">
            <div
              v-for="(info, idx) in popoverNodeData.nodeInfos"
              :key="info.node_id"
            >
              <div v-if="popoverNodeData.nodeInfos.length > 1" class="popover-exec-label">
                执行 #{{ popoverNodeData.executionOrder[idx] ?? idx + 1 }}
              </div>
              <div class="popover-row">
                <n-tag size="tiny" :type="info.status === 'success' ? 'success' : 'error'">
                  {{ info.status === 'success' ? '成功' : '失败' }}
                </n-tag>
                <span class="popover-time">{{ info.timestamp }}</span>
                <span class="popover-locate" @click="navigateToNode(info)">定位</span>
              </div>
              <div v-if="info.reco_details" class="popover-row">
                <span class="popover-label">识别</span>
                <span>{{ info.reco_details.algorithm }}</span>
                <span v-if="info.reco_details.box" class="popover-secondary">
                  [{{ info.reco_details.box.join(', ') }}]
                </span>
              </div>
              <div v-if="info.action_details" class="popover-row">
                <span class="popover-label">动作</span>
                <span>{{ info.action_details.action }}</span>
                <n-tag size="tiny" :type="info.action_details.success ? 'success' : 'error'" style="margin-left: 4px">
                  {{ info.action_details.success ? '成功' : '失败' }}
                </n-tag>
              </div>
              <img
                v-if="nodeImageMap.get(info.node_id)"
                :src="convertFileSrc(nodeImageMap.get(info.node_id)!)"
                class="popover-img"
                alt="节点截图"
              />
              <div
                v-if="idx < popoverNodeData.nodeInfos.length - 1"
                class="popover-divider"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- Mobile left drawer for navigation -->
      <n-drawer
        v-if="isMobile"
        v-model:show="showNavDrawer"
        placement="left"
        :width="260"
      >
        <n-drawer-content title="执行顺序">
          <div style="padding: 4px 0">
            <div
              v-for="(item, idx) in executionTimeline"
              :key="idx"
              :data-nav-index="idx"
              class="nav-item"
              :class="{ active: selectedTimelineIndex === idx }"
              @click="selectTimelineItem(idx)"
            >
              <span class="nav-index">#{{ idx + 1 }}</span>
              <span class="nav-name">{{ item.name }}</span>
              <span
                class="nav-status-dot"
                :class="item.status === 'success' ? 'dot-success' : 'dot-failed'"
              />
            </div>
          </div>
        </n-drawer-content>
      </n-drawer>
    </div>
  </div>
</template>

<style scoped>
.flowchart-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.flowchart-body {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
}

.flowchart-canvas {
  flex: 1;
  min-width: 0;
  position: relative;
}

/* Navigation panel */
.flowchart-nav-panel {
  width: 220px;
  border-right: 1px solid var(--n-border-color);
  display: flex;
  flex-direction: column;
  background: var(--n-color);
}

.nav-header {
  padding: 8px 12px;
  border-bottom: 1px solid var(--n-border-color);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  border-radius: 4px;
  transition: background-color 0.15s;
}

.nav-item:hover {
  background: var(--flowchart-nav-hover);
}

.nav-item.active {
  background: var(--flowchart-nav-active);
}

.nav-index {
  font-size: 11px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 6px;
  background: var(--flowchart-badge-bg);
  color: var(--flowchart-badge-text);
  flex-shrink: 0;
  line-height: 16px;
}

.nav-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.nav-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nav-status-dot.dot-success {
  background: #18a058;
}

.nav-status-dot.dot-failed {
  background: #d03050;
}

/* Mobile floating nav button */
.nav-float-btn {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 10;
}

/* Floating popover */
.node-popover {
  position: absolute;
  z-index: 20;
  width: 280px;
  max-height: 360px;
  display: flex;
  flex-direction: column;
  background: var(--flowchart-popover-bg);
  border: 1px solid var(--flowchart-popover-border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  font-size: 12px;
}

.popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--flowchart-popover-border);
  flex-shrink: 0;
}

.popover-title {
  font-weight: 600;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.popover-close {
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  color: var(--flowchart-popover-close);
  margin-left: 8px;
  flex-shrink: 0;
}

.popover-close:hover {
  color: var(--flowchart-popover-close-hover);
}

.popover-body {
  padding: 8px 10px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.popover-exec-label {
  font-weight: 600;
  font-size: 11px;
  color: var(--flowchart-badge-text);
  margin-bottom: 4px;
}

.popover-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.popover-time {
  color: var(--flowchart-popover-secondary);
  font-size: 11px;
}

.popover-locate {
  font-size: 11px;
  color: #18a058;
  cursor: pointer;
  margin-left: auto;
  flex-shrink: 0;
}

.popover-locate:hover {
  text-decoration: underline;
}

.popover-label {
  font-weight: 500;
  color: var(--flowchart-popover-secondary);
  flex-shrink: 0;
}

.popover-secondary {
  color: var(--flowchart-popover-secondary);
  font-size: 11px;
}

.popover-divider {
  border-bottom: 1px solid var(--flowchart-popover-border);
  margin: 6px 0;
}

.popover-img {
  max-width: 100%;
  border-radius: 4px;
  margin-top: 4px;
}

/* Vue Flow pane background */
.flowchart-canvas :deep(.vue-flow__pane) {
  cursor: grab;
}
</style>

<!-- Unscoped: theme CSS variables (must not be scoped to work on :root/body) -->
<style>
/* Default: dark theme (project default is dark) */
body {
  --flowchart-success-bg: #1a3a2a;
  --flowchart-success-border: #18a058;
  --flowchart-success-text: #a0d8b0;
  --flowchart-failed-bg: #3a1a1a;
  --flowchart-failed-border: #d03050;
  --flowchart-failed-text: #d8a0a0;
  --flowchart-notexec-bg: #2a2a2a;
  --flowchart-notexec-border: #666;
  --flowchart-notexec-text: #888;
  --flowchart-badge-bg: rgba(255, 255, 255, 0.1);
  --flowchart-badge-text: #aaa;
  --flowchart-hover-ring: rgba(24, 160, 88, 0.5);
  --flowchart-selected-ring: rgba(24, 160, 88, 0.9);
  --flowchart-nav-hover: rgba(255, 255, 255, 0.06);
  --flowchart-nav-active: rgba(24, 160, 88, 0.2);
  --flowchart-popover-bg: #2a2a2a;
  --flowchart-popover-border: #444;
  --flowchart-popover-close: #888;
  --flowchart-popover-close-hover: #ddd;
  --flowchart-popover-secondary: #999;
}

/* Vue Flow canvas: dark background (default) */
.vue-flow {
  background: #1a1a1a;
}

/* Light theme — system preference when not forced dark */
@media (prefers-color-scheme: light) {
  body:not(.force-dark) {
    --flowchart-success-bg: #e8f5e9;
    --flowchart-success-border: #18a058;
    --flowchart-success-text: #1a3a1a;
    --flowchart-failed-bg: #fdecea;
    --flowchart-failed-border: #d03050;
    --flowchart-failed-text: #3a1a1a;
    --flowchart-notexec-bg: #f5f5f5;
    --flowchart-notexec-border: #999;
    --flowchart-notexec-text: #888;
    --flowchart-badge-bg: rgba(0, 0, 0, 0.08);
    --flowchart-badge-text: #666;
    --flowchart-hover-ring: rgba(24, 160, 88, 0.4);
    --flowchart-selected-ring: rgba(24, 160, 88, 0.8);
    --flowchart-nav-hover: rgba(0, 0, 0, 0.04);
    --flowchart-nav-active: rgba(24, 160, 88, 0.1);
    --flowchart-popover-bg: #fff;
    --flowchart-popover-border: #e0e0e0;
    --flowchart-popover-close: #999;
    --flowchart-popover-close-hover: #333;
    --flowchart-popover-secondary: #888;
  }

  body:not(.force-dark) .vue-flow {
    background: #fff;
  }
}

/* Forced light theme */
body.force-light {
  --flowchart-success-bg: #e8f5e9;
  --flowchart-success-border: #18a058;
  --flowchart-success-text: #1a3a1a;
  --flowchart-failed-bg: #fdecea;
  --flowchart-failed-border: #d03050;
  --flowchart-failed-text: #3a1a1a;
  --flowchart-notexec-bg: #f5f5f5;
  --flowchart-notexec-border: #999;
  --flowchart-notexec-text: #888;
  --flowchart-badge-bg: rgba(0, 0, 0, 0.08);
  --flowchart-badge-text: #666;
  --flowchart-hover-ring: rgba(24, 160, 88, 0.4);
  --flowchart-selected-ring: rgba(24, 160, 88, 0.8);
  --flowchart-nav-hover: rgba(0, 0, 0, 0.04);
  --flowchart-nav-active: rgba(24, 160, 88, 0.1);
  --flowchart-popover-bg: #fff;
  --flowchart-popover-border: #e0e0e0;
  --flowchart-popover-close: #999;
  --flowchart-popover-close-hover: #333;
  --flowchart-popover-secondary: #888;
}

body.force-light .vue-flow {
  background: #fff;
}
</style>
