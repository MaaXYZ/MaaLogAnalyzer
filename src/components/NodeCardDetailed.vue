<script setup lang="ts">
import { computed, toRef } from 'vue'
import { NCard, NButton, NFlex, NText } from 'naive-ui'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { getFlowItemButtonType, getFlowItemShortLabel } from '../utils/flowLabels'
import TaskDocHoverPopover from './TaskDocHoverPopover.vue'
import StatusIcon from './StatusIcon.vue'
import { useNodeCardFlowSectionState } from './nodeCard/useNodeCardFlowSectionState'
import { buildRecognitionItemKey } from './nodeCard/recognitionListKeys'
import { resolveStatusButtonType } from './nodeCard/statusButtonType'

const emit = defineEmits<{
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
  'toggle-unrecognized-round': [roundIndex: number]
}>()

const props = defineProps<{
  node: NodeInfo
  mergedRecognitionList: MergedRecognitionItem[]
  recognitionExpanded: boolean
  actionExpanded: boolean
  defaultCollapseNestedRecognition?: boolean
  defaultCollapseNestedActionNodes?: boolean
  isExpanded: (attemptIndex: number) => boolean
  forceExpandRelatedWhileRunning?: boolean
  fullyUnrecognizedRoundIndexes?: ReadonlySet<number>
  isUnrecognizedRoundExpanded?: (roundIndex: number) => boolean
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
}>()

const DETAIL_INDENT_PX = 14

const toDetailOffset = (depth: number): string => `${depth * DETAIL_INDENT_PX}px`

const {
  toggleNestedRecognitionFlowItemExpand,
  toggleActionFlowItem,
  actionTimelineRows,
  getRecognitionNestedRows,
  hasRecognitionNestedRows,
  formatWaitFreezesMeta,
  getActionTimelineItemDisplayName,
  hasActionSection,
} = useNodeCardFlowSectionState({
  node: toRef(props, 'node'),
  defaultCollapseNestedRecognition: toRef(props, 'defaultCollapseNestedRecognition'),
  defaultCollapseNestedActionNodes: toRef(props, 'defaultCollapseNestedActionNodes'),
  forceExpandRelatedWhileRunning: toRef(props, 'forceExpandRelatedWhileRunning'),
})

const hasRecognitionSection = computed(() => props.mergedRecognitionList.length > 0)

const recognitionNodeShortLabel = getFlowItemShortLabel('recognition_node')
const waitFreezesShortLabel = getFlowItemShortLabel('wait_freezes')
</script>

<template>
  <n-card v-if="hasRecognitionSection" key="recognition-section" size="small">
    <template #header>
      <n-flex align="center" style="gap: 8px">
        <span>Recognition</span>
        <n-button
          size="small"
          class="fixed-toggle-button"
          @click="emit('toggle-recognition')"
          @mousedown.prevent
        >
          {{ recognitionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>
    </template>

    <n-flex vertical style="gap: 8px">
      <div
        v-for="(item, idx) in mergedRecognitionList"
        :key="buildRecognitionItemKey(item, idx)"
        class="recognition-item-fragment"
      >
        <div
          v-if="item.isRoundSeparator && recognitionExpanded"
          class="round-separator round-separator-row"
        >
          <n-text depth="3">{{ item.name }}</n-text>
          <n-button
            v-if="item.roundIndex != null && fullyUnrecognizedRoundIndexes?.has(item.roundIndex)"
            size="small"
            class="fixed-toggle-button round-separator-toggle"
            @click="emit('toggle-unrecognized-round', item.roundIndex)"
            @mousedown.prevent
          >
            {{ isUnrecognizedRoundExpanded?.(item.roundIndex!) ? 'Hide' : 'Show' }}
          </n-button>
        </div>

        <n-button
          v-else-if="recognitionExpanded && item.status === 'not-recognized'"
          size="small"
          type="default"
          ghost
          disabled
          style="align-self: flex-start; opacity: 0.5"
        >
          <template #icon>
            <status-icon status="not-recognized" />
          </template>
          {{ item.name }}
        </n-button>

        <template
          v-else-if="recognitionExpanded || item.status === 'success' || item.status === 'running'"
        >
          <n-flex align="center" style="gap: 8px; align-self: flex-start">
            <task-doc-hover-popover
              :enabled="isVscodeLaunchEmbed === true"
              :request-task-doc="bridgeRequestTaskDoc"
              :task-name="item.attempt?.name ?? item.name"
            >
              <n-button
                size="small"
                :type="resolveStatusButtonType(item.status)"
                ghost
                @click="emit('select-recognition', node, item.attemptIndex!)"
              >
                <template #icon>
                  <status-icon :status="item.status" />
                </template>
                {{ item.name }}
              </n-button>
            </task-doc-hover-popover>
            <n-button
              v-if="item.attemptIndex != null && hasRecognitionNestedRows(item.attemptIndex)"
              size="small"
              class="fixed-toggle-button"
              @click="emit('toggle-nested', item.attemptIndex)"
              @mousedown.prevent
            >
              {{ isExpanded(item.attemptIndex) ? 'Hide' : 'Show' }}
            </n-button>
          </n-flex>

          <n-flex
            v-if="
              item.attemptIndex != null &&
              hasRecognitionNestedRows(item.attemptIndex) &&
              isExpanded(item.attemptIndex) &&
              getRecognitionNestedRows(item.attemptIndex).length > 0
            "
            vertical
            style="gap: 8px"
          >
            <template
              v-for="nested in getRecognitionNestedRows(item.attemptIndex)"
              :key="`nested-${item.attemptIndex}-${nested.item.id}`"
            >
              <n-flex
                align="center"
                style="gap: 8px"
                :style="{ marginLeft: toDetailOffset(nested.depth) }"
              >
                <task-doc-hover-popover
                  :enabled="isVscodeLaunchEmbed === true"
                  :request-task-doc="bridgeRequestTaskDoc"
                  :task-name="nested.item.name"
                >
                  <n-button
                    size="small"
                    class="flow-item-button"
                    :type="getFlowItemButtonType(nested.item)"
                    ghost
                    @click="emit('select-flow-item', node, nested.item.id)"
                  >
                    <template #icon>
                      <status-icon :status="nested.item.status" />
                    </template>
                    <template v-if="nested.item.type === 'wait_freezes'">
                      [{{ waitFreezesShortLabel }}] {{ nested.item.name
                      }}{{ formatWaitFreezesMeta(nested.item) }}
                    </template>
                    <template v-else-if="nested.item.type === 'recognition_node'">
                      [{{ recognitionNodeShortLabel }}] {{ nested.item.name }}
                    </template>
                    <template v-else>
                      [{{ getFlowItemShortLabel(nested.item.type) }}] {{ nested.item.name }}
                    </template>
                  </n-button>
                </task-doc-hover-popover>
                <n-button
                  v-if="nested.hasChildren"
                  size="small"
                  class="fixed-toggle-button"
                  @click.stop="toggleNestedRecognitionFlowItemExpand(nested.item.id)"
                  @mousedown.prevent
                >
                  {{ nested.expanded ? 'Hide' : 'Show' }}
                </n-button>
              </n-flex>
            </template>
          </n-flex>
        </template>
      </div>
    </n-flex>
  </n-card>

  <n-card v-if="hasActionSection" key="action-section" size="small">
    <template #header>
      <n-flex align="center" style="gap: 8px">
        <span>Action</span>
        <n-button
          v-if="actionTimelineRows.length > 0"
          size="small"
          class="fixed-toggle-button"
          @click="emit('toggle-action')"
          @mousedown.prevent
        >
          {{ actionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>
    </template>

    <n-flex vertical style="gap: 10px">
      <n-flex v-if="actionExpanded && actionTimelineRows.length > 0" vertical style="gap: 8px">
        <n-flex
          v-for="(row, rowIndex) in actionTimelineRows"
          :key="`detailed-flow-${rowIndex}-${row.item.id}`"
          vertical
          style="gap: 8px"
        >
          <n-flex
            align="center"
            style="gap: 8px"
            :style="{ marginLeft: toDetailOffset(row.depth) }"
          >
            <task-doc-hover-popover
              :enabled="isVscodeLaunchEmbed === true"
              :request-task-doc="bridgeRequestTaskDoc"
              :task-name="row.item.name"
            >
              <n-button
                size="small"
                class="flow-item-button"
                :type="getFlowItemButtonType(row.item)"
                ghost
                @click="emit('select-flow-item', node, row.item.id)"
              >
                <template #icon>
                  <status-icon :status="row.item.status" />
                </template>
                <template v-if="row.item.type === 'wait_freezes'">
                  [{{ waitFreezesShortLabel }}] {{ row.item.name
                  }}{{ formatWaitFreezesMeta(row.item) }}
                </template>
                <template v-else>
                  [{{ getFlowItemShortLabel(row.item.type) }}]
                  {{ getActionTimelineItemDisplayName(row.item) }}
                </template>
              </n-button>
            </task-doc-hover-popover>
            <n-button
              v-if="row.hasChildren"
              size="small"
              class="fixed-toggle-button"
              @click.stop="toggleActionFlowItem(row.item.id)"
              @mousedown.prevent
            >
              {{ row.expanded ? 'Hide' : 'Show' }}
            </n-button>
          </n-flex>
        </n-flex>
      </n-flex>
    </n-flex>
  </n-card>
</template>

<style scoped>
.round-separator {
  display: block;
  width: 100%;
  padding: 4px 0;
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.5px;
}

.round-separator-row {
  position: relative;
}

.round-separator-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
}

.fixed-toggle-button {
  width: 56px;
}

.recognition-item-fragment {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.flow-item-button {
  max-width: 100%;
}

.flow-item-button :deep(.n-button__content) {
  display: inline-block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
