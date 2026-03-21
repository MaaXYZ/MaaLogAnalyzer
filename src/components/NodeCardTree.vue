<script setup lang="ts">
import { computed } from 'vue'
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
  'select-nested': [node: NodeInfo, attemptIndex: number, nestedIndex: number]
  'select-nested-action': [node: NodeInfo, actionIndex: number, nestedIndex: number]
  'select-action-recognition': [node: NodeInfo, attemptIndex: number]
  'select-nested-action-recognition': [node: NodeInfo, actionIndex: number, nestedIndex: number, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
}>()

// 安全访问 isExpanded，提供默认值
const checkExpanded = (attemptIndex: number) => {
  return props.isExpanded ? props.isExpanded(attemptIndex) : true
}

// 安全访问折叠状态
const isRecognitionExpanded = computed(() => props.recognitionExpanded ?? true)
const isActionExpanded = computed(() => props.actionExpanded ?? true)

// action 是否失败（仅看主 action）
const isActionFailed = computed(() => {
  if (props.node.action_details) return !props.node.action_details.success
  return rootActionItems.value[0]?.status === 'failed'
})

const mainActionName = computed(() => {
  return props.node.action_details?.name || rootActionItems.value[0]?.name || 'Action'
})

interface FlattenedNestedRecognition {
  attempt: RecognitionAttempt
  flowItemId: string
  depth: number
}

interface FlattenedFlowItem {
  item: UnifiedFlowItem
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

const flattenFlowItemsForTree = (
  items: UnifiedFlowItem[] | undefined,
  depth = 0
): FlattenedFlowItem[] => {
  if (!items || items.length === 0) return []
  const rows: FlattenedFlowItem[] = []
  for (const item of items) {
    rows.push({ item, depth })
    if (item.children && item.children.length > 0) {
      rows.push(...flattenFlowItemsForTree(item.children, depth + 1))
    }
  }
  return rows
}

const rootFlowItems = computed(() => props.node.flow_items ?? [])

const rootActionItems = computed(() => rootFlowItems.value.filter(item => item.type === 'action'))
const rootTaskItems = computed(() => rootFlowItems.value.filter(item => item.type === 'task'))

const actionFlowRows = computed(() => flattenFlowItemsForTree(rootActionItems.value))
const taskFlowRows = computed(() => flattenFlowItemsForTree(rootTaskItems.value))

const getFlowItemButtonType = (item: UnifiedFlowItem): 'success' | 'warning' | 'error' => {
  if (item.status === 'success') return 'success'
  return item.type === 'recognition' ? 'warning' : 'error'
}

const getFlowItemTypeLabel = (type: UnifiedFlowItem['type']) => {
  if (type === 'recognition') return 'Rec'
  if (type === 'task') return 'Task'
  return 'Action'
}

const handleSelectMainAction = () => {
  const mainAction = rootActionItems.value[0]
  if (mainAction) {
    emit('select-flow-item', props.node, mainAction.id)
    return
  }
  emit('select-action', props.node)
}

const hasActionSectionChildren = computed(() => actionFlowRows.value.length > 0)

const shouldShowActionSectionToggle = computed(() => {
  return hasActionSectionChildren.value
})

const hasRecognitionSection = computed(() => {
  return props.mergedRecognitionList.length > 0
})

const hasTaskSection = computed(() => {
  return taskFlowRows.value.length > 0
})

const hasActionSection = computed(() => {
  return rootActionItems.value.length > 0 || !!props.node.action_details
})

const hasStandaloneTaskSection = computed(() => {
  return hasTaskSection.value && !hasActionSection.value
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

  if (hasRecognitionSection.value) {
    const recoTimestamps = props.node.recognition_attempts.map(attempt => attempt.timestamp)
    sections.push({
      type: 'recognition',
      ts: pickEarliest(recoTimestamps),
    })
  }

  if (hasStandaloneTaskSection.value) {
    const taskTimestamps = rootTaskItems.value.map(item => item.start_timestamp || item.timestamp || item.end_timestamp)
    sections.push({
      type: 'task',
      ts: pickEarliest(taskTimestamps),
    })
  }

  if (hasActionSection.value) {
    const actionTimestamps = rootActionItems.value.map(item => item.start_timestamp || item.timestamp || item.end_timestamp)
    const actionTs = pickEarliest(actionTimestamps.length > 0
      ? actionTimestamps
      : [
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
  <div class="tree-view">
    <template v-for="section in sectionOrder" :key="section">
      <template v-if="section === 'recognition'">
        <n-flex align="center" style="gap: 4px; margin-bottom: 2px">
          <span
            class="tree-toggle"
            :class="{ 'tree-toggle-collapsed': !isRecognitionExpanded }"
            @click="emit('toggle-recognition')"
          />
          <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-recognition')">Recognition</n-text>
        </n-flex>
        <ul v-if="isRecognitionExpanded" class="tree-list">
          <li
            v-for="(item, idx) in mergedRecognitionList"
            :key="`tree-reco-${idx}`"
            :class="['tree-item', item.isRoundSeparator ? 'tree-item-round-separator' : '']"
          >
            <n-text v-if="item.isRoundSeparator" depth="3" class="tree-round-separator-text">
              {{ item.name }}
            </n-text>

            <n-text v-else-if="item.status === 'not-recognized'" depth="3" style="font-size: 12px; opacity: 0.5">{{ item.name }}</n-text>

            <template v-else-if="!item.hasNestedNodes">
              <n-button
                text
                size="tiny"
                :type="item.status === 'success' ? 'success' : 'warning'"
                @click="emit('select-recognition', node, item.attemptIndex!)"
              >
                <template #icon>
                  <check-circle-outlined v-if="item.status === 'success'" />
                  <close-circle-outlined v-else />
                </template>
                {{ item.name }}
              </n-button>
            </template>

            <template v-else>
              <n-flex align="center" style="gap: 4px">
                <span
                  class="tree-toggle"
                  :class="{ 'tree-toggle-collapsed': !checkExpanded(item.attemptIndex!) }"
                  @click="emit('toggle-nested', item.attemptIndex!)"
                />
                <n-button
                  text
                  size="tiny"
                  :type="item.status === 'success' ? 'success' : 'warning'"
                  @click="emit('select-recognition', node, item.attemptIndex!)"
                >
                  <template #icon>
                    <check-circle-outlined v-if="item.status === 'success'" />
                    <close-circle-outlined v-else />
                  </template>
                  {{ item.name }}
                </n-button>
              </n-flex>

              <ul v-if="checkExpanded(item.attemptIndex!)" class="tree-list">
                <li
                  v-for="nested in flattenNestedRecognitionNodes(item.attempt!.nested_nodes, `node.recognition.${item.attemptIndex!}`)"
                  :key="`tree-nested-${idx}-${nested.flowItemId}`"
                  class="tree-item"
                >
                  <n-button
                    text
                    size="tiny"
                    :type="nested.attempt.status === 'success' ? 'success' : 'warning'"
                    :style="{ marginLeft: `${(nested.depth - 1) * 12}px` }"
                    @click="emit('select-flow-item', node, nested.flowItemId)"
                  >
                    <template #icon>
                      <check-circle-outlined v-if="nested.attempt.status === 'success'" />
                      <close-circle-outlined v-else />
                    </template>
                    {{ nested.attempt.name }}
                  </n-button>
                </li>
              </ul>
            </template>
          </li>

        </ul>
      </template>

      <template v-else-if="section === 'task'">
        <div style="margin-top: 4px">
          <n-flex align="center" style="gap: 4px">
            <span
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
              @click="emit('toggle-action')"
            />
            <n-text depth="3" style="font-size: 12px; cursor: pointer" @click="emit('toggle-action')">Task</n-text>
          </n-flex>
        </div>

        <ul v-if="isActionExpanded && taskFlowRows.length > 0" class="tree-list">
          <li
            v-for="row in taskFlowRows"
            :key="`tree-task-row-${row.item.id}`"
            class="tree-item"
          >
            <n-button
              text
              size="tiny"
              :type="getFlowItemButtonType(row.item)"
              :style="{ marginLeft: `${row.depth * 12}px` }"
              @click="emit('select-flow-item', node, row.item.id)"
            >
              <template #icon>
                <check-circle-outlined v-if="row.item.status === 'success'" />
                <close-circle-outlined v-else />
              </template>
              [{{ getFlowItemTypeLabel(row.item.type) }}] {{ row.item.name }}
            </n-button>
          </li>
        </ul>
      </template>

      <template v-else-if="section === 'action'">
        <div style="margin-top: 4px">
          <n-flex align="center" style="gap: 4px">
            <span
              v-if="shouldShowActionSectionToggle"
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
              @click="emit('toggle-action')"
            />
            <n-text depth="3" style="font-size: 12px">Action:</n-text>
            <n-button
              text
              size="tiny"
              :type="isActionFailed ? 'error' : 'success'"
              @click="handleSelectMainAction"
            >
              <template #icon>
                <check-circle-outlined v-if="!isActionFailed" />
                <close-circle-outlined v-else />
              </template>
              {{ mainActionName }}
            </n-button>
          </n-flex>
        </div>
        <ul
          v-if="isActionExpanded && actionFlowRows.length > 0"
          class="tree-list"
        >
          <li
            v-for="row in actionFlowRows"
            :key="`tree-action-row-${row.item.id}`"
            class="tree-item"
          >
            <n-button
              text
              size="tiny"
              :type="getFlowItemButtonType(row.item)"
              :style="{ marginLeft: `${row.depth * 12}px` }"
              @click="emit('select-flow-item', node, row.item.id)"
            >
              <template #icon>
                <check-circle-outlined v-if="row.item.status === 'success'" />
                <close-circle-outlined v-else />
              </template>
              [{{ getFlowItemTypeLabel(row.item.type) }}] {{ row.item.name }}
            </n-button>
          </li>
        </ul>
      </template>
    </template>
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
