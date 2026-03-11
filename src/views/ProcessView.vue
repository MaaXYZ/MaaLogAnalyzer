<script setup lang="ts">
import { ref, computed, watch, h, onMounted, onUnmounted } from 'vue'
import {
  NCard, NButton, NIcon, NText, NFlex, NDropdown,
  NScrollbar, NEmpty, NBadge, NTag, NSplit, NList, NListItem
} from 'naive-ui'
import { CloudUploadOutlined, FolderOpenOutlined, FileOutlined, FolderOutlined, MenuOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@vicons/antd'
import { DynamicScroller, DynamicScrollerItem } from 'vue-virtual-scroller'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import NodeCard from '../components/NodeCard.vue'
import type { TaskInfo, NodeInfo } from '../types'
import type { LogParser } from '../utils/logParser'
import { isTauri, isVSCode } from '../utils/platform'
import { formatDuration, extractTime } from '../utils/formatDuration'
import { getSettings } from '../utils/settings'

const settings = getSettings()

const props = defineProps<{
  tasks: TaskInfo[]
  selectedTask: TaskInfo | null
  loading: boolean
  parser: LogParser
  detailViewCollapsed?: boolean
  onExpandDetailView?: () => void
  isMobile?: boolean
}>()

const emit = defineEmits<{
  'select-task': [task: TaskInfo]
  'upload-file': [file: File]
  'upload-content': [content: string, errorImages?: Map<string, string>, visionImages?: Map<string, string>, waitFreezesImages?: Map<string, string>]
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'file-loading-start': []
  'file-loading-end': []
  'open-task-drawer': []
}>()

// 当前选中的任务索引
const activeTaskIndex = ref(0)

// 文件读取加载状态
const fileLoading = ref(false)

// 是否在 Tauri 环境
const isInTauri = ref(isTauri())

// 是否在 VS Code 环境
const isInVSCode = ref(isVSCode())

// 任务列表折叠状态
const taskListCollapsed = ref(false)
const taskListSize = ref(0.25)
const taskListSavedSize = ref(0.25)
const taskListScrollbar = ref<InstanceType<typeof NScrollbar> | null>(null)

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
const nodeNavScrollbar = ref<InstanceType<typeof NScrollbar> | null>(null)

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

// 节点导航跳转顶部/底部
const scrollNavToTop = () => {
  nodeNavScrollbar.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
const scrollNavToBottom = () => {
  nodeNavScrollbar.value?.scrollTo({ top: 999999, behavior: 'smooth' })
}

// 任务列表跳转顶部/底部
const scrollTaskListToTop = () => {
  taskListScrollbar.value?.scrollTo({ top: 0, behavior: 'smooth' })
}
const scrollTaskListToBottom = () => {
  taskListScrollbar.value?.scrollTo({ top: 999999, behavior: 'smooth' })
}

// 根据显示模式计算节点导航默认宽度
const getNodeNavDefaultSize = (taskCollapsed: boolean, detailCollapsed: boolean) => {
  if (taskCollapsed && detailCollapsed) {
    return settings.displayMode === 'detailed' ? 0.12 : 0.2
  }
  return settings.displayMode === 'detailed' ? 0.2 : 0.35
}

// 根据两侧折叠状态和显示模式动态调整节点导航宽度
watch([taskListCollapsed, () => props.detailViewCollapsed, () => settings.displayMode], ([taskCollapsed, detailCollapsed]) => {
  // 只在节点导航未折叠时调整宽度
  if (!nodeNavCollapsed.value) {
    const size = getNodeNavDefaultSize(!!taskCollapsed, !!detailCollapsed)
    nodeNavSize.value = size
    nodeNavSavedSize.value = size
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

// 当前任务的节点列表（添加唯一key用于虚拟滚动）
const currentNodes = computed(() => {
  if (!props.selectedTask) return []
  const taskId = props.selectedTask.task_id
  return (props.selectedTask.nodes || []).map(node => ({
    ...node,
    _uniqueKey: `${taskId}-${node.node_id}`
  }))
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

// 同步 activeTaskIndex 与 selectedTask（处理外部改变 selectedTask 的情况）
watch(() => props.selectedTask, async (newTask, oldTask) => {
  // 只在外部改变 selectedTask 时同步 activeTaskIndex（不是通过点击任务列表触发的）
  if (newTask && newTask !== oldTask) {
    const index = props.tasks.findIndex(t => t === newTask)
    if (index !== -1 && index !== activeTaskIndex.value) {
      activeTaskIndex.value = index
    }
  }
  // 任务切换时重置滚动位置到顶部（延迟到下一帧，确保 DOM 更新完成）
  await new Promise(resolve => setTimeout(resolve, 0))
  if (virtualScroller.value) {
    virtualScroller.value.scrollToItem(0)
  }
}, { immediate: true })

// 处理拖拽上传（支持文件和文件夹）
const handleDrop = async (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  
  const items = event.dataTransfer?.items
  if (!items || items.length === 0) return

  // 检查是否是文件夹
  const firstItem = items[0]
  const entry = firstItem.webkitGetAsEntry?.()
  
  if (entry?.isDirectory) {
    // 处理文件夹
    await handleDirectoryEntry(entry as FileSystemDirectoryEntry)
  } else {
    // 处理单个文件
    const file = firstItem.getAsFile()
    if (file) {
      emit('upload-file', file)
    }
  }
}

// 处理文件夹条目
const handleDirectoryEntry = async (dirEntry: FileSystemDirectoryEntry) => {
  try {
    fileLoading.value = true
    emit('file-loading-start')

    const files = await readDirectoryFiles(dirEntry)
    
    let bakLogFile: File | null = null
    let mainLogFile: File | null = null

    for (const file of files) {
      const fileName = file.name.toLowerCase()
      if (fileName === 'maa.bak.log') {
        bakLogFile = file
      } else if (fileName === 'maa.log') {
        mainLogFile = file
      }
    }

    if (!bakLogFile && !mainLogFile) {
      alert('文件夹中未找到 maa.log 或 maa.bak.log 文件')
      return
    }

    let combinedContent = ''
    if (bakLogFile) {
      combinedContent += await bakLogFile.text()
    }
    if (mainLogFile) {
      if (combinedContent && !combinedContent.endsWith('\n')) {
        combinedContent += '\n'
      }
      combinedContent += await mainLogFile.text()
    }

    if (combinedContent) {
      emit('upload-content', combinedContent)
    }
  } catch (error) {
    alert('读取文件夹失败: ' + error)
  } finally {
    fileLoading.value = false
    emit('file-loading-end')
  }
}

// 读取文件夹中的文件
const readDirectoryFiles = (dirEntry: FileSystemDirectoryEntry): Promise<File[]> => {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader()
    const files: File[] = []
    
    const readEntries = () => {
      reader.readEntries(async (entries) => {
        if (entries.length === 0) {
          resolve(files)
          return
        }
        
        for (const entry of entries) {
          if (entry.isFile) {
            const file = await getFileFromEntry(entry as FileSystemFileEntry)
            files.push(file)
          }
        }
        
        readEntries() // 继续读取（可能有多批）
      }, reject)
    }
    
    readEntries()
  })
}

// 从 FileSystemFileEntry 获取 File 对象
const getFileFromEntry = (fileEntry: FileSystemFileEntry): Promise<File> => {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject)
  })
}

// 阻止默认拖拽行为
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
}

// 处理文件夹上传（Web - 点击选择）
const handleFolderChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files || files.length === 0) return

  // 查找 maa.bak.log 和 maa.log
  let bakLogFile: File | null = null
  let mainLogFile: File | null = null

  for (const file of files) {
    const fileName = file.name.toLowerCase()
    if (fileName === 'maa.bak.log') {
      bakLogFile = file
    } else if (fileName === 'maa.log') {
      mainLogFile = file
    }
  }

  if (!bakLogFile && !mainLogFile) {
    alert('文件夹中未找到 maa.log 或 maa.bak.log 文件')
    return
  }

  try {
    fileLoading.value = true
    emit('file-loading-start')

    // 按顺序读取并合并内容：先 bak，后 main
    let combinedContent = ''
    if (bakLogFile) {
      combinedContent += await bakLogFile.text()
    }
    if (mainLogFile) {
      if (combinedContent && !combinedContent.endsWith('\n')) {
        combinedContent += '\n'
      }
      combinedContent += await mainLogFile.text()
    }

    if (combinedContent) {
      emit('upload-content', combinedContent)
    }
  } catch (error) {
    alert('读取文件失败: ' + error)
  } finally {
    fileLoading.value = false
    emit('file-loading-end')
    // 清空 input 以便重复选择同一文件夹
    input.value = ''
  }
}

// 触发文件夹选择
const folderInputRef = ref<HTMLInputElement | null>(null)
const triggerFolderSelect = async () => {
  try {
    const { openFolderDialog } = await import('../utils/fileDialog')

    fileLoading.value = true
    emit('file-loading-start')

    const result = await openFolderDialog()

    if (result) {
      emit('upload-content', result.content, result.errorImages, result.visionImages, result.waitFreezesImages)
    }
  } catch (error) {
    alert('打开文件夹失败: ' + error)
  } finally {
    fileLoading.value = false
    emit('file-loading-end')
  }
}

// 触发文件选择
const fileInputRef = ref<HTMLInputElement | null>(null)
const triggerFileSelect = () => {
  fileInputRef.value?.click()
}

// 处理文件选择（用于重新加载下拉菜单）
const handleFileInputChange = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    emit('upload-file', file)
  }
  input.value = ''
}

// 重新加载下拉菜单选项
const reloadOptions = [
  {
    label: '选择文件',
    key: 'file',
    icon: () => h(FileOutlined)
  },
  {
    label: '选择文件夹',
    key: 'folder',
    icon: () => h(FolderOutlined)
  }
]

// 处理重新加载下拉菜单选择
const handleReloadSelect = (key: string) => {
  if (isInTauri.value) {
    if (key === 'file') {
      handleTauriOpen()
    } else if (key === 'folder') {
      handleTauriOpenFolder()
    }
  } else if (isInVSCode.value) {
    if (key === 'file') {
      handleVSCodeOpen()
    } else if (key === 'folder') {
      handleVSCodeOpenFolder()
    }
  } else {
    if (key === 'file') {
      triggerFileSelect()
    } else if (key === 'folder') {
      triggerFolderSelect()
    }
  }
}

// 使用 Tauri 打开文件
const handleTauriOpen = async () => {
  try {
    // 动态导入 Tauri API
    const { open } = await import('@tauri-apps/plugin-dialog')

    // 打开文件选择对话框（不显示加载提示）
    const selected = await open({
      multiple: false,
      filters: [{
        name: 'Log Files',
        extensions: ['log', 'jsonl', 'txt', 'zip']
      }],
      directory: false,
      title: '选择日志文件'
    })

    // 用户选择了文件后，才显示加载提示并读取文件
    if (selected && typeof selected === 'string') {
      try {
        fileLoading.value = true
        emit('file-loading-start')

        if (selected.toLowerCase().endsWith('.zip')) {
          // ZIP 文件：使用 Rust 侧原生解压
          const { invoke } = await import('@tauri-apps/api/core')
          const result = await invoke<{ content: string; error_images: Record<string, number[]>; vision_images: Record<string, number[]>; wait_freezes_images: Record<string, number[]> }>('extract_zip_log', { path: selected })

          // 将 error_images 字节数组转为 blob URL
          const errorImages = new Map<string, string>()
          for (const [key, bytes] of Object.entries(result.error_images)) {
            const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' })
            errorImages.set(key, URL.createObjectURL(blob))
          }

          // 将 vision_images 字节数组转为 blob URL
          const visionImages = new Map<string, string>()
          for (const [key, bytes] of Object.entries(result.vision_images)) {
            const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
            visionImages.set(key, URL.createObjectURL(blob))
          }

          // 将 wait_freezes_images 字节数组转为 blob URL
          const waitFreezesImages = new Map<string, string>()
          for (const [key, bytes] of Object.entries(result.wait_freezes_images)) {
            const blob = new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' })
            waitFreezesImages.set(key, URL.createObjectURL(blob))
          }

          emit('upload-content', result.content, errorImages, visionImages, waitFreezesImages)
        } else {
          const { readTextFile } = await import('@tauri-apps/plugin-fs')
          const content = await readTextFile(selected)

          if (content) {
            emit('upload-content', content)
          }
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

// 使用 Tauri 打开文件夹
const handleTauriOpenFolder = async () => {
  try {
    const { openFolderDialog } = await import('../utils/fileDialog')

    fileLoading.value = true
    emit('file-loading-start')

    const result = await openFolderDialog()

    if (result) {
      emit('upload-content', result.content, result.errorImages, result.visionImages, result.waitFreezesImages)
    }
  } catch (error) {
    alert('打开文件夹失败: ' + error)
  } finally {
    fileLoading.value = false
    emit('file-loading-end')
  }
}

// 使用 VS Code 打开文件
const handleVSCodeOpen = () => {
  console.log('[VS Code] Opening file, vscodeApi:', window.vscodeApi)
  if (window.vscodeApi) {
    window.vscodeApi.postMessage({ type: 'openFile' })
  } else {
    console.error('[VS Code] vscodeApi not available')
  }
}

// 使用 VS Code 打开文件夹
const handleVSCodeOpenFolder = () => {
  console.log('[VS Code] Opening folder, vscodeApi:', window.vscodeApi)
  if (window.vscodeApi) {
    window.vscodeApi.postMessage({ type: 'openFolder' })
    console.log('[VS Code] Message sent: openFolder')
  } else {
    console.error('[VS Code] vscodeApi not available')
  }
}

// 处理来自 VS Code 的消息
const handleVSCodeMessage = (event: MessageEvent) => {
  const message = event.data
  if (message.type === 'loadFile' && message.content) {
    emit('file-loading-start')
    emit('upload-content', message.content)
    emit('file-loading-end')
  } else if (message.type === 'loadZipFile' && message.content) {
    emit('file-loading-start')
    // 将 base64 图片转 blob URL
    const errorImages = new Map<string, string>()
    if (message.errorImages && Array.isArray(message.errorImages)) {
      for (const { key, base64 } of message.errorImages) {
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/png' })
        errorImages.set(key, URL.createObjectURL(blob))
      }
    }
    // 将 vision base64 图片转 blob URL
    const visionImages = new Map<string, string>()
    if (message.visionImages && Array.isArray(message.visionImages)) {
      for (const { key, base64 } of message.visionImages) {
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        visionImages.set(key, URL.createObjectURL(blob))
      }
    }
    // 将 wait_freezes base64 图片转 blob URL
    const waitFreezesImages = new Map<string, string>()
    if (message.waitFreezesImages && Array.isArray(message.waitFreezesImages)) {
      for (const { key, base64 } of message.waitFreezesImages) {
        const binaryStr = atob(base64)
        const bytes = new Uint8Array(binaryStr.length)
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i)
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' })
        waitFreezesImages.set(key, URL.createObjectURL(blob))
      }
    }
    emit('upload-content', message.content, errorImages, visionImages, waitFreezesImages)
    emit('file-loading-end')
  }
}

// 生命周期：监听 VS Code 消息
onMounted(() => {
  if (isInVSCode.value) {
    window.addEventListener('message', handleVSCodeMessage)
  }
})

onUnmounted(() => {
  if (isInVSCode.value) {
    window.removeEventListener('message', handleVSCodeMessage)
  }
})
// 选择节点
const handleNodeClick = (node: NodeInfo) => {
  emit('select-node', node)
}

// 选择动作
const handleActionClick = (node: NodeInfo) => {
  emit('select-action', node)
}

// 选择识别尝试
const handleRecognitionClick = (node: NodeInfo, attemptIndex: number) => {
  emit('select-recognition', node, attemptIndex)
}

// 选择嵌套节点
const handleNestedClick = (node: NodeInfo, attemptIndex: number, nestedIndex: number) => {
  emit('select-nested', node, attemptIndex, nestedIndex)
}

// 选择嵌套动作节点
const handleNestedActionClick = (node: NodeInfo, actionIndex: number, nestedIndex: number) => {
  emit('select-nested-action', node, actionIndex, nestedIndex)
}
</script>

<template>
  <n-card
    :title="isMobile ? undefined : 'MAA 日志分析器'"
    style="height: 100%"
    content-style="display: flex; flex-direction: column; gap: 16px; min-height: 0"
  >
    <!-- 移动端工具栏 -->
    <n-flex v-if="isMobile && tasks.length > 0" align="center" style="gap: 8px">
      <n-button text style="font-size: 20px" @click="emit('open-task-drawer')">
        <n-icon><menu-outlined /></n-icon>
      </n-button>
      <n-text strong style="font-size: 14px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">
        {{ selectedTask?.entry || '选择任务' }}
      </n-text>
      <n-dropdown :options="reloadOptions" @select="handleReloadSelect">
        <n-button size="small">
          <template #icon>
            <n-icon><folder-open-outlined /></n-icon>
          </template>
          重新加载
        </n-button>
      </n-dropdown>
    </n-flex>

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
            支持 maa.log 格式、.zip 压缩包，或选择包含日志的文件夹
          </n-text>
          <n-badge value="Tauri" type="success" style="margin-top: 4px" />
        </div>
        <n-flex justify="center" style="gap: 12px">
          <n-button type="primary" size="large" @click="handleTauriOpen">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择日志文件
          </n-button>
          <n-button size="large" @click="handleTauriOpenFolder">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择文件夹
          </n-button>
        </n-flex>
      </div>

      <!-- VS Code 环境：使用 VS Code 文件对话框 -->
      <div v-else-if="isInVSCode" style="text-align: center; padding: 40px 20px">
        <n-icon size="48" :depth="3" style="margin-bottom: 16px">
          <folder-open-outlined />
        </n-icon>
        <div style="margin-bottom: 20px">
          <n-text style="font-size: 16px; display: block; margin-bottom: 8px">
            使用 VS Code 文件选择器
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 8px">
            支持 maa.log 格式、.zip 压缩包，或选择包含日志的文件夹
          </n-text>
          <n-badge value="VS Code" type="info" style="margin-top: 4px" />
        </div>
        <n-flex justify="center" style="gap: 12px">
          <n-button type="primary" size="large" @click="handleVSCodeOpen">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择日志文件
          </n-button>
          <n-button size="large" @click="handleVSCodeOpenFolder">
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            选择文件夹
          </n-button>
        </n-flex>
      </div>
      
      <!-- Web 环境：自定义拖拽区域，支持文件和文件夹 -->
      <div
        v-else
        class="drop-zone"
        @drop="handleDrop"
        @dragover="handleDragOver"
        @dragenter="handleDragOver"
      >
        <div style="padding: 40px 20px; text-align: center">
          <n-icon size="48" :depth="3">
            <cloud-upload-outlined />
          </n-icon>
          <n-text style="font-size: 16px; display: block; margin-top: 12px">
            拖拽日志文件/文件夹到此处，或点击下方按钮选择
          </n-text>
          <n-text depth="3" style="font-size: 14px; display: block; margin-bottom: 12px">
            支持 maa.log 格式、.zip 压缩包，文件夹需包含 maa.log 或 maa.bak.log
          </n-text>
          <n-dropdown :options="reloadOptions" @select="handleReloadSelect">
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

    <!-- 任务列表 -->
    <template v-else>
      <!-- 移动端：直接显示节点卡片，无 NSplit -->
      <template v-if="isMobile">
        <div v-if="currentNodes.length === 0" style="padding: 40px 0">
          <n-empty description="暂无节点数据" />
        </div>
        <DynamicScroller
          v-else
          ref="virtualScroller"
          :key="selectedTask?.task_id"
          :items="currentNodes"
          :min-item-size="150"
          key-field="_uniqueKey"
          class="virtual-scroller"
          style="flex: 1; min-height: 0"
        >
          <template #default="{ item, index, active }">
            <DynamicScrollerItem
              :item="item"
              :active="active"
              :data-index="index"
              :size-dependencies="[
                item.recognition_attempts?.length,
                item.next_list?.length,
                item.action_details,
                settings.displayMode
              ]"
            >
              <div style="padding: 8px 4px">
                <node-card
                  :node="item"
                  @select-node="handleNodeClick"
                  @select-action="handleActionClick"
                  @select-recognition="handleRecognitionClick"
                  @select-nested="handleNestedClick"
                  @select-nested-action="handleNestedActionClick"
                />
              </div>
            </DynamicScrollerItem>
          </template>
        </DynamicScroller>
      </template>

      <!-- 桌面端：完整 NSplit 布局 -->
      <template v-else>
      <!-- 操作按钮 -->
      <n-flex>
        <!-- Tauri 环境 -->
        <n-dropdown v-if="isInTauri" :options="reloadOptions" @select="handleReloadSelect">
          <n-button>
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            重新加载
          </n-button>
        </n-dropdown>

        <!-- VS Code 环境 -->
        <n-dropdown v-else-if="isInVSCode" :options="reloadOptions" @select="handleReloadSelect">
          <n-button>
            <template #icon>
              <n-icon><folder-open-outlined /></n-icon>
            </template>
            重新加载
          </n-button>
        </n-dropdown>

        <!-- Web 环境 -->
        <n-dropdown v-else :options="reloadOptions" @select="handleReloadSelect">
          <n-button>
            <template #icon>
              <n-icon><cloud-upload-outlined /></n-icon>
            </template>
            重新加载
          </n-button>
        </n-dropdown>
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
          <n-card size="small" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
                <template #header>
                  <n-flex align="center" justify="space-between" style="padding-right: 16px">
                    <n-text style="font-size: 14px; font-weight: 500">任务列表</n-text>
                    <n-flex align="center" style="gap: 2px">
                      <n-button text size="tiny" @click="scrollTaskListToTop" title="跳转顶部">
                        <n-icon size="16"><vertical-align-top-outlined /></n-icon>
                      </n-button>
                      <n-button text size="tiny" @click="scrollTaskListToBottom" title="跳转底部">
                        <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
                      </n-button>
                    </n-flex>
                  </n-flex>
                </template>
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
            <n-scrollbar ref="taskListScrollbar" style="height: 100%; max-height: 100%">
              <n-list hoverable clickable>
                <n-list-item
                  v-for="(task, index) in tasks"
                  :key="task.task_id"
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
                      <n-text depth="3" style="font-size: 12px" v-if="task.start_time">
                        时间: {{ task.start_time }}
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
                <n-card size="small" style="height: 100%; display: flex; flex-direction: column; position: relative" content-style="padding: 0; flex: 1; min-height: 0; overflow: hidden">
                  <template #header>
                    <n-flex align="center" justify="space-between" style="padding-right: 16px">
                      <n-text style="font-size: 14px; font-weight: 500">节点导航</n-text>
                      <n-flex align="center" style="gap: 2px">
                        <n-button text size="tiny" @click="scrollNavToTop" title="跳转顶部">
                          <n-icon size="16"><vertical-align-top-outlined /></n-icon>
                        </n-button>
                        <n-button text size="tiny" @click="scrollNavToBottom" title="跳转底部">
                          <n-icon size="16"><vertical-align-bottom-outlined /></n-icon>
                        </n-button>
                      </n-flex>
                    </n-flex>
                  </template>
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
                  <n-scrollbar ref="nodeNavScrollbar" style="height: 100%; max-height: 100%">
                    <n-list hoverable clickable v-if="currentNodes.length > 0">
                      <n-list-item
                        v-for="(node, index) in currentNodes"
                        :key="`nav-${node.task_id}-${node.node_id}`"
                        @click="scrollToNode(index)"
                        :style="{
                          cursor: 'pointer',
                          padding: settings.displayMode === 'detailed' ? '8px 12px' : '4px 8px'
                        }"
                      >
                        <!-- 详细模式：两行布局 -->
                        <n-flex v-if="settings.displayMode === 'detailed'" vertical style="gap: 4px">
                          <n-flex align="center" style="gap: 8px">
                            <n-text strong style="font-size: 13px">{{ node.name || '未命名节点' }}</n-text>
                            <n-text depth="3" style="font-size: 11px">
                              {{ extractTime(node.timestamp) }}
                            </n-text>
                          </n-flex>
                          <n-flex align="center" style="gap: 8px">
                            <n-tag size="small" :type="node.status === 'success' ? 'success' : 'error'">
                              {{ node.status === 'success' ? '成功' : '失败' }}
                            </n-tag>
                            <n-text depth="3" style="font-size: 11px">
                              #{{ index + 1 }}
                            </n-text>
                          </n-flex>
                        </n-flex>

                        <!-- 紧凑模式：单行，小字号 -->
                        <n-flex v-else-if="settings.displayMode === 'compact'" align="center" style="gap: 6px">
                          <span class="nav-status-dot" :class="node.status === 'success' ? 'nav-dot-success' : 'nav-dot-failed'" />
                          <n-text style="font-size: 12px; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap">{{ node.name || '未命名节点' }}</n-text>
                          <n-text depth="3" style="font-size: 10px; flex-shrink: 0">{{ extractTime(node.timestamp) }}</n-text>
                        </n-flex>

                        <!-- 树形模式：紧凑，带时间 -->
                        <n-flex v-else align="center" style="gap: 4px">
                          <span class="nav-status-dot" :class="node.status === 'success' ? 'nav-dot-success' : 'nav-dot-failed'" />
                          <n-text style="font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1">{{ node.name || '未命名节点' }}</n-text>
                          <n-text depth="3" style="font-size: 10px; flex-shrink: 0">{{ extractTime(node.timestamp) }}</n-text>
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
                    :key="selectedTask?.task_id"
                    :items="currentNodes"
                    :min-item-size="150"
                    key-field="_uniqueKey"
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
                          item.action_details,
                          settings.displayMode
                        ]"
                      >
                        <div style="padding: 12px">
                          <node-card
                            :node="item"
                            @select-node="handleNodeClick"
                            @select-action="handleActionClick"
                            @select-recognition="handleRecognitionClick"
                            @select-nested="handleNestedClick"
                            @select-nested-action="handleNestedActionClick"
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
    </template>

    <!-- Web 环境下的全局隐藏文件选择输入框 -->
    <input
      v-if="!isInTauri"
      ref="fileInputRef"
      type="file"
      accept=".log,.txt,.jsonl,.zip"
      style="display: none"
      @change="handleFileInputChange"
    />
    <input
      v-if="!isInTauri"
      ref="folderInputRef"
      type="file"
      webkitdirectory
      style="display: none"
      @change="handleFolderChange"
    />
  </n-card>
</template>

<style scoped>
.nav-status-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.nav-dot-success {
  background: #63e2b7;
}

.nav-dot-failed {
  background: #d03050;
}

/* 拖拽区域样式 */
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