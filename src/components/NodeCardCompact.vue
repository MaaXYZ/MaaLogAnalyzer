<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested-action-recognition': [node: NodeInfo, actionIndex: number, nestedIndex: number, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()

// Recognition 摘要
const recognitionSummary = computed(() => {
  const list = props.mergedRecognitionList.filter(i => !i.isRoundSeparator)
  const actionLevelRecoCount = props.node.nested_recognition_in_action?.length ?? 0
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
  const groups = props.node.nested_action_nodes
  if (!groups || groups.length === 0) return null
  let totalNodes = 0
  let successNodes = 0
  for (const g of groups) {
    for (const n of g.nested_actions) {
      totalNodes++
      if (n.status === 'success') successNodes++
    }
  }
  return {
    totalNodes,
    allSuccess: totalNodes === successNodes
  }
})

const taskGroups = computed(() => {
  const groups = props.node.nested_action_nodes
  if (!groups || groups.length === 0) return []
  return groups.map((group, groupIdx) => ({
    groupIdx,
    taskId: group.task_id,
    name: group.name,
    status: group.status,
  }))
})

const actionSummary = computed(() => {
  if (!props.node.action_details) return null
  return {
    name: props.node.action_details.name,
    success: props.node.action_details.success,
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
      ...props.node.recognition_attempts.map(attempt => attempt.timestamp),
      ...(props.node.nested_recognition_in_action ?? []).map(attempt => attempt.timestamp),
    ]
    sections.push({
      type: 'recognition',
      ts: pickEarliest(timestamps),
    })
  }

  if (taskSummary.value) {
    sections.push({
      type: 'task',
      ts: pickEarliest((props.node.nested_action_nodes ?? []).map(group => group.timestamp)),
    })
  }

  if (actionSummary.value) {
    const actionTs = pickEarliest([
      props.node.action_details?.start_timestamp,
      props.node.action_details?.end_timestamp,
    ])
    sections.push({
      type: 'action',
      ts: Number.isFinite(actionTs)
        ? actionTs
        : pickEarliest([props.node.end_timestamp, props.node.timestamp]),
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
          {{ taskSummary.totalNodes }} nodes, {{ taskSummary.allSuccess ? 'all ✓' : 'some ✗' }}
        </n-text>
        <n-button
          v-for="group in taskGroups"
          :key="`compact-task-${group.groupIdx}-${group.taskId}`"
          text
          size="tiny"
          :type="group.status === 'success' ? 'success' : 'error'"
          @click="emit('select-flow-item', node, `node.task.${group.groupIdx}.${group.taskId}`)"
        >
          <template #icon>
            <check-circle-outlined v-if="group.status === 'success'" />
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
          :type="actionSummary.success ? 'success' : 'error'"
          @click="emit('select-action', node)"
        >
          <template #icon>
            <check-circle-outlined v-if="actionSummary.success" />
            <close-circle-outlined v-else />
          </template>
          {{ actionSummary.name }}
        </n-button>
      </n-flex>
    </template>
  </n-flex>
</template>
