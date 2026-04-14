import { computed, ref, type Ref } from 'vue'
import type { UploadFileInfo } from 'naive-ui'
import type { TaskInfo } from '../../../types'
import { LogParser } from '@windsland52/maa-log-parser'
import { getErrorMessage } from '../../../utils/errorHandler'
import { isTauri } from '../../../utils/platform'

interface NodeStatisticsMessageApi {
  warning: (message: string) => void
  error: (message: string, options?: { duration?: number }) => void
}

interface UseNodeStatisticsDataSourceOptions {
  tasks: Ref<TaskInfo[]>
  message: NodeStatisticsMessageApi
}

export const useNodeStatisticsDataSource = (
  options: UseNodeStatisticsDataSourceOptions,
) => {
  const localTasks = ref<TaskInfo[]>([])
  const useLocalData = ref(false)
  const isUploading = ref(false)
  const loading = ref(false)
  const parseProgress = ref(0)
  const showParsingModal = ref(false)
  const showFileLoadingModal = ref(false)
  const isInTauri = ref(isTauri())
  const uploadKey = ref(0)

  const effectiveTasks = computed(() => {
    return useLocalData.value ? localTasks.value : options.tasks.value
  })

  const processLogContent = async (content: string) => {
    showParsingModal.value = true
    parseProgress.value = 0

    try {
      const parser = new LogParser()
      await parser.parseFile(content, (progress) => {
        parseProgress.value = progress.percentage
      })

      const newTasks = parser.consumeTasks()
      if (!useLocalData.value) {
        useLocalData.value = true
      }
      localTasks.value = newTasks

      if (localTasks.value.length === 0) {
        options.message.warning('未找到任务数据，请检查日志文件格式')
      }

      await new Promise((resolve) => setTimeout(resolve, 0))
      uploadKey.value++
    } finally {
      showParsingModal.value = false
      parseProgress.value = 0
    }
  }

  const handleFileUpload = async (file: File) => {
    if (isUploading.value) {
      options.message.warning('正在处理上一个文件，请稍候')
      return
    }

    isUploading.value = true
    loading.value = true
    try {
      const content = await file.text()
      await processLogContent(content)
    } catch (error) {
      options.message.error(getErrorMessage(error), { duration: 5000 })
    } finally {
      loading.value = false
      isUploading.value = false
    }
  }

  const handleNaiveUpload = async (request: { file: UploadFileInfo }) => {
    const file = request.file.file
    if (file) {
      await handleFileUpload(file as File)
    }
    return false
  }

  const handleTauriFileSelect = async () => {
    if (isUploading.value) {
      options.message.warning('正在处理上一个文件，请稍候')
      return
    }

    isUploading.value = true
    showFileLoadingModal.value = true
    try {
      const { openLogFileDialog } = await import('../../../utils/fileDialog')
      const content = await openLogFileDialog()
      showFileLoadingModal.value = false
      if (content) {
        await processLogContent(content)
      }
    } catch (error) {
      showFileLoadingModal.value = false
      options.message.error(getErrorMessage(error), { duration: 5000 })
    } finally {
      isUploading.value = false
    }
  }

  return {
    loading,
    parseProgress,
    showParsingModal,
    showFileLoadingModal,
    isInTauri,
    uploadKey,
    effectiveTasks,
    handleNaiveUpload,
    handleTauriFileSelect,
  }
}
