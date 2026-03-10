<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NCard, NButton, NFlex, NText } from 'naive-ui'
import type { NodeInfo, RecognitionAttempt, MergedRecognitionItem } from '../types'
import { getSettings } from '../utils/settings'
import { extractTime } from '../utils/formatDuration'
import NodeCardDetailed from './NodeCardDetailed.vue'
import NodeCardCompact from './NodeCardCompact.vue'
import NodeCardTree from './NodeCardTree.vue'

// 读取设置（reactive 单例）
const settings = getSettings()

const props = defineProps<{
  node: NodeInfo
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
}>()

// 跟踪哪些识别尝试的嵌套节点是展开的
const expandedAttempts = ref<Map<number, boolean>>(new Map())

// 跟踪 Recognition 部分是否展开
const recognitionExpanded = ref(!settings.defaultCollapseRecognition)

// 跟踪 Action 部分是否展开
const actionExpanded = ref(!settings.defaultCollapseAction)

// 监听node变化，清空展开状态
watch(() => props.node?.node_id, () => {
  expandedAttempts.value.clear()
  recognitionExpanded.value = !settings.defaultCollapseRecognition
  actionExpanded.value = !settings.defaultCollapseAction
}, { flush: 'sync' })

// 节点状态样式
const cardClass = computed(() => {
  return `node-card node-card-${props.node.status}`
})

// 点击节点
const handleNodeClick = () => {
  emit('select-node', props.node)
}

// 切换嵌套节点的显示/隐藏
const toggleNestedNodes = (attemptIndex: number) => {
  const current = isExpanded(attemptIndex)
  expandedAttempts.value.set(attemptIndex, !current)
}

// 检查嵌套识别节点是否展开
const isExpanded = (attemptIndex: number) => {
  const value = expandedAttempts.value.get(attemptIndex)
  return value !== undefined ? value : !settings.defaultCollapseNestedRecognition
}

// 合并 next_list 和 recognition_attempts
const mergedRecognitionList = computed<MergedRecognitionItem[]>(() => {
  const result: MergedRecognitionItem[] = []

  const attemptMap = new Map<string, Array<{ attempt: RecognitionAttempt, index: number }>>()
  if (props.node.recognition_attempts) {
    props.node.recognition_attempts.forEach((attempt, idx) => {
      const entries = attemptMap.get(attempt.name)
      if (entries) {
        entries.push({ attempt, index: idx })
      } else {
        attemptMap.set(attempt.name, [{ attempt, index: idx }])
      }
    })
  }

  if (props.node.next_list && props.node.next_list.length > 0) {
    props.node.next_list.forEach((nextItem) => {
      const entries = attemptMap.get(nextItem.name)
      if (entries) {
        for (const attemptInfo of entries) {
          result.push({
            name: nextItem.name,
            status: attemptInfo.attempt.status,
            attemptIndex: attemptInfo.index,
            attempt: attemptInfo.attempt,
            hasNestedNodes: attemptInfo.attempt.nested_nodes && attemptInfo.attempt.nested_nodes.length > 0
          })
        }
      } else {
        result.push({
          name: nextItem.name,
          status: 'not-recognized'
        })
      }
    })
  } else {
    if (props.node.recognition_attempts) {
      props.node.recognition_attempts.forEach((attempt, idx) => {
        result.push({
          name: attempt.name,
          status: attempt.status,
          attemptIndex: idx,
          attempt: attempt,
          hasNestedNodes: attempt.nested_nodes && attempt.nested_nodes.length > 0
        })
      })
    }
  }

  return result
})

type ButtonType = 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'

// 获取按钮类型
const getButtonType = (status: string): ButtonType => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'warning'
  return 'default'
}

// 动作按钮类型
const actionButtonType = computed<ButtonType>(() => {
  if (!props.node.action_details) return 'default'
  // 如果嵌套动作组中有失败的，整体显示为失败
  if (props.node.nested_action_nodes?.some(g => g.status === 'failed')) return 'error'
  return props.node.action_details.success ? 'success' : 'error'
})
</script>

<template>
  <div :class="cardClass">
    <n-card
      size="small"
      :bordered="true"
    >
      <!-- Header: 节点名称按钮 + 时间 -->
      <template #header>
        <n-flex align="center" style="gap: 8px">
          <n-button
            size="small"
            @click="handleNodeClick"
          >
            {{ node.name }}
          </n-button>
          <n-text depth="3" style="font-size: 12px">
            {{ extractTime(node.timestamp) }}
          </n-text>
        </n-flex>
      </template>

      <!-- Content: 根据显示模式切换 -->
      <n-flex vertical style="gap: 12px">
        <node-card-detailed
          v-if="settings.displayMode === 'detailed'"
          :node="node"
          :merged-recognition-list="mergedRecognitionList"
          :recognition-expanded="recognitionExpanded"
          :action-expanded="actionExpanded"
          :is-expanded="isExpanded"
          :get-button-type="getButtonType"
          :action-button-type="actionButtonType"
          @select-node="emit('select-node', $event)"
          @select-action="emit('select-action', $event)"
          @select-recognition="(n, i) => emit('select-recognition', n, i)"
          @select-nested="(n, ai, ni) => emit('select-nested', n, ai, ni)"
          @select-nested-action="(n, ai, ni) => emit('select-nested-action', n, ai, ni)"
          @toggle-recognition="recognitionExpanded = !recognitionExpanded"
          @toggle-action="actionExpanded = !actionExpanded"
          @toggle-nested="toggleNestedNodes"
        />
        <node-card-compact
          v-else-if="settings.displayMode === 'compact'"
          :node="node"
          :merged-recognition-list="mergedRecognitionList"
          @select-node="emit('select-node', $event)"
          @select-action="emit('select-action', $event)"
          @select-recognition="(n, i) => emit('select-recognition', n, i)"
          @select-nested="(n, ai, ni) => emit('select-nested', n, ai, ni)"
          @select-nested-action="(n, ai, ni) => emit('select-nested-action', n, ai, ni)"
        />
        <node-card-tree
          v-else
          :node="node"
          :merged-recognition-list="mergedRecognitionList"
          :recognition-expanded="recognitionExpanded"
          :action-expanded="actionExpanded"
          :is-expanded="isExpanded"
          @select-node="emit('select-node', $event)"
          @select-action="emit('select-action', $event)"
          @select-recognition="(n, i) => emit('select-recognition', n, i)"
          @select-nested="(n, ai, ni) => emit('select-nested', n, ai, ni)"
          @select-nested-action="(n, ai, ni) => emit('select-nested-action', n, ai, ni)"
          @toggle-recognition="recognitionExpanded = !recognitionExpanded"
          @toggle-action="actionExpanded = !actionExpanded"
          @toggle-nested="toggleNestedNodes"
        />
      </n-flex>
    </n-card>
  </div>
</template>

<style scoped>
.node-card {
  position: relative;
  padding-left: 20px;
  transition: all 0.3s;
}

.node-card::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid #18181c;
}

.node-card-success::before {
  background: #63e2b7;
}

.node-card-failed::before {
  background: #d03050;
}

.node-card:hover {
  transform: translateX(4px);
}

.node-card :deep(.n-card) {
  transition: box-shadow 0.3s;
}

.node-card:hover :deep(.n-card) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .node-card { padding-left: 12px; }
  .node-card:hover { transform: none; }
  .node-card::before { width: 8px; height: 8px; }
}
</style>
