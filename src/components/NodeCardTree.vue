<script setup lang="ts">
import { computed, toRef } from 'vue'
import { NButton, NFlex, NText } from 'naive-ui'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { getFlowItemButtonType, getFlowItemShortLabel } from '../utils/flowLabels'
import TaskDocHoverPopover from './TaskDocHoverPopover.vue'
import StatusIcon from './StatusIcon.vue'
import { useNodeCardFlowRows } from './nodeCard/useNodeCardFlowRows'
import { useFlowItemExpandState } from './nodeCard/useFlowItemExpandState'
import { buildRecognitionItemKey } from './nodeCard/recognitionListKeys'
import { resolveStatusButtonType } from './nodeCard/statusButtonType'

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded?: boolean
  actionExpanded?: boolean
  defaultCollapseNestedRecognition?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded?: (attemptIndex: number) => boolean
  forceExpandRelatedWhileRunning?: boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
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

const nodeId = computed(() => props.node.node_id)
const forceExpandRelatedWhileRunning = toRef(props, 'forceExpandRelatedWhileRunning')

const {
  isExpanded: isNestedRecognitionFlowItemExpanded,
  toggle: toggleNestedRecognitionFlowItemExpand,
} = useFlowItemExpandState({
  forceExpand: forceExpandRelatedWhileRunning,
  defaultCollapsed: toRef(props, 'defaultCollapseNestedRecognition'),
  resetWhen: nodeId,
})

const {
  isExpanded: isFlowItemExpanded,
  toggle: toggleFlowItemExpand,
} = useFlowItemExpandState({
  forceExpand: forceExpandRelatedWhileRunning,
  defaultCollapsed: toRef(props, 'defaultCollapseNestedActionNodes'),
  resetWhen: nodeId,
})

const {
  actionTimelineRows: flowRows,
  getRecognitionNestedRows,
  hasRecognitionNestedRows,
  formatWaitFreezesMeta,
  getActionTimelineItemDisplayName,
  hasActionSection,
  hasActionNestedChildren,
} = useNodeCardFlowRows({
  node: toRef(props, 'node'),
  isActionFlowItemExpanded: isFlowItemExpanded,
  isRecognitionNestedFlowItemExpanded: isNestedRecognitionFlowItemExpanded,
})
const isRecognitionExpanded = computed(() => props.recognitionExpanded ?? true)
const isActionExpanded = computed(() => props.actionExpanded ?? true)

const recognitionNodeShortLabel = getFlowItemShortLabel('recognition_node')
const waitFreezesShortLabel = getFlowItemShortLabel('wait_freezes')
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
      <template
        v-for="(item, index) in mergedRecognitionList"
        :key="`tree-rec-${buildRecognitionItemKey(item, index)}`"
      >
        <li class="tree-item">
          <n-text v-if="item.isRoundSeparator" depth="3" class="tree-round-separator-text">
            {{ item.name }}
          </n-text>
          <template v-else>
            <n-flex align="center" style="gap: 4px">
              <span
                v-if="item.attemptIndex != null && hasRecognitionNestedRows(item.attemptIndex)"
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
                <template #icon>
                  <status-icon status="not-recognized" />
                </template>
                {{ item.name }}
              </n-button>
              <task-doc-hover-popover
                v-else
                :enabled="isVscodeLaunchEmbed === true"
                :request-task-doc="bridgeRequestTaskDoc"
                :task-name="item.attempt?.name ?? item.name"
              >
                <n-button
                  text
                  size="tiny"
                  :type="resolveStatusButtonType(item.status)"
                  @click="item.attemptIndex != null ? emit('select-recognition', node, item.attemptIndex) : undefined"
                >
                  <template #icon>
                    <status-icon :status="item.status" />
                  </template>
                  {{ item.name }}
                </n-button>
              </task-doc-hover-popover>
            </n-flex>
          </template>
        </li>

        <li
          v-for="nested in item.attemptIndex != null && isRecognitionNestedExpanded(item.attemptIndex) ? getRecognitionNestedRows(item.attemptIndex) : []"
          :key="`tree-rec-nested-${buildRecognitionItemKey(item, index)}-${nested.item.id}`"
          class="tree-item"
          :style="{ '--tree-item-offset': toTreeOffset(nested.depth) }"
        >
          <n-flex align="center" style="gap: 4px">
            <span
              v-if="nested.hasChildren"
              class="tree-toggle"
              :class="{ 'tree-toggle-collapsed': !nested.expanded }"
              :style="{ marginLeft: toTreeOffset(nested.depth) }"
              @click.stop="toggleNestedRecognitionFlowItemExpand(nested.item.id)"
            />
            <span
              v-else
              class="tree-toggle-placeholder"
              :style="{ marginLeft: toTreeOffset(nested.depth) }"
            />
            <task-doc-hover-popover
              :enabled="isVscodeLaunchEmbed === true"
              :request-task-doc="bridgeRequestTaskDoc"
              :task-name="nested.item.name"
            >
              <n-button
                text
                size="tiny"
                :type="getFlowItemButtonType(nested.item)"
                @click="emit('select-flow-item', node, nested.item.id)"
              >
                <template #icon>
                  <status-icon :status="nested.item.status" />
                </template>
                <template v-if="nested.item.type === 'wait_freezes'">
                  {{ waitFreezesShortLabel }} · {{ nested.item.name }}{{ formatWaitFreezesMeta(nested.item) }}
                </template>
                <template v-else-if="nested.item.type === 'recognition_node'">
                  {{ recognitionNodeShortLabel }} · {{ nested.item.name }}
                </template>
                <template v-else>
                  {{ getFlowItemShortLabel(nested.item.type) }} · {{ nested.item.name }}
                </template>
              </n-button>
            </task-doc-hover-popover>
          </n-flex>
        </li>
      </template>
    </ul>

    <div v-if="hasActionSection" style="margin-top: 4px">
      <n-flex align="center" style="gap: 4px">
        <span
          v-if="hasActionNestedChildren"
          class="tree-toggle"
          :class="{ 'tree-toggle-collapsed': !isActionExpanded }"
          @click="emit('toggle-action')"
        />
        <span v-else class="tree-toggle-placeholder" />
        <n-text
          depth="3"
          style="font-size: 12px; cursor: pointer"
          @click="hasActionNestedChildren ? emit('toggle-action') : undefined"
        >
          Action
        </n-text>
      </n-flex>
    </div>

    <ul v-if="hasActionSection && isActionExpanded && hasActionNestedChildren" class="tree-list">
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
          <task-doc-hover-popover
            :enabled="isVscodeLaunchEmbed === true"
            :request-task-doc="bridgeRequestTaskDoc"
            :task-name="row.item.name"
          >
            <n-button
              text
              size="tiny"
              :type="getFlowItemButtonType(row.item)"
              @click="emit('select-flow-item', node, row.item.id)"
            >
              <template #icon>
                <status-icon :status="row.item.status" />
              </template>
              <template v-if="row.item.type === 'wait_freezes'">
                {{ waitFreezesShortLabel }} · {{ row.item.name }}{{ formatWaitFreezesMeta(row.item) }}
              </template>
              <template v-else-if="row.item.type === 'recognition_node'">
                {{ recognitionNodeShortLabel }} · {{ row.item.name }}
              </template>
              <template v-else>
                {{ getFlowItemShortLabel(row.item.type) }} · {{ getActionTimelineItemDisplayName(row.item) }}
              </template>
            </n-button>
          </task-doc-hover-popover>
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
