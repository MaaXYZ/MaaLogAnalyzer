<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem, RecognitionAttempt, UnifiedFlowItem } from '../types'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded?: boolean
  actionExpanded?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded?: (attemptIndex: number) => boolean
}>()

const emit = defineEmits<{
  'select-node': [node: NodeInfo]
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

interface FlattenedFlowItem {
  item: UnifiedFlowItem
  depth: number
  hasChildren: boolean
  expanded: boolean
}

interface FlattenedNestedRecognition {
  attempt: RecognitionAttempt
  flowItemId: string
  depth: number
}

const flattenNestedRecognitionNodes = (
  attempts: RecognitionAttempt[] | undefined,
  parentFlowItemId: string,
  depth = 1
): FlattenedNestedRecognition[] => {
  if (!attempts || attempts.length === 0) return []

  const result: FlattenedNestedRecognition[] = []
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const flowItemId = `${parentFlowItemId}.nested.${i}`
    result.push({
      attempt,
      flowItemId,
      depth,
    })
    if (attempt.nested_nodes && attempt.nested_nodes.length > 0) {
      result.push(...flattenNestedRecognitionNodes(attempt.nested_nodes, flowItemId, depth + 1))
    }
  }
  return result
}

const isRecognitionNestedExpanded = (attemptIndex: number): boolean => {
  if (props.isExpanded) return props.isExpanded(attemptIndex)
  return true
}

const expandedFlowItems = ref<Map<string, boolean>>(new Map())

const isFlowItemExpanded = (flowItemId: string): boolean => {
  const value = expandedFlowItems.value.get(flowItemId)
  if (value !== undefined) return value
  return !(props.defaultCollapseNestedActionNodes ?? true)
}

const toggleFlowItemExpand = (flowItemId: string) => {
  expandedFlowItems.value.set(flowItemId, !isFlowItemExpanded(flowItemId))
}

const resetFlowItemExpandState = () => {
  expandedFlowItems.value.clear()
}

watch(() => props.node.node_id, resetFlowItemExpandState, { flush: 'sync' })
watch(() => props.defaultCollapseNestedActionNodes, resetFlowItemExpandState, { flush: 'sync' })

const flattenFlowItemsForTree = (
  items: UnifiedFlowItem[] | undefined,
  isExpanded: (flowItemId: string) => boolean,
  depth = 0
): FlattenedFlowItem[] => {
  if (!items || items.length === 0) return []
  const rows: FlattenedFlowItem[] = []
  for (const item of items) {
    const hasChildren = !!(item.children && item.children.length > 0)
    const expanded = hasChildren ? isExpanded(item.id) : false
    rows.push({ item, depth, hasChildren, expanded })
    if (hasChildren && expanded) {
      rows.push(...flattenFlowItemsForTree(item.children, isExpanded, depth + 1))
    }
  }
  return rows
}

const rootFlowItems = computed(() => props.node.flow_items ?? [])
const flowRows = computed(() => flattenFlowItemsForTree(rootFlowItems.value, isFlowItemExpanded))
const isRecognitionExpanded = computed(() => props.recognitionExpanded ?? true)
const isActionExpanded = computed(() => props.actionExpanded ?? true)
const actionLevelRecognitions = computed(() => props.node.nested_recognition_in_action ?? [])

const getFlowItemButtonType = (item: UnifiedFlowItem): 'success' | 'warning' | 'error' | 'info' => {
  if (item.status === 'success') return 'success'
  if (item.type === 'recognition' || item.type === 'recognition_node') return 'warning'
  return 'error'
}

const getRecognitionButtonType = (status: MergedRecognitionItem['status']): 'success' | 'warning' | 'default' => {
  if (status === 'success') return 'success'
  if (status === 'failed') return 'warning'
  return 'default'
}

const getFlowItemTypeLabel = (type: UnifiedFlowItem['type']) => {
  switch (type) {
    case 'task': return 'Task'
    case 'pipeline_node': return 'Pipeline'
    case 'recognition': return 'Rec'
    case 'recognition_node': return 'RecNode'
    case 'action': return 'Action'
    case 'action_node': return 'ActNode'
    default: return type
  }
}
</script>

<template>
  <div class="tree-view">
    <n-flex align="center" style="gap: 4px; margin-bottom: 2px">
      <span
        class="tree-toggle"
        :class="{ 'tree-toggle-collapsed': !isRecognitionExpanded }"
        @click="emit('toggle-recognition')"
      />
      <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-recognition')">Recognition</n-text>
    </n-flex>

    <ul v-if="isRecognitionExpanded && mergedRecognitionList.length > 0" class="tree-list">
      <li
        v-for="(item, index) in mergedRecognitionList"
        :key="`tree-rec-${index}`"
        class="tree-item"
      >
        <n-text v-if="item.isRoundSeparator" depth="3" class="tree-round-separator-text">
          {{ item.name }}
        </n-text>
        <n-button
          v-else-if="item.status === 'not-recognized'"
          text
          size="tiny"
          type="default"
          disabled
          style="opacity: 0.5"
        >
          {{ item.name }}
        </n-button>
        <template v-else>
          <n-flex
            v-if="item.hasNestedNodes && item.attemptIndex != null"
            align="center"
            style="gap: 4px"
          >
            <span
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isRecognitionNestedExpanded(item.attemptIndex) }"
              @click.stop="emit('toggle-nested', item.attemptIndex)"
            />
            <n-button
              text
              size="tiny"
              :type="getRecognitionButtonType(item.status)"
              @click="emit('select-recognition', node, item.attemptIndex)"
            >
              <template #icon>
                <check-circle-outlined v-if="item.status === 'success'" />
                <close-circle-outlined v-else />
              </template>
              {{ item.name }}
            </n-button>
          </n-flex>
          <n-button
            v-else
            text
            size="tiny"
            :type="getRecognitionButtonType(item.status)"
            @click="item.attemptIndex != null ? emit('select-recognition', node, item.attemptIndex) : undefined"
          >
            <template #icon>
              <check-circle-outlined v-if="item.status === 'success'" />
              <close-circle-outlined v-else />
            </template>
            {{ item.name }}
          </n-button>

          <ul
            v-if="item.hasNestedNodes && item.attemptIndex != null && isRecognitionNestedExpanded(item.attemptIndex) && item.attempt?.nested_nodes && item.attempt.nested_nodes.length > 0"
            class="tree-list"
          >
            <li
              v-for="nested in flattenNestedRecognitionNodes(item.attempt.nested_nodes, `node.recognition.${item.attemptIndex}`)"
              :key="`tree-rec-nested-${item.attemptIndex}-${nested.flowItemId}`"
              class="tree-item"
            >
              <n-button
                text
                size="tiny"
                :type="nested.attempt.status === 'success' ? 'success' : 'warning'"
                :style="{ marginLeft: `${nested.depth * 12}px` }"
                @click="emit('select-flow-item', node, nested.flowItemId)"
              >
                <template #icon>
                  <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                [RecNode] {{ nested.attempt.name }}
              </n-button>
            </li>
          </ul>
        </template>
      </li>
    </ul>

    <div style="margin-top: 4px">
      <n-flex align="center" style="gap: 4px">
        <span
          class="tree-toggle"
          :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
          @click="emit('toggle-action')"
        />
        <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-action')">Action</n-text>
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
      </n-flex>
    </div>

    <ul v-if="isActionExpanded && (actionLevelRecognitions.length > 0 || flowRows.length > 0)" class="tree-list">
      <li
        v-for="(attempt, attemptIndex) in actionLevelRecognitions"
        :key="`tree-action-reco-${attemptIndex}`"
        class="tree-item"
      >
        <n-button
          text
          size="tiny"
          :type="attempt.status === 'success' ? 'success' : 'warning'"
          style="margin-left: 12px"
          @click="emit('select-action-recognition', node, attemptIndex)"
        >
          <template #icon>
            <check-circle-outlined v-if="attempt.status === 'success'" />
            <close-circle-outlined v-else />
          </template>
          [RecNode] {{ attempt.name }}
        </n-button>
      </li>

      <li
        v-for="row in flowRows"
        :key="`tree-row-${row.item.id}`"
        class="tree-item"
      >
        <n-flex align="center" style="gap: 4px">
          <span
            v-if="row.hasChildren"
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !row.expanded }"
            :style="{ marginLeft: `${row.depth * 12}px` }"
            @click.stop="toggleFlowItemExpand(row.item.id)"
          />
          <span
            v-else
            class="tree-toggle-placeholder"
            :style="{ marginLeft: `${row.depth * 12}px` }"
          />
          <n-button
            text
            size="tiny"
            :type="getFlowItemButtonType(row.item)"
            style="margin-left: 12px"
            @click="emit('select-flow-item', node, row.item.id)"
          >
            <template #icon>
              <check-circle-outlined v-if="row.item.status === 'success'" />
              <close-circle-outlined v-else />
            </template>
            [{{ getFlowItemTypeLabel(row.item.type) }}] {{ row.item.name }}
          </n-button>
        </n-flex>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.tree-view {
  font-size: 13px;
}

.tree-toggle {
  display: inline-block;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 5px 0 5px 8px;
  border-color: transparent transparent transparent currentColor;
  cursor: pointer;
  transition: transform 0.2s;
  transform: rotate(90deg);
  flex-shrink: 0;
}

.tree-toggle-collapsed {
  transform: rotate(0deg);
}

.tree-toggle-placeholder {
  display: inline-block;
  width: 8px;
  height: 10px;
  flex-shrink: 0;
}

.tree-list {
  list-style: none;
  margin: 0;
  padding-left: 16px;
  position: relative;
}

.tree-list::before {
  content: '';
  position: absolute;
  left: 4px;
  top: 0;
  bottom: 12px;
  border-left: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.12));
}

.tree-item {
  position: relative;
  padding: 2px 0;
  padding-left: 8px;
}

.tree-item::before {
  content: '';
  position: absolute;
  left: -12px;
  top: 12px;
  width: 12px;
  border-bottom: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.12));
}

.tree-item-round-separator {
  padding-top: 6px;
  padding-bottom: 4px;
}

.tree-item-round-separator::before {
  border-bottom: none;
}

.tree-round-separator-text {
  display: block;
  font-size: 12px;
  text-align: center;
  letter-spacing: 0.5px;
  opacity: 0.9;
}
</style>
