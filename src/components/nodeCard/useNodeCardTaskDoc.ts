import { computed, ref, watch, type Ref } from 'vue'
import type { NodeInfo } from '../../types'

interface UseNodeCardTaskDocOptions {
  node: Ref<NodeInfo>
  isVscodeLaunchEmbed: Ref<boolean | undefined>
  bridgeRequestTaskDoc: Ref<((task: string) => Promise<string | null>) | null | undefined>
  bridgeRevealTask: Ref<((task: string) => Promise<void>) | null | undefined>
}

const normalizeTaskName = (value: unknown): string => {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export const useNodeCardTaskDoc = (options: UseNodeCardTaskDocOptions) => {
  const taskDocPopoverVisible = ref(false)
  const taskDocHovering = ref(false)
  const taskDocLoading = ref(false)
  const taskDocLoaded = ref(false)
  const taskDocText = ref('')
  let taskDocLoadToken = 0

  const nodeTaskName = computed(() => normalizeTaskName(options.node.value.name))

  const resetTaskDocPopover = () => {
    taskDocPopoverVisible.value = false
    taskDocHovering.value = false
    taskDocLoading.value = false
    taskDocLoaded.value = false
    taskDocText.value = ''
  }

  watch(() => options.node.value.node_id, () => {
    resetTaskDocPopover()
  }, { flush: 'sync' })

  const handleTaskDocHoverEnter = () => {
    taskDocHovering.value = true
    const bridgeRequestTaskDoc = options.bridgeRequestTaskDoc.value
    if (!options.isVscodeLaunchEmbed.value || !bridgeRequestTaskDoc) return

    if (taskDocText.value) {
      taskDocPopoverVisible.value = true
      return
    }
    if (taskDocLoading.value || taskDocLoaded.value) return

    const task = nodeTaskName.value
    if (!task) return

    taskDocLoading.value = true
    const token = ++taskDocLoadToken
    void bridgeRequestTaskDoc(task)
      .then((doc) => {
        if (token !== taskDocLoadToken) return
        const normalized = normalizeTaskName(doc)
        taskDocLoaded.value = true
        if (!normalized) {
          taskDocPopoverVisible.value = false
          return
        }
        taskDocText.value = normalized
        if (taskDocHovering.value) {
          taskDocPopoverVisible.value = true
        }
      })
      .catch(() => {
        if (token !== taskDocLoadToken) return
        taskDocLoaded.value = false
        taskDocPopoverVisible.value = false
      })
      .finally(() => {
        if (token === taskDocLoadToken) {
          taskDocLoading.value = false
        }
      })
  }

  const handleTaskDocHoverLeave = () => {
    taskDocHovering.value = false
    taskDocPopoverVisible.value = false
  }

  const handleRevealClick = () => {
    const bridgeRevealTask = options.bridgeRevealTask.value
    if (!options.isVscodeLaunchEmbed.value || !bridgeRevealTask) return
    const task = nodeTaskName.value
    if (!task) return
    void bridgeRevealTask(task)
  }

  return {
    taskDocPopoverVisible,
    taskDocText,
    handleTaskDocHoverEnter,
    handleTaskDocHoverLeave,
    handleRevealClick,
  }
}
