import { computed, type Ref } from 'vue'
import type { AiLoadedTarget } from '../../../ai/contextBuilder'
import type { NodeInfo, TaskInfo } from '../../../types'
import type { AnalysisFocusMode } from '../types'

export interface QuickPromptItem {
  label: string
  prompt: string
  forceProfile?: 'diagnostic' | 'followup'
  focusMode?: AnalysisFocusMode
}

interface UseAiViewStateOptions {
  tasks: Ref<TaskInfo[]>
  selectedTask: Ref<TaskInfo | null>
  selectedNode: Ref<NodeInfo | null>
  selectedFlowItemId: Ref<string | null>
  loadedTargets: Ref<AiLoadedTarget[]>
  loadedDefaultTargetId: Ref<string>
  includeSelectedNodeFocus: Ref<boolean>
  question: Ref<string>
  quickPromptProfileOverride: Ref<'diagnostic' | 'followup' | null>
  quickPromptFocusOverride: Ref<AnalysisFocusMode | null>
}

export const useAiViewState = (options: UseAiViewStateOptions) => {
  const selectedTaskTitle = computed(() => {
    const task = options.selectedTask.value
    if (!task) return '未选择任务'
    return `#${task.task_id} ${task.entry}`
  })

  const sourceLabel = computed(() => {
    const loadedTargets = options.loadedTargets.value
    if (!loadedTargets.length) return '未加载日志'

    const preferred = loadedTargets.find(item => item.id === options.loadedDefaultTargetId.value)
    if (preferred) return preferred.fileName || preferred.label

    return loadedTargets[0].fileName || loadedTargets[0].label
  })

  const selectedNodeFocusEnabled = computed(() => options.includeSelectedNodeFocus.value)
  const effectiveSelectedNode = computed(() => (
    selectedNodeFocusEnabled.value ? options.selectedNode.value : null
  ))
  const effectiveSelectedFlowItemId = computed(() => (
    selectedNodeFocusEnabled.value ? options.selectedFlowItemId.value : null
  ))

  const selectedNodeFocusDetail = computed(() => {
    if (!selectedNodeFocusEnabled.value) {
      return '仅发送任务级上下文。'
    }
    const focusNode = effectiveSelectedNode.value
    if (!focusNode) {
      return '当前未选中节点，按任务级上下文分析。'
    }
    const task = options.selectedTask.value
    const flowPart = effectiveSelectedFlowItemId.value ? ` · 流项: ${effectiveSelectedFlowItemId.value}` : ''
    if (task && task.task_id === focusNode.task_id) {
      return `已聚焦节点 #${focusNode.node_id} ${focusNode.name}${flowPart}`
    }
    return `已聚焦任务 #${focusNode.task_id} 的节点 #${focusNode.node_id} ${focusNode.name}${flowPart}`
  })

  const currentContextKey = computed(() => {
    const task = options.selectedTask.value
    const focusNode = effectiveSelectedNode.value
    const focusNodePart = focusNode
      ? `focusNode:${focusNode.node_id}@${focusNode.ts}`
      : 'focusNode:none'
    const focusFlowPart = `focusFlow:${effectiveSelectedFlowItemId.value ?? 'none'}`
    const focusModePart = `focusMode:${selectedNodeFocusEnabled.value ? 'enabled' : 'disabled'}`
    const source = sourceLabel.value

    if (!task) {
      return `none|tasks:${options.tasks.value.length}|${focusModePart}|${focusNodePart}|${focusFlowPart}|source:${source}`
    }

    const tailNode = task.nodes.length > 0 ? task.nodes[task.nodes.length - 1] : null
    return [
      `task:${task.task_id}`,
      `status:${task.status}`,
      `nodes:${task.nodes.length}`,
      `tailNode:${tailNode?.node_id ?? -1}`,
      `tailTs:${tailNode?.ts ?? task.end_time ?? task.start_time}`,
      focusModePart,
      focusNodePart,
      focusFlowPart,
      `source:${source}`,
    ].join('|')
  })

  const quickPrompts: QuickPromptItem[] = [
    {
      label: '失败根因',
      prompt: '请先量化盘点，再给出当前任务最可能的失败根因与3条可执行验证步骤。',
      forceProfile: 'diagnostic',
      focusMode: 'general',
    },
    {
      label: 'on_error链路',
      prompt: '请只聚焦 on_error 触发链路，说明触发源、后续结果和最小修复动作。',
      forceProfile: 'diagnostic',
      focusMode: 'on_error',
    },
    {
      label: '识别热点',
      prompt: '请按失败率列出前3个识别热点，并给出每个热点的修复优先级与验证方式。',
      forceProfile: 'diagnostic',
      focusMode: 'hotspot',
    },
  ]

  const applyQuickPrompt = (item: QuickPromptItem) => {
    options.question.value = item.prompt
    options.quickPromptProfileOverride.value = item.forceProfile ?? null
    options.quickPromptFocusOverride.value = item.focusMode ?? null
  }

  const handleApplyQuickPrompt = (index: number) => {
    const item = quickPrompts[index]
    if (!item) return
    applyQuickPrompt(item)
  }

  return {
    selectedTaskTitle,
    sourceLabel,
    selectedNodeFocusEnabled,
    effectiveSelectedNode,
    effectiveSelectedFlowItemId,
    selectedNodeFocusDetail,
    currentContextKey,
    quickPrompts,
    handleApplyQuickPrompt,
  }
}
