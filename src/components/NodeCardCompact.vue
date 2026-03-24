<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import {
  buildNodeActionLevelRecognitionItems,
  buildNodeActionRootItem,
  buildNodeRecognitionAttempts,
  buildNodeTaskFlowItems,
} from '../utils/nodeFlow'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
}>()

const emit = defineEmits<{
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()

const recognitionAttempts = computed(() => buildNodeRecognitionAttempts(props.node))
const actionLevelRecoItems = computed(() => buildNodeActionLevelRecognitionItems(props.node))
const taskItems = computed(() => buildNodeTaskFlowItems(props.node))
const actionRootItem = computed(() => buildNodeActionRootItem(props.node))

// Recognition 摘要
const recognitionSummary = computed(() => {
  const list = props.mergedRecognitionList.filter(i => !i.isRoundSeparator)
  const actionLevelRecoCount = actionLevelRecoItems.value.length
  if (list.length === 0 && actionLevelRecoCount === 0) return null
  const tried = list.filter(i => i.status !== 'not-recognized').length
  const matched = list.find(i => i.status === 'success')
  return {
    tried,
    total: list.length,
    matchedName: matched?.name ?? null,
    matchedIndex: matched?.attemptIndex ?? null,
    actionLevelRecoCount,
  }
})

// Task 嵌套摘要
const taskSummary = computed(() => {
  const groups = taskItems.value
  if (groups.length === 0) return null
  let totalNodes = 0
  let successNodes = 0
  let failedNodes = 0
  let runningNodes = 0
  for (const g of groups) {
    const nestedNodes = (g.children ?? []).filter(item => item.type === 'pipeline_node')
    for (const n of nestedNodes) {
      totalNodes++
      if (n.status === 'success') successNodes++
      else if (n.status === 'failed') failedNodes++
      else if (n.status === 'running') runningNodes++
    }
  }
  return {
    totalNodes,
    allSuccess: totalNodes === successNodes,
    failedNodes,
    runningNodes,
  }
})

const taskGroups = computed(() => {
  const groups = taskItems.value
  if (groups.length === 0) return []
  return groups.map((group, groupIdx) => ({
    groupIdx,
    taskId: group.task_id || 0,
    flowItemId: group.id,
    name: group.name,
    status: group.status,
  }))
})

const actionSummary = computed(() => {
  if (actionRootItem.value) {
    return {
      name: actionRootItem.value.name,
      status: actionRootItem.value.status,
      flowItemId: actionRootItem.value.id,
      useFlowItem: true,
    }
  }
  if (!props.node.action_details) return null
  return {
    name: props.node.action_details.name,
    status: props.node.status === 'running' ? 'running' : (props.node.action_details.success ? 'success' : 'failed'),
    flowItemId: null,
    useFlowItem: false,
  }
})

const toTimestampMs = (timestamp?: string): number => {
  if (!timestamp) return Number.POSITIVE_INFINITY
  const normalized = timestamp.includes(' ') ? timestamp.replace(' ', 'T') : timestamp
  const parsed = Date.parse(normalized)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

const pickEarliest = (timestamps: Array<string | undefined>): number => {
  const values = timestamps.map(toTimestampMs).filter(value => Number.isFinite(value))
  return values.length > 0 ? Math.min(...values) : Number.POSITIVE_INFINITY
}

const sectionOrder = computed<Array<'recognition' | 'task' | 'action'>>(() => {
  const sections: Array<{ type: 'recognition' | 'task' | 'action'; ts: number }> = []

  if (recognitionSummary.value) {
    const timestamps = [
      ...recognitionAttempts.value.map(attempt => attempt.ts),
      ...actionLevelRecoItems.value.map(item => item.ts),
    ]
    sections.push({
      type: 'recognition',
      ts: pickEarliest(timestamps),
    })
  }

  if (taskSummary.value) {
    sections.push({
      type: 'task',
      ts: pickEarliest(taskItems.value.map(group => group.ts)),
    })
  }

  if (actionSummary.value) {
    const actionTs = pickEarliest([
      props.node.action_details?.ts,
      props.node.action_details?.end_ts,
    ])
    sections.push({
      type: 'action',
      ts: Number.isFinite(actionTs)
        ? actionTs
        : pickEarliest([props.node.end_ts, props.node.ts]),
    })
  }

  return sections
    .sort((a, b) => a.ts - b.ts)
    .map(section => section.type)
})
</script>

<template>
  <n-flex vertical style="gap: 6px">
    <template v-for="section in sectionOrder" :key="section">
      <n-flex v-if="section === 'recognition' && recognitionSummary" align="center" style="gap: 6px">
        <n-text depth="3" style="font-size: 12px">Recognition:</n-text>
        <n-text style="font-size: 12px">
          {{ recognitionSummary.tried }} tried{{ recognitionSummary.matchedName ? ',' : '' }}
        </n-text>
        <n-button
          v-if="recognitionSummary.matchedName"
          text
          size="tiny"
          type="success"
          @click="emit('select-recognition', node, recognitionSummary.matchedIndex!)"
        >
          <template #icon>
            <check-circle-outlined />
          </template>
          {{ recognitionSummary.matchedName }} matched
        </n-button>
        <n-text v-if="recognitionSummary.actionLevelRecoCount > 0" style="font-size: 12px">
          · action-reco {{ recognitionSummary.actionLevelRecoCount }}
        </n-text>
      </n-flex>

      <n-flex v-else-if="section === 'task' && taskSummary" align="center" style="gap: 6px">
        <n-text depth="3" style="font-size: 12px">Task:</n-text>
        <n-text style="font-size: 12px">
          {{ taskSummary.totalNodes }} nodes, {{ taskSummary.allSuccess ? 'all ✓' : taskSummary.failedNodes > 0 ? 'some ✗' : taskSummary.runningNodes > 0 ? 'running…' : 'partial' }}
        </n-text>
          <n-button
            v-for="group in taskGroups"
            :key="`compact-task-${group.groupIdx}-${group.taskId}`"
            text
            size="tiny"
            :type="group.status === 'success' ? 'success' : group.status === 'running' ? 'warning' : 'error'"
            @click="emit('select-flow-item', node, group.flowItemId)"
          >
            <template #icon>
              <check-circle-outlined v-if="group.status === 'success'" />
              <loading-outlined v-else-if="group.status === 'running'" />
              <close-circle-outlined v-else />
            </template>
            {{ group.name }}
          </n-button>
      </n-flex>

      <n-flex v-else-if="section === 'action' && actionSummary" align="center" style="gap: 6px">
        <n-text depth="3" style="font-size: 12px">Action:</n-text>
        <n-button
          text
          size="tiny"
          :type="actionSummary.status === 'success' ? 'success' : actionSummary.status === 'running' ? 'warning' : 'error'"
          @click="actionSummary.useFlowItem && actionSummary.flowItemId ? emit('select-flow-item', node, actionSummary.flowItemId) : emit('select-action', node)"
        >
          <template #icon>
            <check-circle-outlined v-if="actionSummary.status === 'success'" />
            <loading-outlined v-else-if="actionSummary.status === 'running'" />
            <close-circle-outlined v-else />
          </template>
          {{ actionSummary.name }}
        </n-button>
      </n-flex>
    </template>
  </n-flex>
</template>
