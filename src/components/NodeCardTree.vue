<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@vicons/antd'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { buildNodeActionFlowItems, buildNodeActionLevelRecognitionItems, buildNodeActionRootItem } from '../utils/nodeFlow'
import { getFlowItemButtonType, getFlowItemShortLabel } from '../utils/flowLabels'
import { flattenFlowItems, flattenNestedRecognitionNodes } from '../utils/flowTree'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded?: boolean
  actionExpanded?: boolean
  defaultCollapseNestedRecognition?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded?: (attemptIndex: number) => boolean
  forceExpandRelatedWhileRunning?: boolean
}>()

const emit = defineEmits<{
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

const TREE_INDENT_PX = 12

const toTreeOffset = (depth: number): string => `${depth * TREE_INDENT_PX}px`

const isRecognitionNestedExpanded = (attemptIndex: number): boolean => {
  if (props.isExpanded) return props.isExpanded(attemptIndex)
  return true
}

const expandedNestedRecognitionItems = ref<Map<string, boolean>>(new Map())

const isNestedRecognitionFlowItemExpanded = (flowItemId: string): boolean => {
  if (props.forceExpandRelatedWhileRunning) return true
  const value = expandedNestedRecognitionItems.value.get(flowItemId)
  if (value !== undefined) return value
  return !(props.defaultCollapseNestedRecognition ?? true)
}

const toggleNestedRecognitionFlowItemExpand = (flowItemId: string) => {
  expandedNestedRecognitionItems.value.set(flowItemId, !isNestedRecognitionFlowItemExpanded(flowItemId))
}

const expandedFlowItems = ref<Map<string, boolean>>(new Map())

const isFlowItemExpanded = (flowItemId: string): boolean => {
  if (props.forceExpandRelatedWhileRunning) return true
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

const resetNestedRecognitionExpandState = () => {
  expandedNestedRecognitionItems.value.clear()
}

watch(() => props.node.node_id, resetFlowItemExpandState, { flush: 'sync' })
watch(() => props.defaultCollapseNestedActionNodes, resetFlowItemExpandState, { flush: 'sync' })
watch(() => props.node.node_id, resetNestedRecognitionExpandState, { flush: 'sync' })
watch(() => props.defaultCollapseNestedRecognition, resetNestedRecognitionExpandState, { flush: 'sync' })

const actionLevelRecognitionItems = computed(() => buildNodeActionLevelRecognitionItems(props.node))
const taskFlowItems = computed(() =>
  buildNodeActionFlowItems(props.node).filter(item => item.type !== 'recognition_node')
)
const actionRootItem = computed(() => buildNodeActionRootItem(props.node))
const flowRows = computed(() => flattenFlowItems(taskFlowItems.value, isFlowItemExpanded))
const isRecognitionExpanded = computed(() => props.recognitionExpanded ?? true)
const isActionExpanded = computed(() => props.actionExpanded ?? true)
const hasActionNestedChildren = computed(() => actionLevelRecognitionItems.value.length > 0 || flowRows.value.length > 0)
const actionStatus = computed(() => {
  if (actionRootItem.value) return actionRootItem.value.status
  if (props.node.status === 'running' && props.node.action_details) return 'running'
  if (!props.node.action_details) return null
  return props.node.action_details.success ? 'success' : 'failed'
})
const actionName = computed(() => {
  if (actionRootItem.value) return actionRootItem.value.name
  return props.node.action_details?.name ?? ''
})

const getRecognitionButtonType = (status: MergedRecognitionItem['status']): 'success' | 'warning' | 'info' | 'default' => {
  if (status === 'success') return 'success'
  if (status === 'running') return 'info'
  if (status === 'failed') return 'warning'
  return 'default'
}

const recognitionNodeShortLabel = getFlowItemShortLabel('recognition_node')
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
        <template v-else>
          <n-flex align="center" style="gap: 4px">
            <span
              v-if="item.hasNestedNodes && item.attemptIndex != null"
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isRecognitionNestedExpanded(item.attemptIndex) }"
              @click.stop="emit('toggle-nested', item.attemptIndex)"
            />
            <span v-else class="tree-toggle-placeholder" />
            <n-button
              v-if="item.status === 'not-recognized'"
              text
              size="tiny"
              type="default"
              disabled
              style="opacity: 0.5"
            >
              {{ item.name }}
            </n-button>
            <n-button
              v-else
              text
              size="tiny"
              :type="getRecognitionButtonType(item.status)"
              @click="item.attemptIndex != null ? emit('select-recognition', node, item.attemptIndex) : undefined"
            >
              <template #icon>
                <check-circle-outlined v-if="item.status === 'success'" />
                <loading-outlined v-else-if="item.status === 'running'" />
                <close-circle-outlined v-else />
              </template>
              {{ item.name }}
            </n-button>
          </n-flex>

          <ul
            v-if="item.hasNestedNodes && item.attemptIndex != null && isRecognitionNestedExpanded(item.attemptIndex) && item.attempt?.nested_nodes && item.attempt.nested_nodes.length > 0"
            class="tree-list"
          >
            <li
              v-for="nested in flattenNestedRecognitionNodes(item.attempt.nested_nodes, `node.recognition.${item.attemptIndex}`, isNestedRecognitionFlowItemExpanded)"
              :key="`tree-rec-nested-${item.attemptIndex}-${nested.flowItemId}`"
              class="tree-item"
              :style="{ '--tree-item-offset': toTreeOffset(nested.depth) }"
            >
              <n-flex align="center" style="gap: 4px">
                <span
                  v-if="nested.hasChildren"
                  class="tree-toggle"
                  :class="{ 'tree-toggle-collapsed': !nested.expanded }"
                  :style="{ marginLeft: toTreeOffset(nested.depth) }"
                  @click.stop="toggleNestedRecognitionFlowItemExpand(nested.flowItemId)"
                />
                <span
                  v-else
                  class="tree-toggle-placeholder"
                  :style="{ marginLeft: toTreeOffset(nested.depth) }"
                />
                <n-button
                  text
                  size="tiny"
                  :type="nested.attempt.status === 'success' ? 'success' : nested.attempt.status === 'running' ? 'info' : 'warning'"
                  @click="emit('select-flow-item', node, nested.flowItemId)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                    <loading-outlined v-else-if="nested.attempt.status === 'running'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ recognitionNodeShortLabel }} · {{ nested.attempt.name }}
                </n-button>
              </n-flex>
            </li>
          </ul>
        </template>
      </li>
    </ul>

    <div style="margin-top: 4px">
      <n-flex align="center" style="gap: 4px">
        <span class="tree-toggle tree-toggle-hidden" />
        <n-text depth="3" style="font-size: 12px;">Action</n-text>
      </n-flex>
    </div>

    <ul v-if="actionStatus" class="tree-list">
      <li class="tree-item">
        <n-flex align="center" style="gap: 4px">
          <span
            v-if="hasActionNestedChildren"
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
            @click="emit('toggle-action')"
          />
          <span v-else class="tree-toggle-placeholder" />
          <n-button
            text
            size="tiny"
            :type="actionStatus === 'success' ? 'success' : actionStatus === 'running' ? 'warning' : 'error'"
            @click="actionRootItem ? emit('select-flow-item', node, actionRootItem.id) : emit('select-action', node)"
          >
            <template #icon>
              <check-circle-outlined v-if="actionStatus === 'success'" />
              <loading-outlined v-else-if="actionStatus === 'running'" />
              <close-circle-outlined v-else />
            </template>
            {{ actionName }}
          </n-button>
        </n-flex>

        <ul v-if="isActionExpanded && hasActionNestedChildren" class="tree-list">
          <li
            v-for="item in actionLevelRecognitionItems"
            :key="`tree-action-reco-${item.id}`"
            class="tree-item"
            style="--tree-item-offset: 0px"
          >
            <n-flex align="center" style="gap: 4px">
              <span class="tree-toggle-placeholder" style="margin-left: 0px" />
              <n-button
                text
                size="tiny"
                :type="item.status === 'success' ? 'success' : item.status === 'running' ? 'info' : 'warning'"
                @click="emit('select-flow-item', node, item.id)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <loading-outlined v-else-if="item.status === 'running'" />
                  <close-circle-outlined v-else />
                </template>
                {{ recognitionNodeShortLabel }} · {{ item.name }}
              </n-button>
            </n-flex>
          </li>

          <li
            v-for="row in flowRows"
            :key="`tree-row-${row.item.id}`"
            class="tree-item"
            :style="{ '--tree-item-offset': toTreeOffset(row.depth) }"
          >
            <n-flex align="center" style="gap: 4px">
              <span
                v-if="row.hasChildren"
                class="tree-toggle"
                :class="{ 'tree-toggle-collapsed': !row.expanded }"
                :style="{ marginLeft: toTreeOffset(row.depth) }"
                @click.stop="toggleFlowItemExpand(row.item.id)"
              />
              <span
                v-else
                class="tree-toggle-placeholder"
                :style="{ marginLeft: toTreeOffset(row.depth) }"
              />
              <n-button
                text
                size="tiny"
                :type="getFlowItemButtonType(row.item)"
                @click="emit('select-flow-item', node, row.item.id)"
              >
                <template #icon>
                  <check-circle-outlined v-if="row.item.status === 'success'" />
                  <loading-outlined v-else-if="row.item.status === 'running'" />
                  <close-circle-outlined v-else />
                </template>
                {{ getFlowItemShortLabel(row.item.type) }} · {{ row.item.name }}
              </n-button>
            </n-flex>
          </li>
        </ul>
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

.tree-toggle-hidden {
  visibility: hidden;
  pointer-events: none;
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
  width: calc(12px + var(--tree-item-offset, 0px));
  border-bottom: 1px solid var(--n-border-color, rgba(255, 255, 255, 0.12));
}

.tree-round-separator-text {
  display: block;
  font-size: 12px;
  text-align: center;
  letter-spacing: 0.5px;
  opacity: 0.9;
}
</style>
