<script setup lang="ts">
import { computed, toRef } from 'vue'
import { NCard, NButton, NFlex, NText } from 'naive-ui'
import type { NodeInfo, MergedRecognitionItem } from '../types'
import { resolveImageSrcPath } from '../utils/imageSrc'
import { getFlowItemButtonType, getFlowItemShortLabel } from '../utils/flowLabels'
import TaskDocHoverPopover from './TaskDocHoverPopover.vue'
import SafePreviewImage from './SafePreviewImage.vue'
import StatusIcon from './StatusIcon.vue'
import { useNodeCardFlowRows } from './nodeCard/useNodeCardFlowRows'
import { useFlowItemExpandState } from './nodeCard/useFlowItemExpandState'
import { buildRecognitionItemKey } from './nodeCard/recognitionListKeys'

const emit = defineEmits<{
  'select-action': [node: NodeInfo]
  'select-recognition': [node: NodeInfo, attemptIndex: number]
  'select-flow-item': [node: NodeInfo, flowItemId: string]
  'toggle-recognition': []
  'toggle-action': []
  'toggle-nested': [attemptIndex: number]
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
  getButtonType: (status: string) => 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  actionButtonType: 'default' | 'primary' | 'info' | 'success' | 'warning' | 'error'
  isVscodeLaunchEmbed?: boolean
  bridgeRequestTaskDoc?: ((task: string) => Promise<string | null>) | null
}>()

const DETAIL_INDENT_PX = 14

const toDetailOffset = (depth: number): string => `${depth * DETAIL_INDENT_PX}px`

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
  isExpanded: isActionFlowItemExpanded,
  toggle: toggleActionFlowItem,
} = useFlowItemExpandState({
  forceExpand: forceExpandRelatedWhileRunning,
  defaultCollapsed: toRef(props, 'defaultCollapseNestedActionNodes'),
  resetWhen: nodeId,
})

const {
  actionTimelineRows,
  getRecognitionNestedRows,
  hasRecognitionNestedRows,
  formatWaitFreezesMeta,
  getActionTimelineItemDisplayName,
  hasActionSection,
} = useNodeCardFlowRows({
  node: toRef(props, 'node'),
  isActionFlowItemExpanded,
  isRecognitionNestedFlowItemExpanded: isNestedRecognitionFlowItemExpanded,
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
          <n-text
            v-if="item.isRoundSeparator && recognitionExpanded"
            depth="3"
            class="round-separator"
          >
            {{ item.name }}
          </n-text>

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

          <template v-else-if="recognitionExpanded || item.status === 'success' || item.status === 'running'">
            <n-flex align="center" style="gap: 8px; align-self: flex-start">
              <task-doc-hover-popover
                :enabled="isVscodeLaunchEmbed === true"
                :request-task-doc="bridgeRequestTaskDoc"
                :task-name="item.attempt?.name ?? item.name"
              >
                <n-button
                  size="small"
                  :type="getButtonType(item.status)"
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
              >
                {{ isExpanded(item.attemptIndex) ? 'Hide' : 'Show' }}
              </n-button>
            </n-flex>

            <n-flex
              v-if="item.attempt?.vision_image || item.attempt?.error_image"
              vertical
              style="gap: 8px; align-self: flex-start"
            >
              <safe-preview-image
                v-if="item.attempt?.vision_image"
                :src="resolveImageSrcPath(item.attempt.vision_image)"
                width="200"
                style="border-radius: 4px"
              />
              <safe-preview-image
                v-if="item.attempt?.error_image"
                :src="resolveImageSrcPath(item.attempt.error_image)"
                width="200"
                style="border-radius: 4px"
              />
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
                      :type="getFlowItemButtonType(nested.item)"
                      ghost
                      @click="emit('select-flow-item', node, nested.item.id)"
                    >
                      <template #icon>
                        <status-icon :status="nested.item.status" />
                      </template>
                      <template v-if="nested.item.type === 'wait_freezes'">
                        [{{ waitFreezesShortLabel }}] {{ nested.item.name }}{{ formatWaitFreezesMeta(nested.item) }}
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
                  >
                    {{ nested.expanded ? 'Hide' : 'Show' }}
                  </n-button>
                </n-flex>

                <n-flex
                  v-if="nested.item.type === 'recognition_node' && (nested.item.vision_image || nested.item.error_image)"
                  vertical
                  style="gap: 8px"
                  :style="{ marginLeft: `${nested.depth * DETAIL_INDENT_PX + 24}px` }"
                >
                  <safe-preview-image
                    v-if="nested.item.vision_image"
                    :src="resolveImageSrcPath(nested.item.vision_image)"
                    width="180"
                    style="border-radius: 4px"
                  />
                  <safe-preview-image
                    v-if="nested.item.error_image"
                    :src="resolveImageSrcPath(nested.item.error_image)"
                    width="180"
                    style="border-radius: 4px"
                  />
                </n-flex>

                <n-flex
                  v-if="nested.item.type === 'wait_freezes' && nested.item.wait_freezes_details?.images && nested.item.wait_freezes_details.images.length > 0"
                  vertical
                  style="gap: 8px"
                  :style="{ marginLeft: `${nested.depth * DETAIL_INDENT_PX + 24}px` }"
                >
                  <safe-preview-image
                    v-for="(img, imgIndex) in nested.item.wait_freezes_details.images"
                    :key="`nested-wf-img-${nested.item.id}-${imgIndex}`"
                    :src="resolveImageSrcPath(img)"
                    width="180"
                    style="border-radius: 4px"
                  />
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
        >
          {{ actionExpanded ? 'Hide' : 'Show' }}
        </n-button>
      </n-flex>
    </template>

    <n-flex vertical style="gap: 10px">
      <n-flex
        v-if="actionExpanded && actionTimelineRows.length > 0"
        vertical
        style="gap: 8px"
      >
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
                :type="getFlowItemButtonType(row.item)"
                ghost
                @click="emit('select-flow-item', node, row.item.id)"
              >
                <template #icon>
                  <status-icon :status="row.item.status" />
                </template>
                <template v-if="row.item.type === 'wait_freezes'">
                  [{{ waitFreezesShortLabel }}] {{ row.item.name }}{{ formatWaitFreezesMeta(row.item) }}
                </template>
                <template v-else>
                  [{{ getFlowItemShortLabel(row.item.type) }}] {{ getActionTimelineItemDisplayName(row.item) }}
                </template>
              </n-button>
            </task-doc-hover-popover>
            <n-button
              v-if="row.hasChildren"
              size="small"
              class="fixed-toggle-button"
              @click.stop="toggleActionFlowItem(row.item.id)"
            >
              {{ row.expanded ? 'Hide' : 'Show' }}
            </n-button>
          </n-flex>

          <n-flex
            v-if="row.item.type === 'wait_freezes' && row.item.wait_freezes_details?.images && row.item.wait_freezes_details.images.length > 0"
            vertical
            style="gap: 8px; align-self: flex-start"
            :style="{ marginLeft: `${row.depth * DETAIL_INDENT_PX + 24}px` }"
          >
            <safe-preview-image
              v-for="(img, idx) in row.item.wait_freezes_details.images"
              :key="`detailed-wf-img-${row.item.id}-${idx}`"
              :src="resolveImageSrcPath(img)"
              width="200"
              style="border-radius: 4px"
            />
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

.fixed-toggle-button {
  width: 56px;
}

.recognition-item-fragment {
  display: contents;
}
</style>
