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
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested-action-recognition': [node: NodeInfo, actionIndex: number, nestedIndex: number, attemptIndex: number]
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

  const attempts = props.node.recognition_attempts ?? []
  const nextList = props.node.next_list ?? []

  if (!attempts.length) {
    if (nextList.length > 0) {
      nextList.forEach((nextItem) => {
        const prefixes: string[] = []
        if (nextItem.anchor) prefixes.push('[Anchor]')
        if (nextItem.jump_back) prefixes.push('[JumpBack]')
        const displayName = prefixes.length > 0 ? `${prefixes.join('')} ${nextItem.name}` : nextItem.name
        result.push({
          name: displayName,
          status: 'not-recognized'
        })
      })
    }
    return result
  }

  // 多轮识别：先按尝试序列切分轮次，再在轮内按 next_list 顺序展示。
  const nextIndexMap = new Map<string, number>()
  const nextDisplayMap = new Map<string, string>()
  nextList.forEach((nextItem, idx) => {
    if (!nextIndexMap.has(nextItem.name)) {
      nextIndexMap.set(nextItem.name, idx)
      const prefixes: string[] = []
      if (nextItem.anchor) prefixes.push('[Anchor]')
      if (nextItem.jump_back) prefixes.push('[JumpBack]')
      const displayName = prefixes.length > 0 ? `${prefixes.join('')} ${nextItem.name}` : nextItem.name
      nextDisplayMap.set(nextItem.name, displayName)
    }
  })

  type RoundAttempt = { attempt: RecognitionAttempt; index: number }
  const rounds: RoundAttempt[][] = [[]]
  let currentRound = 0
  let expectedNextIndex = 0

  attempts.forEach((attempt, index) => {
    const nextIndex = nextIndexMap.get(attempt.name)
    const hasRoundData = rounds[currentRound].length > 0

    // 命中 next_list 顺序回退时，认为进入新一轮。
    if (hasRoundData && nextIndex != null && nextIndex < expectedNextIndex) {
      rounds.push([])
      currentRound += 1
      expectedNextIndex = 0
    }

    rounds[currentRound].push({ attempt, index })

    if (nextIndex != null) {
      expectedNextIndex = nextIndex + 1
    }

    // 命中成功后通常进入下一轮（同节点重试场景）。
    if (attempt.status === 'success') {
      rounds.push([])
      currentRound += 1
      expectedNextIndex = 0
    }
  })

  while (rounds.length > 0 && rounds[rounds.length - 1].length === 0) {
    rounds.pop()
  }

  const useRoundSeparator = rounds.length > 1

  rounds.forEach((roundAttempts, roundIdx) => {
    if (useRoundSeparator) {
      result.push({
        name: `—— 第 ${roundIdx + 1} 轮 ——`,
        status: 'not-recognized',
        isRoundSeparator: true,
        roundIndex: roundIdx + 1,
      })
    }

    const ordered = [...roundAttempts].sort((a, b) => {
      const ai = nextIndexMap.get(a.attempt.name)
      const bi = nextIndexMap.get(b.attempt.name)
      const aOrder = ai == null ? Number.MAX_SAFE_INTEGER : ai
      const bOrder = bi == null ? Number.MAX_SAFE_INTEGER : bi
      if (aOrder !== bOrder) return aOrder - bOrder
      return a.index - b.index
    })

    ordered.forEach(({ attempt, index }) => {
      const name = nextDisplayMap.get(attempt.name) ?? attempt.name
      result.push({
        name,
        status: attempt.status,
        attemptIndex: index,
        attempt,
        hasNestedNodes: !!(attempt.nested_nodes && attempt.nested_nodes.length > 0)
      })
    })
  })

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
          @select-action-recognition="(n, i) => emit('select-action-recognition', n, i)"
          @select-nested-action-recognition="(n, ai, ni, i) => emit('select-nested-action-recognition', n, ai, ni, i)"
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
          @select-action-recognition="(n, i) => emit('select-action-recognition', n, i)"
          @select-nested-action-recognition="(n, ai, ni, i) => emit('select-nested-action-recognition', n, ai, ni, i)"
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
          @select-action-recognition="(n, i) => emit('select-action-recognition', n, i)"
          @select-nested-action-recognition="(n, ai, ni, i) => emit('select-nested-action-recognition', n, ai, ni, i)"
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
