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
}>()

// Recognition 摘要
const recognitionSummary = computed(() => {
  const list = props.mergedRecognitionList.filter(i => !i.isRoundSeparator)
  if (list.length === 0) return null
  const tried = list.filter(i => i.status !== 'not-recognized').length
  const matched = list.find(i => i.status === 'success')
  return {
    tried,
    total: list.length,
    matchedName: matched?.name ?? null,
    matchedIndex: matched?.attemptIndex ?? null
  }
})

// Action 嵌套摘要
const nestedActionSummary = computed(() => {
  const groups = props.node.nested_action_nodes
  const nestedRecognitionCount = props.node.nested_recognition_in_action?.length ?? 0
  if ((!groups || groups.length === 0) && nestedRecognitionCount === 0) return null
  let totalNodes = 0
  let successNodes = 0
  if (groups) {
    for (const g of groups) {
      for (const n of g.nested_actions) {
        totalNodes++
        if (n.status === 'success') successNodes++
      }
    }
  }
  return {
    totalNodes,
    allSuccess: totalNodes === successNodes
  }
})
</script>

<template>
  <n-flex vertical style="gap: 6px">
    <!-- Recognition 摘要行 -->
    <n-flex v-if="recognitionSummary" align="center" style="gap: 6px">
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
    </n-flex>

    <!-- Action 摘要行 -->
    <n-flex v-if="node.action_details || nestedActionSummary" align="center" style="gap: 6px">
      <n-text depth="3" style="font-size: 12px">Action:</n-text>
      <n-button
        v-if="node.action_details"
        text
        size="tiny"
        :type="node.action_details.success ? 'success' : 'error'"
        @click="emit('select-action', node)"
      >
        <template #icon>
          <check-circle-outlined v-if="node.action_details.success" />
          <close-circle-outlined v-else />
        </template>
        {{ node.action_details.name }}
      </n-button>
      <n-text v-else style="font-size: 12px">sub-flow only</n-text>
      <n-text v-if="nestedActionSummary" style="font-size: 12px">
        · {{ nestedActionSummary.totalNodes }} sub-nodes, {{ nestedActionSummary.allSuccess ? 'all ✓' : 'some ✗' }}
      </n-text>
    </n-flex>
  </n-flex>
</template>
