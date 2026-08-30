<script setup lang="ts">
import { ref, computed, watch, toRef } from 'vue'
import { NCard, NButton, NText, NPopover } from 'naive-ui'
import type { NodeInfo } from '../types'
import { getSettings } from '../utils/settings'
import { extractTime } from '../utils/formatDuration'
import { useNodeCardTaskDoc } from './nodeCard/useNodeCardTaskDoc'
import { useMergedRecognitionList } from './nodeCard/useMergedRecognitionList'
import { filterCollapsedUnrecognizedRounds } from './nodeCard/recognitionRoundState'
import NodeCardDetailed from './NodeCardDetailed.vue'
import NodeCardCompact from './NodeCardCompact.vue'
import NodeCardTree from './NodeCardTree.vue'

// 读取设置（reactive 单例）
const settings = getSettings()

const props = defineProps<{
  node: NodeInfo
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
  bridgeRevealTask?: ((task: string) => Promise<void>) | null
  showTreeCollapseHint?: boolean
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
}>()

// 跟踪哪些识别尝试的嵌套节点是展开的
const expandedAttempts = ref<Map<number, boolean>>(new Map())

// 跟踪用户手动展开的“完全未识别”轮次
const expandedUnrecognizedRounds = ref<Set<number>>(new Set())

// 跟踪 Recognition 部分是否展开
const recognitionExpanded = ref(!settings.defaultCollapseRecognition)

// 跟踪根部 Action 列表是否展开
const actionExpanded = ref(!settings.defaultCollapseRootActionList)

const forceExpandRelatedWhileRunning = computed(() => props.node.status === 'running')
const effectiveRecognitionExpanded = computed(
  () => forceExpandRelatedWhileRunning.value || recognitionExpanded.value,
)
const effectiveActionExpanded = computed(
  () => forceExpandRelatedWhileRunning.value || actionExpanded.value,
)

// 监听node变化，清空展开状态
const syncSectionExpandStateFromSettings = () => {
  recognitionExpanded.value = !settings.defaultCollapseRecognition
  actionExpanded.value = !settings.defaultCollapseRootActionList
}

watch(
  () => props.node?.node_id,
  () => {
    expandedAttempts.value.clear()
    expandedUnrecognizedRounds.value.clear()
    syncSectionExpandStateFromSettings()
  },
  { flush: 'sync' },
)

// 设置变化时同步默认折叠状态（无需切换节点）
watch(
  [() => settings.defaultCollapseRecognition, () => settings.defaultCollapseRootActionList],
  syncSectionExpandStateFromSettings,
  { flush: 'sync' },
)

// 节点状态样式
const cardClass = computed(() => {
  return `node-card node-card-${props.node.status}`
})

// 点击节点
const handleNodeClick = () => {
  emit('select-node', props.node)
}

const {
  taskDocPopoverVisible,
  taskDocText,
  handleTaskDocHoverEnter,
  handleTaskDocHoverLeave,
  handleRevealClick,
} = useNodeCardTaskDoc({
  node: toRef(props, 'node'),
  isVscodeLaunchEmbed: toRef(props, 'isVscodeLaunchEmbed'),
  bridgeRequestTaskDoc: toRef(props, 'bridgeRequestTaskDoc'),
  bridgeRevealTask: toRef(props, 'bridgeRevealTask'),
})

// 切换嵌套节点的显示/隐藏
const toggleNestedNodes = (attemptIndex: number) => {
  const current = isExpanded(attemptIndex)
  expandedAttempts.value.set(attemptIndex, !current)
}

// 检查嵌套识别节点是否展开
const isExpanded = (attemptIndex: number) => {
  if (forceExpandRelatedWhileRunning.value) return true
  const value = expandedAttempts.value.get(attemptIndex)
  return value !== undefined ? value : !settings.defaultCollapseNestedRecognition
}

const { visibleRecognitionList, fullyUnrecognizedRoundIndexes } = useMergedRecognitionList({
  node: toRef(props, 'node'),
  showNotRecognizedNodes: computed(() => settings.showNotRecognizedNodes),
})

const isUnrecognizedRoundExpanded = (roundIndex: number): boolean => {
  if (forceExpandRelatedWhileRunning.value) return true
  return expandedUnrecognizedRounds.value.has(roundIndex)
}

const toggleUnrecognizedRound = (roundIndex: number) => {
  const next = new Set(expandedUnrecognizedRounds.value)
  if (next.has(roundIndex)) {
    next.delete(roundIndex)
  } else {
    next.add(roundIndex)
  }
  expandedUnrecognizedRounds.value = next
}

const displayedRecognitionList = computed(() =>
  filterCollapsedUnrecognizedRounds(
    visibleRecognitionList.value,
    fullyUnrecognizedRoundIndexes.value,
    isUnrecognizedRoundExpanded,
  ),
)

const sharedNodeCardBaseProps = computed(() => ({
  node: props.node,
  mergedRecognitionList: visibleRecognitionList.value,
  isVscodeLaunchEmbed: props.isVscodeLaunchEmbed,
  bridgeRequestTaskDoc: props.bridgeRequestTaskDoc,
}))

const sharedExpandableViewProps = computed(() => ({
  ...sharedNodeCardBaseProps.value,
  mergedRecognitionList: displayedRecognitionList.value,
  recognitionExpanded: effectiveRecognitionExpanded.value,
  actionExpanded: effectiveActionExpanded.value,
  defaultCollapseNestedRecognition: settings.defaultCollapseNestedRecognition,
  defaultCollapseNestedActionNodes: settings.defaultCollapseNestedActionNodes,
  isExpanded,
  forceExpandRelatedWhileRunning: forceExpandRelatedWhileRunning.value,
  fullyUnrecognizedRoundIndexes: fullyUnrecognizedRoundIndexes.value,
  isUnrecognizedRoundExpanded,
}))

const handleSelectAction = (node: NodeInfo) => {
  emit('select-action', node)
}

const handleSelectRecognition = (node: NodeInfo, attemptIndex: number) => {
  emit('select-recognition', node, attemptIndex)
}

const handleSelectFlowItem = (node: NodeInfo, flowItemId: string) => {
  emit('select-flow-item', node, flowItemId)
}

const toggleRecognitionSection = () => {
  recognitionExpanded.value = !recognitionExpanded.value
}

const toggleActionSection = () => {
  actionExpanded.value = !actionExpanded.value
}
</script>

<template>
  <div :class="cardClass">
    <n-card size="small" :bordered="true">
      <!-- Header: 节点名称按钮 + 时间 -->
      <template #header>
        <div style="display: flex; align-items: center; gap: 8px">
          <n-popover
            v-if="taskDocText"
            trigger="manual"
            :show="taskDocPopoverVisible"
            :show-arrow="true"
            style="max-width: 420px"
          >
            <template #trigger>
              <span @mouseenter="handleTaskDocHoverEnter" @mouseleave="handleTaskDocHoverLeave">
                <n-button size="small" @click="handleNodeClick">
                  {{ node.name }}
                </n-button>
              </span>
            </template>
            <n-text style="white-space: pre-wrap; line-height: 1.5; font-size: 12px">
              {{ taskDocText }}
            </n-text>
          </n-popover>
          <span v-else @mouseenter="handleTaskDocHoverEnter" @mouseleave="handleTaskDocHoverLeave">
            <n-button size="small" @click="handleNodeClick">
              {{ node.name }}
            </n-button>
          </span>

          <n-button
            v-if="isVscodeLaunchEmbed"
            size="small"
            secondary
            @click.stop="handleRevealClick"
          >
            Reveal
          </n-button>
          <n-text depth="3" style="font-size: 12px">
            {{ extractTime(node.ts) }}
          </n-text>
        </div>
      </template>

      <!-- Content: 根据显示模式切换 -->
      <div style="display: flex; flex-direction: column; gap: 12px">
        <node-card-detailed
          v-if="settings.displayMode === 'detailed'"
          v-bind="sharedExpandableViewProps"
          @select-action="handleSelectAction"
          @select-recognition="handleSelectRecognition"
          @select-flow-item="handleSelectFlowItem"
          @toggle-recognition="toggleRecognitionSection"
          @toggle-action="toggleActionSection"
          @toggle-nested="toggleNestedNodes"
          @toggle-unrecognized-round="toggleUnrecognizedRound"
        />
        <node-card-compact
          v-else-if="settings.displayMode === 'compact'"
          v-bind="sharedNodeCardBaseProps"
          @select-action="handleSelectAction"
          @select-recognition="handleSelectRecognition"
          @select-flow-item="handleSelectFlowItem"
        />
        <node-card-tree
          v-else
          v-bind="sharedExpandableViewProps"
          :show-tree-collapse-hint="showTreeCollapseHint"
          @select-action="handleSelectAction"
          @select-recognition="handleSelectRecognition"
          @select-flow-item="handleSelectFlowItem"
          @toggle-recognition="toggleRecognitionSection"
          @toggle-action="toggleActionSection"
          @toggle-nested="toggleNestedNodes"
          @toggle-unrecognized-round="toggleUnrecognizedRound"
        />
      </div>
    </n-card>
  </div>
</template>

<style scoped>
.node-card {
  position: relative;
  padding-left: 20px;
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

.node-card-running::before {
  background: #f0a020;
}

.node-card-failed::before {
  background: #d03050;
}

.node-card :deep(.n-card) {
  transition: box-shadow 0.3s;
}

.node-card:hover :deep(.n-card) {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

@media (max-width: 768px) {
  .node-card {
    padding-left: 12px;
  }
  .node-card::before {
    width: 8px;
    height: 8px;
  }
}
</style>
